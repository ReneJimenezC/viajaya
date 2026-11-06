// ReservaService (SAD 3.1): crea, consulta, modifica y cancela reservas (RF-03 a RF-06);
// valida RN-01 y RN-02 y genera el código único. Las reglas puras viven en business-rules.ts;
// aquí se aplican dentro de la transacción, con el destino bloqueado (SAD 3.2).

import { randomInt } from 'node:crypto';
import { AppError } from '../errors/app-error';
import type { PaymentStatus } from '../models/payment.entity';
import type { ReservationStatus } from '../models/reservation.entity';
import type { CreateReservationInput } from '../models/reservation.schema';
import type { DestinationRepository } from '../repositories/destination.repository';
import type { InsertedReservation, ReservationRepository } from '../repositories/reservation.repository';
import {
  calculateQuote,
  capacityConflict,
  hasCapacity,
  isFutureTravelDate,
  UNAVAILABLE_MESSAGE,
  type Quote,
} from './business-rules';
import type { PaymentGateway } from './payment-gateway';

// Prefijo y largo del código (decisión 5 = A): "VY-" + 8 caracteres
const CODE_PREFIX = 'VY-';
const CODE_LENGTH = 8;
// 31 caracteres: dígitos 2-9 y letras A-Z SIN los que se confunden al leer o dictar
// (0 y O, 1, I y L). 31^8 ≈ 850 mil millones de combinaciones.
const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
// Intentos si el código generado ya existiera (casi imposible)
const MAX_CODE_ATTEMPTS = 3;
// Mensaje de CU-03 6a (decisión 2 = A: 402 PAYMENT_DECLINED)
const PAYMENT_DECLINED_MESSAGE = 'El pago fue rechazado. Intenta con otra tarjeta.';

// Genera un código de confirmación con aleatoriedad criptográfica (como SecureRandom).
// Ejemplo: "VY-7K3M9QXT". Math.random() NO sirve: es predecible.
export function generateConfirmationCode(): string {
  let code = CODE_PREFIX;
  for (let i = 0; i < CODE_LENGTH; i++) {
    // randomInt(31) da un entero de 0 a 30, sin sesgo
    code += CODE_ALPHABET.charAt(randomInt(CODE_ALPHABET.length));
  }
  return code;
}

// Lo que el servicio necesita de los repositorios dentro de la transacción.
// Solo esos métodos: así las pruebas pueden pasar repositorios falsos (decisión 7 = B).
export interface ReservationStores {
  destinations: Pick<DestinationRepository, 'findByIdForUpdate' | 'reservedPeopleOn'>;
  reservations: Pick<ReservationRepository, 'insertIfNewCode' | 'insertPayment'>;
}

// Abre una transacción, le entrega a "work" los repositorios que trabajan dentro de ella,
// y confirma (commit) si work termina bien o revierte (rollback) si lanza un error.
// En la app real es AppDataSource.transaction (ver app.ts); en las pruebas, una función falsa.
export type RunInTransaction = <T>(work: (stores: ReservationStores) => Promise<T>) => Promise<T>;

// Respuesta de POST /reservas (decisión 6 = A): CU-03 paso 9, "toda la información"
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

      return {
        reservationId: inserted.id,
        reservation: {
          code,
          status: 'Pendiente',
          destination: { id: destination.id, name: destination.name, place: destination.place },
          travelDate,
          customerName,
          customerEmail,
          quote,
          payment: { status: 'Aprobado', cardLastDigit: payment.lastDigit },
          createdAt: inserted.createdAt,
        },
      };
    });
  }
}