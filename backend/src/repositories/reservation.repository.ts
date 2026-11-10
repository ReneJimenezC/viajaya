// Acceso a las tablas "reservas" y "pagos". Recibe el EntityManager de la transacción en
// curso (como AdminSessionRepository y DestinationRepository): la reserva y su pago se
// guardan en la MISMA transacción que bloqueó el destino (SAD 3.2).

import type { EntityManager } from 'typeorm';
import type { AdminActionType } from '../models/admin-action.entity';
import { Payment, type PaymentStatus } from '../models/payment.entity';
import type { ReservationStatus } from '../models/reservation.entity';

// NUEVO (6.D): estados de una reserva "activa" (decisión 10 = A, CU-04): pendiente o aprobada.
// Una cancelada no se muestra; tampoco una borrada por el admin (eliminado_en con fecha).
// La usan la consulta, el cambio de fecha (6.E) y la cancelación (6.F).
const ACTIVE_STATES: ReservationStatus[] = ['Pendiente', 'Aprobada'];


// NUEVO (8.H, N-8): acciones del historial con las que el ADMIN cancela una reserva: CU-13 y el
// pago rechazado (N-1). Si una reserva cancelada tiene alguna, la consulta del turista la muestra.
const ADMIN_CANCEL_ACTIONS: AdminActionType[] = ['cancelar', 'pago_rechazado'];
// Datos de una reserva nueva (todo ya validado y calculado por el servicio)
export interface NewReservation {
  code: string;
  destinationId: number;
  customerName: string;
  customerEmail: string;
  travelDate: string;
  people: number;
  basePrice: string;
  subtotal: string;
  iva: string;
  total: string;
}

// Lo que devuelve la base al insertar: el id y la hora que puso Postgres
export interface InsertedReservation {
  id: number;
  createdAt: Date;
}

// Datos de un pago nuevo
export interface NewPayment {
  reservationId: number;
  amount: string;
  cardLastDigit: number;
  status: PaymentStatus;
}

// NUEVO (6.D): una reserva completa, con su destino y su pago, tal como se le muestra al
// turista. La arma la consulta (findActiveByCodeAndEmail) y también el servicio al crear una
// reserva, para que las dos respuestas salgan de la misma función (decisión 11 = A).
export interface ReservationDetails {
  code: string;
  status: ReservationStatus;
  destination: { id: number; name: string; place: string };
  travelDate: string;
  customerName: string;
  customerEmail: string;
  people: number;
  basePrice: string;
  subtotal: string;
  iva: string;
  total: string;
  payment: { status: PaymentStatus; cardLastDigit: number };
  createdAt: Date;
}

// NUEVO (6.E): lo mínimo de una reserva activa para cambiarla (fecha) o cancelarla (6.F).
// Ejemplo: { id: 1, destinationId: 4, travelDate: '2026-12-10' }
export interface ActiveReservationRef {
  id: number;
  destinationId: number;
  travelDate: string;
}

// NUEVO (8.B): una reserva tal como la ve el admin (V17): lo mismo que el turista + el id
// interno (para las rutas /admin/reservas/:id) y cuántas veces se cambió de fecha.
export interface AdminReservationDetails extends ReservationDetails {
  id: number;
  reschedules: number;
  // NUEVO (8.F, V29): id del pago más reciente, para PATCH /admin/pagos/:id (el turista no lo ve)
  paymentId: number;
}

// NUEVO (8.C-8.E): lo mínimo de una reserva para que el admin la apruebe, cancele o elimine:
// su estado, su fecha (RN-02 al cancelar) y el estado de su pago más reciente (V22).
// CAMBIO (8.G): también su destino y sus personas, para validar RN-01 al reagendar.
// Ejemplo: { id: 1, status: 'Pendiente', travelDate: '2026-12-10', paymentStatus: 'Aprobado',
//            destinationId: 4, people: 2 }
export interface AdminReservationRef {
  id: number;
  status: ReservationStatus;
  travelDate: string;
  paymentStatus: PaymentStatus;
  destinationId: number;
  people: number;
}

