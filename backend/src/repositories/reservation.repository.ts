// Acceso a las tablas "reservas" y "pagos". Recibe el EntityManager de la transacción en
// curso (como AdminSessionRepository y DestinationRepository): la reserva y su pago se
// guardan en la MISMA transacción que bloqueó el destino (SAD 3.2).

import type { EntityManager } from 'typeorm';
import { Payment, type PaymentStatus } from '../models/payment.entity';

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
}