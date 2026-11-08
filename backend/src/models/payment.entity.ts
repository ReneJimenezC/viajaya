// Entidad Payment: una fila de la tabla "pagos" (PAGO del SAD 3.1).
// Nunca guarda el número de tarjeta: solo su último dígito (SAD 6).

import { Check, Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Reservation } from './reservation.entity';

// Estados posibles; deben coincidir con el CHECK chk_pagos_estado de la migración 001
export const PAYMENT_STATES = ['Pendiente', 'Aprobado', 'Rechazado'] as const;
// Tipo derivado: 'Pendiente' | 'Aprobado' | 'Rechazado'
export type PaymentStatus = (typeof PAYMENT_STATES)[number];

@Entity({ name: 'pagos' })
// Nombres reales verificados con \d pagos el 06/11
@Check('chk_pagos_monto', 'monto > 0')
@Check('chk_pagos_digito', 'tarjeta_ultimo_digito >= 0 AND tarjeta_ultimo_digito <= 9')
@Check('chk_pagos_estado', "estado IN ('Pendiente', 'Aprobado', 'Rechazado')")
@Index('idx_pagos_reserva', ['reservationId'])
export class Payment {
  @PrimaryGeneratedColumn('identity', { name: 'id_pago', type: 'integer', generatedIdentity: 'ALWAYS' })
  id!: number;

  // Reserva a la que pertenece el pago (el número)
  @Column({ name: 'id_reserva', type: 'integer' })
  reservationId!: number;

  // La misma columna como relación: documenta la FK. No se carga nunca.
  @ManyToOne(() => Reservation, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'id_reserva', foreignKeyConstraintName: 'fk_pagos_reserva' })
  reservation?: Reservation;

  // Monto cobrado = total de la reserva (texto con 2 decimales)
  @Column({ name: 'monto', type: 'numeric', precision: 12, scale: 2 })
  amount!: string;

  // Único dato de la tarjeta que se guarda (0 a 9)
  @Column({ name: 'tarjeta_ultimo_digito', type: 'integer' })
  cardLastDigit!: number;

  // Sin valor por defecto en la base: siempre se indica al insertar
  @Column({ name: 'estado', type: 'text' })
  status!: PaymentStatus;

  // Momento del pago; lo pone Postgres (now())
  @Column({ name: 'fecha', type: 'timestamptz', default: () => 'now()' })
  createdAt!: Date;
}