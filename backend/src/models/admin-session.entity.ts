// Entidad AdminSession: una fila de "sesiones_admin" = un refresh token entregado (N-7).
// Nunca guarda el token, solo su hash SHA-256.

import { Check, Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { Admin } from './admin.entity';

@Entity({ name: 'sesiones_admin' })
// Documenta el CHECK que ya creó la migración 002 (no crea nada: synchronize está apagado)
@Check('chk_sesiones_admin_expira', 'expira_en > creado_en AND expira_en <= tope_en')
// Documenta el UNIQUE y los índices de la migración 002
@Unique('uq_sesiones_admin_token_hash', ['tokenHash'])
@Index('idx_sesiones_admin_familia', ['family'])
@Index('idx_sesiones_admin_admin', ['adminId'])
export class AdminSession {
  @PrimaryGeneratedColumn('identity', {
    name: 'id_sesion',
    type: 'integer',
    generatedIdentity: 'ALWAYS',
    primaryKeyConstraintName: 'pk_sesiones_admin',
  })
  id!: number;

  // Admin dueño de la sesión (el número)
  @Column({ name: 'id_admin', type: 'integer' })
  adminId!: number;

  // La misma columna vista como relación: documenta la FK con ON DELETE CASCADE.
  // No se carga nunca (no se usa en el código); solo describe la tabla.
  @ManyToOne(() => Admin, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'id_admin', foreignKeyConstraintName: 'fk_sesiones_admin_admin' })
  admin?: Admin;

  // Mismo valor para todos los tokens de un mismo login
  @Column({ name: 'familia', type: 'uuid' })
  family!: string;

  // SHA-256 del token en hexadecimal (64 caracteres)
  @Column({ name: 'token_hash', type: 'text' })
  tokenHash!: string;

  @Column({ name: 'creado_en', type: 'timestamptz' })
  createdAt!: Date;

  // Vence si no se usa en 20 minutos (inactividad)
  @Column({ name: 'expira_en', type: 'timestamptz' })
  expiresAt!: Date;

  // Tope absoluto: 8 horas desde el login; no cambia al rotar
  @Column({ name: 'tope_en', type: 'timestamptz' })
  absoluteExpiresAt!: Date;

  // null = todavía no se usó para renovar
  @Column({ name: 'usado_en', type: 'timestamptz', nullable: true })
  usedAt!: Date | null;

  // null = vigente; con fecha = anulado (logout o robo)
  @Column({ name: 'revocado_en', type: 'timestamptz', nullable: true })
  revokedAt!: Date | null;
}