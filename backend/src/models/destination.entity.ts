// Entidad Destination: una fila de la tabla "destinos" (DESTINO del SAD 3.1).

import { Check, Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'destinos' })
// Documentan los CHECK que ya creó la migración 001 (synchronize está apagado)
@Check('chk_destinos_precio_base', 'precio_base > 0')
@Check('chk_destinos_capacidad', 'capacidad_diaria > 0')
export class Destination {
  @PrimaryGeneratedColumn('identity', {
    name: 'id_destino',
    type: 'integer',
    generatedIdentity: 'ALWAYS',
  })
  id!: number;

  // Único sin distinguir mayúsculas ni espacios a los lados (índice uq_destinos_nombre)
  @Column({ name: 'nombre', type: 'text' })
  name!: string;

  @Column({ name: 'descripcion', type: 'text', nullable: true })
  description!: string | null;

  // Lugar del destino; RF-01 busca por este campo
  @Column({ name: 'lugar', type: 'text' })
  place!: string;

  // Precio por persona en colones. Postgres devuelve NUMERIC como texto ("42500.00")
  @Column({ name: 'precio_base', type: 'numeric', precision: 12, scale: 2 })
  basePrice!: string;

  // Máximo de personas por día (RN-01)
  @Column({ name: 'capacidad_diaria', type: 'integer' })
  dailyCapacity!: number;

  // false = desactivado (CU-10); los destinos nunca se borran
  @Column({ name: 'activo', type: 'boolean', default: true })
  active!: boolean;
}