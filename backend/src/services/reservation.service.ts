// ReservaService (SAD 3.1): crea, consulta, modifica y cancela reservas (RF-03 a RF-06);
// valida RN-01 y RN-02 y genera el código único. Las reglas puras viven en business-rules.ts;
// aquí se aplican dentro de la transacción, con el destino bloqueado (SAD 3.2).

import { randomInt } from 'node:crypto';
import { AppError } from '../errors/app-error';
import type { PaymentStatus } from '../models/payment.entity';
import type { ReservationStatus } from '../models/reservation.entity';
import {
  CONFIRMATION_CODE_ALPHABET,
  CONFIRMATION_CODE_LENGTH,
  CONFIRMATION_CODE_PREFIX,
  type CreateReservationInput,
  type LookupReservationInput,
} from '../models/reservation.schema';
import type { DestinationRepository } from '../repositories/destination.repository';
import type {
  InsertedReservation,
  ReservationDetails,
  ReservationRepository,
} from '../repositories/reservation.repository';
import {
  calculateQuote,
  capacityConflict,
  hasCapacity,
  isFutureTravelDate,
  UNAVAILABLE_MESSAGE,
  type Quote,
} from './business-rules';
import type { PaymentGateway } from './payment-gateway';

// Intentos si el código generado ya existiera (casi imposible)
const MAX_CODE_ATTEMPTS = 3;
// Mensaje de CU-03 6a (decisión 2 = A: 402 PAYMENT_DECLINED)
const PAYMENT_DECLINED_MESSAGE = 'El pago fue rechazado. Intenta con otra tarjeta.';
// NUEVO (6.D): mensaje exacto de CU-04 5a. Es el mismo si el código no existe, si el correo no
// coincide o si la reserva está cancelada: así no se revela cuál de los datos estaba bien.
const LOOKUP_NOT_FOUND_MESSAGE = 'No se encontró una reserva activa que coincida con los datos';

// Genera un código de confirmación con aleatoriedad criptográfica (como SecureRandom).
// Ejemplo: "VY-7K3M9QXT". Math.random() NO sirve: es predecible.
// CAMBIO (6.D): el prefijo, el largo y el alfabeto vienen de reservation.schema.ts, los mismos
// que usa la consulta para validar el código.
export function generateConfirmationCode(): string {
  let code = CONFIRMATION_CODE_PREFIX;
  for (let i = 0; i < CONFIRMATION_CODE_LENGTH; i++) {
    // randomInt(31) da un entero de 0 a 30, sin sesgo
    code += CONFIRMATION_CODE_ALPHABET.charAt(randomInt(CONFIRMATION_CODE_ALPHABET.length));
  }
  return code;
}

// Lo que el servicio necesita de los repositorios dentro de la transacción.
// Solo esos métodos: así las pruebas pueden pasar repositorios falsos (decisión 7 = B).
// CAMBIO (6.D): se agrega findActiveByCodeAndEmail para la consulta.
export interface ReservationStores {
  destinations: Pick<DestinationRepository, 'findByIdForUpdate' | 'reservedPeopleOn'>;
  reservations: Pick<ReservationRepository, 'insertIfNewCode' | 'insertPayment' | 'findActiveByCodeAndEmail'>;
}

// Abre una transacción, le entrega a "work" los repositorios que trabajan dentro de ella,
// y confirma (commit) si work termina bien o revierte (rollback) si lanza un error.
// En la app real es AppDataSource.transaction (ver app.ts); en las pruebas, una función falsa.
export type RunInTransaction = <T>(work: (stores: ReservationStores) => Promise<T>) => Promise<T>;

// Respuesta de POST /reservas (decisión 6 = A) y de POST /reservas/consulta (decisión 11 = A):
// CU-03 paso 9 y CU-04 paso 6, "toda la información" de la reserva
export interface ReservationResult {
  code: string;
  status: ReservationStatus;
  destination: { id: number; name: string; place: string };
  travelDate: string;
  customerName: string;
  customerEmail: string;
  quote: Quote;
  payment: { status: PaymentStatus; cardLastDigit: number };
  createdAt: Date;
}

// Lo que devuelve create(): la respuesta para el turista y el id interno (solo para el log)
export interface CreatedReservation {
  reservationId: number;
  reservation: ReservationResult;
}

// NUEVO (6.D): ÚNICA función que arma la respuesta de una reserva (decisión 11 = A, C17).
// La usan create() y lookup(): si mañana se agrega un campo, se cambia solo aquí.
// Recibe los datos sueltos y agrupa el desglose de la tarifa en el bloque "quote".
// Ejemplo: { ..., people: 2, basePrice: '47500.00', subtotal: '95000.00', ... }
//   → { ..., quote: { basePrice: '47500.00', people: 2, subtotal: '95000.00', iva, total }, ... }
function buildReservationResult(details: ReservationDetails): ReservationResult {
  return {
    code: details.code,
    status: details.status,
    destination: details.destination,
    travelDate: details.travelDate,
    customerName: details.customerName,
    customerEmail: details.customerEmail,
    quote: {
      basePrice: details.basePrice,
      people: details.people,
      subtotal: details.subtotal,
      iva: details.iva,
      total: details.total,
    },
    payment: details.payment,
    createdAt: details.createdAt,
  };
}

