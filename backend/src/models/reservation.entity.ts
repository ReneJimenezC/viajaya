// Entidad Reservation: una fila de la tabla "reservas" (RESERVA del SAD 3.1).
// Los nombres de la base son los del equipo (en español); en el código, inglés.

import { Check, Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { Destination } from './destination.entity';

// Estados posibles; deben coincidir con el CHECK chk_reservas_estado de la migración 001
export const RESERVATION_STATES = ['Pendiente', 'Aprobada', 'Cancelada'] as const;
// Tipo derivado del arreglo: 'Pendiente' | 'Aprobada' | 'Cancelada'
export type ReservationStatus = (typeof RESERVATION_STATES)[number];

@Entity({ name: 'reservas' })
// Documentan las restricciones que ya creó la migración 001 (synchronize está apagado),
// con sus nombres reales (verificados con \d reservas el 06/11)
@Check('chk_reservas_personas', 'cantidad_personas > 0')
@Check('chk_reservas_precio_base', 'precio_base > 0')
@Check('chk_reservas_subtotal', 'subtotal > 0')
@Check('chk_reservas_iva', 'iva >= 0')
@Check('chk_reservas_monto_total', 'monto_total > 0')
@Check('chk_reservas_estado', "estado IN ('Pendiente', 'Aprobada', 'Cancelada')")
@Check('chk_reservas_reagendas', 'reagendas >= 0')
@Unique('uq_reservas_codigo', ['code'])
@Index('idx_reservas_destino_fecha', ['destinationId', 'travelDate'])
export class Reservation {
  @PrimaryGeneratedColumn('identity', { name: 'id_reserva', type: 'integer', generatedIdentity: 'ALWAYS' })
  id!: number;

  // Código de confirmación ("VY-7K3M9QXT"), único; con el correo da acceso a la reserva
  @Column({ name: 'codigo', type: 'text' })
  code!: string;

  // Destino reservado (el número)
  @Column({ name: 'id_destino', type: 'integer' })
  destinationId!: number;

  // La misma columna vista como relación: documenta la FK (un destino con reservas no se
  // puede borrar). No se carga nunca; solo describe la tabla.
  @ManyToOne(() => Destination, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'id_destino', foreignKeyConstraintName: 'fk_reservas_destino' })
  destination?: Destination;

  @Column({ name: 'nombre_cliente', type: 'text' })
  customerName!: string;

  // Se guarda en minúsculas y sin espacios (emailField), para que la consulta (CU-04) coincida
  @Column({ name: 'email_cliente', type: 'text' })
  customerEmail!: string;

  // Columna date: Postgres la devuelve como texto "AAAA-MM-DD", sin hora ni zona
  @Column({ name: 'fecha_viaje', type: 'date' })
  travelDate!: string;

  @Column({ name: 'cantidad_personas', type: 'integer' })
  people!: number;

  // Desglose de RN-03 guardado al reservar (si el destino cambia de precio, la reserva no cambia).
  // NUMERIC llega como texto ("47500.00"): nunca se opera con decimales flotantes.
  @Column({ name: 'precio_base', type: 'numeric', precision: 12, scale: 2 })
  basePrice!: string;

  @Column({ name: 'subtotal', type: 'numeric', precision: 12, scale: 2 })
  subtotal!: string;

  @Column({ name: 'iva', type: 'numeric', precision: 12, scale: 2 })
  iva!: string;

  @Column({ name: 'monto_total', type: 'numeric', precision: 12, scale: 2 })
  total!: string;

  // Nace "Pendiente"; el admin la aprueba (CU-12)
  @Column({ name: 'estado', type: 'text', default: 'Pendiente' })
  status!: ReservationStatus;

  // Cuántas veces se cambió la fecha (CU-05)
  @Column({ name: 'reagendas', type: 'integer', default: 0 })
  reschedules!: number;

  // Momento de la reserva; lo pone Postgres (now())
  @Column({ name: 'creado_en', type: 'timestamptz', default: () => 'now()' })
  createdAt!: Date;

  // Borrado lógico (CU-14): null = visible
  @Column({ name: 'eliminado_en', type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;
}