// NUEVO (8.F): lo mínimo de un pago para que el admin cambie su estado (CU-15): el pago, su
// reserva y si es el más reciente de ella (V32).
// Ejemplo: { paymentId: 7, paymentStatus: 'Aprobado', reservationId: 1, reservationStatus: 'Pendiente', isLatest: true }
export interface AdminPaymentRef {
  paymentId: number;
  paymentStatus: PaymentStatus;
  reservationId: number;
  reservationStatus: ReservationStatus;
  isLatest: boolean;
}

// NUEVO (6.D): forma de cada fila que devuelve DETAILS_SELECT
// CAMBIO (8.B): también la usa findAllForAdmin; se agregan id_reserva y reagendas
// CAMBIO (8.F): se agrega id_pago (V29)
interface ReservationDetailsRow {
  id_reserva: number;
  codigo: string;
  estado: ReservationStatus;
  id_destino: number;
  destino_nombre: string;
  destino_lugar: string;
  fecha_viaje: string;
  nombre_cliente: string;
  email_cliente: string;
  cantidad_personas: number;
  precio_base: string;
  subtotal: string;
  iva: string;
  monto_total: string;
  id_pago: number;
  pago_estado: PaymentStatus;
  tarjeta_ultimo_digito: number;
  reagendas: number;
  creado_en: Date;
}

// NUEVO (8.B, V19): el SELECT de una reserva completa, con su destino y su pago, SIN el WHERE.
// Lo comparten la consulta del turista y el listado del admin; cada una agrega su propio filtro.
// - fecha_viaje::text: así llega "2026-12-10" tal cual (sin ::text, el driver la
//   convertiría a un Date de JavaScript con hora y zona)
// - JOIN LATERAL: trae el pago MÁS RECIENTE de la reserva (hoy hay uno solo por
//   reserva; así ya queda listo si algún día se permiten reintentos, SAD 3.1: 1..N)
const DETAILS_SELECT = `
  SELECT r.id_reserva, r.codigo, r.estado, r.id_destino, d.nombre AS destino_nombre,
         d.lugar AS destino_lugar, r.fecha_viaje::text AS fecha_viaje, r.nombre_cliente,
         r.email_cliente, r.cantidad_personas, r.precio_base, r.subtotal, r.iva, r.monto_total,
         p.id_pago, p.estado AS pago_estado, p.tarjeta_ultimo_digito, r.reagendas, r.creado_en
    FROM reservas r
    JOIN destinos d ON d.id_destino = r.id_destino
    JOIN LATERAL (
         SELECT id_pago, estado, tarjeta_ultimo_digito
           FROM pagos
          WHERE id_reserva = r.id_reserva
          ORDER BY fecha DESC, id_pago DESC
          LIMIT 1
    ) p ON true`;

// NUEVO (8.B, V19): pasa una fila de la base (nombres en español) a los nombres del código
// (inglés). Antes estaba dentro de findActiveByCodeAndEmail; ahora la usan las dos búsquedas.
// Ejemplo: { codigo: 'VY-F57NXNW9', reagendas: 2, ... } → { code: 'VY-F57NXNW9', reschedules: 2, ... }
function toDetails(row: ReservationDetailsRow): AdminReservationDetails {
  return {
    id: row.id_reserva,
    code: row.codigo,
    status: row.estado,
    destination: { id: row.id_destino, name: row.destino_nombre, place: row.destino_lugar },
    travelDate: row.fecha_viaje,
    customerName: row.nombre_cliente,
    customerEmail: row.email_cliente,
    people: row.cantidad_personas,
    basePrice: row.precio_base,
    subtotal: row.subtotal,
    iva: row.iva,
    total: row.monto_total,
    payment: { status: row.pago_estado, cardLastDigit: row.tarjeta_ultimo_digito },
    paymentId: row.id_pago,
    reschedules: row.reagendas,
    createdAt: row.creado_en,
  };
}

export class ReservationRepository {
  constructor(private readonly manager: EntityManager) {}

  // Inserta la reserva (estado 'Pendiente' por defecto). Devuelve null si el código ya
  // existía: ON CONFLICT DO NOTHING evita el error, que en Postgres anularía toda la
  // transacción (y con ella el bloqueo del destino). El servicio genera otro código.
  async insertIfNewCode(data: NewReservation): Promise<InsertedReservation | null> {
    const rows: { id_reserva: number; creado_en: Date }[] = await this.manager.query(
      `INSERT INTO reservas (codigo, id_destino, nombre_cliente, email_cliente, fecha_viaje,
                             cantidad_personas, precio_base, subtotal, iva, monto_total)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (codigo) DO NOTHING
       RETURNING id_reserva, creado_en`,
      [
        data.code,
        data.destinationId,
        data.customerName,
        data.customerEmail,
        data.travelDate,
        data.people,
        data.basePrice,
        data.subtotal,
        data.iva,
        data.total,
      ],
    );
    const row = rows[0];
    return row ? { id: row.id_reserva, createdAt: row.creado_en } : null;
  }