export class ReservationService {
  constructor(
    private readonly runInTransaction: RunInTransaction,
    private readonly gateway: PaymentGateway,
    // Se puede cambiar en las pruebas para simular un código repetido
    private readonly generateCode: () => string = generateConfirmationCode,
  ) {}

  // CU-03 (flujo del SAD 3.2): fecha futura → transacción → bloquear destino → activo →
  // cupo (RN-01) → tarifa (RN-03) → cobro (RN-04) → código + reserva + pago → commit.
  // Si algo falla, se lanza un AppError y la transacción se revierte: no queda nada guardado.
  async create(input: CreateReservationInput, now: Date = new Date()): Promise<CreatedReservation> {
    const { destinationId, travelDate, people, customerName, customerEmail, cardNumber } = input;

    // CU-01 / CU-03 4a: la fecha debe ser posterior a hoy en Costa Rica (antes de abrir la transacción)
    if (!isFutureTravelDate(travelDate, now)) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Los datos enviados no son válidos', [
        { field: 'travelDate', message: 'La fecha del viaje debe ser posterior a hoy' },
      ]);
    }

    return this.runInTransaction(async ({ destinations, reservations }) => {
      // SAD 3.2: bloquea la fila del destino (SELECT ... FOR UPDATE). Otra reserva para el
      // mismo destino espera aquí hasta que esta transacción termine: no hay sobrecupo.
      const destination = await destinations.findByIdForUpdate(destinationId);
      if (!destination || !destination.active) {
        throw new AppError(404, 'NOT_FOUND', UNAVAILABLE_MESSAGE);
      }

      // CU-03 paso 5 / 5a: RN-01 otra vez, ahora con el bloqueo puesto
      const reserved = await destinations.reservedPeopleOn(travelDate, [destination.id]);
      const reservedPeople = reserved.get(destination.id) ?? 0;
      if (!hasCapacity({ dailyCapacity: destination.dailyCapacity, reservedPeople, requestedPeople: people })) {
        throw capacityConflict(Math.max(destination.dailyCapacity - reservedPeople, 0));
      }

      // RN-03: el monto lo calcula el servidor con el precio actual (nunca lo envía el cliente)
      const quote = calculateQuote(destination.basePrice, people);

      // CU-03 paso 6 / 6a: RN-04. Rechazado → 402 y rollback: sin reserva, sin pago, sin código
      const payment = await this.gateway.charge({ cardNumber, amount: quote.total });
      if (!payment.approved) {
        throw new AppError(402, 'PAYMENT_DECLINED', PAYMENT_DECLINED_MESSAGE);
      }

      // CU-03 paso 8: código único + reserva. Si el código chocara, se prueba con otro.
      let code = '';
      let inserted: InsertedReservation | null = null;
      for (let attempt = 1; attempt <= MAX_CODE_ATTEMPTS && !inserted; attempt++) {
        code = this.generateCode();
        inserted = await reservations.insertIfNewCode({
          code,
          destinationId: destination.id,
          customerName,
          customerEmail,
          travelDate,
          people,
          basePrice: quote.basePrice,
          subtotal: quote.subtotal,
          iva: quote.iva,
          total: quote.total,
        });
      }
      if (!inserted) {
        // Error nuestro (no del turista): llega como 500 y se revierte todo
        throw new Error('No se pudo generar un código de confirmación único');
      }

      // El pago aprobado queda registrado con el último dígito (SAD 6)
      await reservations.insertPayment({
        reservationId: inserted.id,
        amount: quote.total,
        cardLastDigit: payment.lastDigit,
        status: 'Aprobado',
      });

      // CAMBIO (6.D): la respuesta se arma con la misma función que usa la consulta
      return {
        reservationId: inserted.id,
        reservation: buildReservationResult({
          code,
          status: 'Pendiente',
          destination: { id: destination.id, name: destination.name, place: destination.place },
          travelDate,
          customerName,
          customerEmail,
          people,
          basePrice: quote.basePrice,
          subtotal: quote.subtotal,
          iva: quote.iva,
          total: quote.total,
          payment: { status: 'Aprobado', cardLastDigit: payment.lastDigit },
          createdAt: inserted.createdAt,
        }),
      };
    });
  }

  // NUEVO (6.D): CU-04, consultar una reserva activa con su código y su correo (ya validados y
  // normalizados por lookupReservationSchema). Devuelve la reserva o lanza 404 (CU-04 5a).
  // Solo lee: no bloquea nada. Va por runInTransaction para usar los mismos repositorios
  // (y las mismas piezas falsas en las pruebas) que el resto del servicio.
  async lookup(input: LookupReservationInput): Promise<ReservationResult> {
    const details = await this.runInTransaction(({ reservations }) =>
      reservations.findActiveByCodeAndEmail(input.code, input.customerEmail),
    );
    if (!details) {
      throw new AppError(404, 'NOT_FOUND', LOOKUP_NOT_FOUND_MESSAGE);
    }
    return buildReservationResult(details);
  }
}