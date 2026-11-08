// Entidad AdminAction: una fila de "acciones_admin" = una acción del administrador sobre una
// reserva (decisión 1 = B del Paso 8). Solo se agregan filas: es un historial.

import { Check, Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Admin } from './admin.entity';
import { Reservation } from './reservation.entity';

// Acciones permitidas (V13); debe coincidir con el CHECK chk_acciones_admin_accion de la 003
export const ADMIN_ACTIONS = [
  'aprobar',
  'cancelar',
  'eliminar',
  'pago_pendiente',
  'pago_aprobado',
  'pago_rechazado',
  'reagendar',
] as const;
// Tipo derivado del arreglo: 'aprobar' | 'cancelar' | ... | 'reagendar'
export type AdminActionType = (typeof ADMIN_ACTIONS)[number];

// Acciones que exigen motivo (V10); debe coincidir con chk_acciones_admin_motivo_obligatorio
export const ACTIONS_REQUIRING_REASON: readonly AdminActionType[] = ['reagendar', 'pago_rechazado'];

// Largo máximo del motivo (V10); debe coincidir con chk_acciones_admin_motivo_largo
export const ADMIN_REASON_MAX_LENGTH = 500;

@Entity({ name: 'acciones_admin' })
// Documentan los CHECK y el índice que ya creó la migración 003 (no crean nada)
@Check(
  'chk_acciones_admin_accion',
  "accion IN ('aprobar', 'cancelar', 'eliminar', 'pago_pendiente', 'pago_aprobado', 'pago_rechazado', 'reagendar')",
)
@Check('chk_acciones_admin_motivo_largo', "motivo IS NULL OR (char_length(motivo) <= 500 AND btrim(motivo) <> '')")
@Check(
  'chk_acciones_admin_motivo_obligatorio',
  "accion NOT IN ('reagendar', 'pago_rechazado') OR motivo IS NOT NULL",
)
@Check(
  'chk_acciones_admin_fechas',
  "(accion = 'reagendar' AND fecha_anterior IS NOT NULL AND fecha_nueva IS NOT NULL AND fecha_anterior <> fecha_nueva) OR (accion <> 'reagendar' AND fecha_anterior IS NULL AND fecha_nueva IS NULL)",
)
@Index('idx_acciones_admin_reserva', ['reservationId'])
export class AdminAction {
  @PrimaryGeneratedColumn('identity', {
    name: 'id_accion',
    type: 'integer',
    generatedIdentity: 'ALWAYS',
    primaryKeyConstraintName: 'pk_acciones_admin',
  })
  id!: number;

  // Reserva sobre la que se hizo la acción (el número)
  @Column({ name: 'id_reserva', type: 'integer' })
  reservationId!: number;

  // La misma columna vista como relación: documenta la FK con ON DELETE RESTRICT.
  // No se carga nunca; solo describe la tabla.
  @ManyToOne(() => Reservation, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'id_reserva', foreignKeyConstraintName: 'fk_acciones_admin_reserva' })
  reservation?: Reservation;

  // Admin que hizo la acción; null si después se borró ese admin (V11)
  @Column({ name: 'id_admin', type: 'integer', nullable: true })
  adminId!: number | null;

  // Documenta la FK con ON DELETE SET NULL (V11). No se carga nunca.
  @ManyToOne(() => Admin, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'id_admin', foreignKeyConstraintName: 'fk_acciones_admin_admin' })
  admin?: Admin;

  @Column({ name: 'accion', type: 'text' })
  action!: AdminActionType;

  // Por qué se hizo; obligatorio en 'reagendar' y 'pago_rechazado' (V10)
  @Column({ name: 'motivo', type: 'text', nullable: true })
  reason!: string | null;

  // Solo en 'reagendar' (V12); 'date' de Postgres → texto "AAAA-MM-DD"
  @Column({ name: 'fecha_anterior', type: 'date', nullable: true })
  previousDate!: string | null;

  @Column({ name: 'fecha_nueva', type: 'date', nullable: true })
  newDate!: string | null;

  // Lo pone la base al insertar (DEFAULT now())
  @Column({ name: 'creado_en', type: 'timestamptz', default: () => 'now()' })
  createdAt!: Date;
}