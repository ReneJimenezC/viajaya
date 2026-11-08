// Acceso a las tablas "reservas" y "pagos". Recibe el EntityManager de la transacción en
// curso (como AdminSessionRepository y DestinationRepository): la reserva y su pago se
// guardan en la MISMA transacción que bloqueó el destino (SAD 3.2).

import type { EntityManager } from 'typeorm';
import { Payment, type PaymentStatus } from '../models/payment.entity';
import type { ReservationStatus } from '../models/reservation.entity';

// NUEVO (6.D): estados de una reserva "activa" (decisión 10 = A, CU-04): pendiente o aprobada.
// Una cancelada no se muestra; tampoco una borrada por el admin (eliminado_en con fecha).
// La usan la consulta, el cambio de fecha (6.E) y la cancelación (6.F).
const ACTIVE_STATES: ReservationStatus[] = ['Pendiente', 'Aprobada'];

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
}



// NUEVO (8.C-8.E): lo mínimo de una reserva para que el admin la apruebe, cancele o elimine:
// su estado, su fecha (RN-02 al cancelar) y el estado de su pago más reciente (V22).
// Ejemplo: { id: 1, status: 'Pendiente', travelDate: '2026-12-10', paymentStatus: 'Aprobado' }
export interface AdminReservationRef {
  id: number;
  status: ReservationStatus;
  travelDate: string;
  paymentStatus: PaymentStatus;
}

// NUEVO (6.D): forma de cada fila que devuelve DETAILS_SELECT
// CAMBIO (8.B): también la usa findAllForAdmin; se agregan id_reserva y reagendas
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
         p.estado AS pago_estado, p.tarjeta_ultimo_digito, r.reagendas, r.creado_en
    FROM reservas r
    JOIN destinos d ON d.id_destino = r.id_destino
    JOIN LATERAL (
         SELECT estado, tarjeta_ultimo_digito
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
    const rows: { id_reserva: number; estado: ReservationStatus; fecha_viaje: string; pago_estado: PaymentStatus }[] =
      await this.manager.query(
        `SELECT r.id_reserva, r.estado, r.fecha_viaje::text AS fecha_viaje, p.estado AS pago_estado
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
      ? { id: row.id_reserva, status: row.estado, travelDate: row.fecha_viaje, paymentStatus: row.pago_estado }
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
}