  // Inserta el pago de una reserva
  async insertPayment(data: NewPayment): Promise<void> {
    await this.manager.insert(Payment, data);
  }

  // NUEVO (6.D): busca la reserva ACTIVA con ese código Y ese correo (CU-04 paso 5), con su
  // destino y su pago. Devuelve null si no hay ninguna: no existe, el correo no coincide, está
  // cancelada o fue borrada (los cuatro casos dan la misma respuesta, sin pistas).
  // El código ya llega en mayúsculas y el correo en minúsculas, como se guardaron.
  // Ejemplo: ('VY-F57NXNW9', 'ana@correo.com') → { code: 'VY-F57NXNW9', status: 'Pendiente', ... }
  async findActiveByCodeAndEmail(code: string, email: string): Promise<ReservationDetails | null> {
    // CAMBIO (8.B, V19): el SELECT y la conversión ahora son compartidos (DETAILS_SELECT y
    // toDetails); aquí solo queda el filtro de la consulta del turista
    const rows: ReservationDetailsRow[] = await this.manager.query(
      `${DETAILS_SELECT}
        WHERE r.codigo = $1
          AND r.email_cliente = $2
          AND r.estado = ANY($3)
          AND r.eliminado_en IS NULL`,
      [code, email, ACTIVE_STATES],
    );
    const row = rows[0];
    return row ? toDetails(row) : null;
  }

    // NUEVO (8.H, N-8 y V48): búsqueda SOLO de la consulta del turista (POST /reservas/consulta).
  // Encuentra la reserva activa (igual que findActiveByCodeAndEmail) y TAMBIÉN la cancelada por
  // el admin: por CU-13 (acción 'cancelar') o por pago rechazado (N-1, acción 'pago_rechazado').
  // Una cancelada sin esas filas en el historial la canceló el turista → null (404, como antes).
  // Basta con que exista la fila: una reserva se cancela una sola vez (V33 y CU-13 2a).
  // El cambio de fecha y la cancelación del turista NO la usan: siguen buscando solo activas.
  // Ejemplo: Luis, cancelada por el admin → { status: 'Cancelada', ... }; Ana, cancelada por ella → null
  async findForLookup(code: string, email: string): Promise<ReservationDetails | null> {
    const rows: ReservationDetailsRow[] = await this.manager.query(
      `${DETAILS_SELECT}
        WHERE r.codigo = $1
          AND r.email_cliente = $2
          AND r.eliminado_en IS NULL
          AND (r.estado = ANY($3)
               OR (r.estado = 'Cancelada'
                   AND EXISTS (SELECT 1
                                 FROM acciones_admin a
                                WHERE a.id_reserva = r.id_reserva
                                  AND a.accion = ANY($4))))`,
      [code, email, ACTIVE_STATES, ADMIN_CANCEL_ACTIONS],
    );
    const row = rows[0];
    return row ? toDetails(row) : null;
  }

  // NUEVO (8.B): todas las reservas para el listado del admin (CU-11). Incluye pendientes,
  // aprobadas y canceladas; NO las eliminadas (V15). La de viaje más reciente primero y, en
  // empate, la última creada (V16). Sin reservas → [] (V18).
  // Ejemplo: () → [{ id: 2, code: 'VY-N7WYTNPA', ... }, { id: 1, code: 'VY-F57NXNW9', ... }]
  async findAllForAdmin(): Promise<AdminReservationDetails[]> {
    const rows: ReservationDetailsRow[] = await this.manager.query(
      `${DETAILS_SELECT}
        WHERE r.eliminado_en IS NULL
        ORDER BY r.fecha_viaje DESC, r.id_reserva DESC`,
    );
    // map = recorrer y convertir cada fila (como stream().map(...).toList() en Java)
    return rows.map(toDetails);
  }

  // NUEVO (6.E): busca la reserva ACTIVA con ese código y ese correo y BLOQUEA su fila hasta el
  // fin de la transacción (SELECT ... FOR UPDATE). Si llegan dos cambios a la vez sobre la misma
  // reserva (dos pestañas, doble clic), el segundo espera al primero. Devuelve null si no hay.
  // Ejemplo: ('VY-F57NXNW9', 'ana@correo.com') → { id: 1, destinationId: 4, travelDate: '2026-12-10' }
  async findActiveForUpdate(code: string, email: string): Promise<ActiveReservationRef | null> {
    const rows: { id_reserva: number; id_destino: number; fecha_viaje: string }[] = await this.manager.query(
      `SELECT id_reserva, id_destino, fecha_viaje::text AS fecha_viaje
         FROM reservas
        WHERE codigo = $1
          AND email_cliente = $2
          AND estado = ANY($3)
          AND eliminado_en IS NULL
        FOR UPDATE`,
      [code, email, ACTIVE_STATES],
    );
    const row = rows[0];
    return row ? { id: row.id_reserva, destinationId: row.id_destino, travelDate: row.fecha_viaje } : null;
  }

  // NUEVO (6.E): cambia la fecha del viaje y suma 1 a "reagendas" (V3). El monto no se toca.
  // Ejemplo: (1, '2026-12-15') → la reserva 1 queda con fecha 15/12 y reagendas + 1
  async updateTravelDate(id: number, travelDate: string): Promise<void> {
    await this.manager.query(
      'UPDATE reservas SET fecha_viaje = $2, reagendas = reagendas + 1 WHERE id_reserva = $1',
      [id, travelDate],
    );
  }

  // NUEVO (6.F): marca la reserva como cancelada (CU-06 paso 5). Con eso deja de contar para el
  // cupo (reservedPeopleOn solo suma Pendiente y Aprobada) y la consulta ya no la encuentra.
  // El pago no se toca (V7). Ejemplo: (1) → la reserva 1 queda con estado 'Cancelada'
  async cancelReservation(id: number): Promise<void> {
    await this.manager.query("UPDATE reservas SET estado = 'Cancelada' WHERE id_reserva = $1", [id]);
  }

  // NUEVO (8.C-8.E): busca la reserva por su id (no eliminada) y BLOQUEA su fila hasta el fin de
  // la transacción (V27): con un doble clic del admin, la segunda petición espera a la primera.
  // "FOR UPDATE OF r" bloquea solo la fila de reservas (no la del pago que se lee al lado).
  // Devuelve null si no existe o está eliminada (V20).
  // Ejemplo: (1) → { id: 1, status: 'Pendiente', travelDate: '2026-12-10', paymentStatus: 'Aprobado' }
  async findByIdForUpdate(id: number): Promise<AdminReservationRef | null> {
    // CAMBIO (8.G): se agregan id_destino y cantidad_personas
    const rows: {
      id_reserva: number;
      estado: ReservationStatus;
      fecha_viaje: string;
      pago_estado: PaymentStatus;
      id_destino: number;
      cantidad_personas: number;
    }[] =
      await this.manager.query(
        `SELECT r.id_reserva, r.estado, r.fecha_viaje::text AS fecha_viaje, p.estado AS pago_estado,
                r.id_destino, r.cantidad_personas
           FROM reservas r
           JOIN LATERAL (
                SELECT estado
                  FROM pagos
                 WHERE id_reserva = r.id_reserva
                 ORDER BY fecha DESC, id_pago DESC
                 LIMIT 1
           ) p ON true
          WHERE r.id_reserva = $1
            AND r.eliminado_en IS NULL
          FOR UPDATE OF r`,
        [id],
      );
    const row = rows[0];
    return row
      ? {
          id: row.id_reserva,
          status: row.estado,
          travelDate: row.fecha_viaje,
          paymentStatus: row.pago_estado,
          destinationId: row.id_destino,
          people: row.cantidad_personas,
        }
      : null;
  }

  // NUEVO (8.C-8.E): una reserva completa por su id, con la forma del admin (para responder
  // después de aprobarla o cancelarla). Se lee DENTRO de la misma transacción, así ya trae el
  // estado nuevo. Ejemplo: (1) → { id: 1, code: 'VY-F57NXNW9', status: 'Aprobada', ... }
  async findDetailsById(id: number): Promise<AdminReservationDetails | null> {
    const rows: ReservationDetailsRow[] = await this.manager.query(
      `${DETAILS_SELECT}
        WHERE r.id_reserva = $1
          AND r.eliminado_en IS NULL`,
      [id],
    );
    const row = rows[0];
    return row ? toDetails(row) : null;
  }

  // NUEVO (8.C): marca la reserva como aprobada (CU-12 paso 7).
  // Ejemplo: (1) → la reserva 1 queda con estado 'Aprobada'
  async approveReservation(id: number): Promise<void> {
    await this.manager.query("UPDATE reservas SET estado = 'Aprobada' WHERE id_reserva = $1", [id]);
  }

  // NUEVO (8.E): borrado LÓGICO (CU-14, V24): la fila se queda (con su pago y su historial),
  // pero con fecha en eliminado_en ya no aparece en el listado ni en la consulta.
  // Ejemplo: (1) → la reserva 1 queda con eliminado_en = ahora
  async markDeleted(id: number): Promise<void> {
    await this.manager.query('UPDATE reservas SET eliminado_en = now() WHERE id_reserva = $1', [id]);
  }

  // NUEVO (8.F): busca el pago (de una reserva no eliminada) y BLOQUEA la fila de su RESERVA hasta
  // el fin de la transacción: el mismo candado que aprobar, cancelar y eliminar, así un cambio de
  // pago y una cancelación de esa reserva nunca pasan a la vez. Dice además si es el pago más
  // reciente de la reserva (V32). Devuelve null si no existe o su reserva está eliminada.
  // Ejemplo: (7) → { paymentId: 7, paymentStatus: 'Aprobado', reservationId: 1, reservationStatus: 'Pendiente', isLatest: true }
  async findPaymentForUpdate(paymentId: number): Promise<AdminPaymentRef | null> {
    const rows: {
      id_pago: number;
      pago_estado: PaymentStatus;
      id_reserva: number;
      reserva_estado: ReservationStatus;
      es_ultimo: boolean;
    }[] = await this.manager.query(
      `SELECT pg.id_pago, pg.estado AS pago_estado, r.id_reserva, r.estado AS reserva_estado,
              pg.id_pago = (SELECT id_pago
                              FROM pagos
                             WHERE id_reserva = r.id_reserva
                             ORDER BY fecha DESC, id_pago DESC
                             LIMIT 1) AS es_ultimo
         FROM pagos pg
         JOIN reservas r ON r.id_reserva = pg.id_reserva
        WHERE pg.id_pago = $1
          AND r.eliminado_en IS NULL
        FOR UPDATE OF r`,
      [paymentId],
    );
    const row = rows[0];
    return row
      ? {
          paymentId: row.id_pago,
          paymentStatus: row.pago_estado,
          reservationId: row.id_reserva,
          reservationStatus: row.reserva_estado,
          isLatest: row.es_ultimo,
        }
      : null;
  }

  // NUEVO (8.F): cambia el estado de un pago (CU-15 paso 8). El monto y el dígito no se tocan.
  // Ejemplo: (7, 'Rechazado') → el pago 7 queda 'Rechazado'
  async updatePaymentStatus(paymentId: number, status: PaymentStatus): Promise<void> {
    await this.manager.query('UPDATE pagos SET estado = $2 WHERE id_pago = $1', [paymentId, status]);
  }

  // NUEVO (8.G, N-3 y V45): ¿la fecha ACTUAL de la reserva la puso el admin? Es así si la última
  // reagenda del admin (historial) dejó justo esa fecha. Si después el turista la movió a otra
  // fecha suya, ya no coincide y RN-02 vuelve a aplicar.
  // Ejemplo: admin movió del 10/11 al 11/11 → (1, '2026-11-11') → true; (1, '2026-11-20') → false
  async wasRescheduledByAdminTo(reservationId: number, travelDate: string): Promise<boolean> {
    const rows: { coincide: boolean }[] = await this.manager.query(
      `SELECT fecha_nueva = $2::date AS coincide
         FROM acciones_admin
        WHERE id_reserva = $1
          AND accion = 'reagendar'
        ORDER BY id_accion DESC
        LIMIT 1`,
      [reservationId, travelDate],
    );
    return rows[0]?.coincide === true;
  }
}