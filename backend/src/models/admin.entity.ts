// Entidad Admin: representa una fila de la tabla "administrador" (USUARIO_ADMIN del SAD).
// Equivale a una clase @Entity de JPA. Los nombres en la base son los del equipo (en español);
// en el código usamos inglés y los unimos con "name".

import { Check, Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

// Roles permitidos; debe coincidir con el CHECK chk_administrador_rol de la migración 001
export const ADMIN_ROLES = ['admin'] as const;
// Tipo derivado del arreglo: por ahora solo 'admin'
export type AdminRole = (typeof ADMIN_ROLES)[number];

// Tabla real en la base
@Entity({ name: 'administrador' })
// Documenta el CHECK que ya creó la migración 001 (no crea nada: synchronize está apagado).
// Sirve para que TypeORM vea la entidad idéntica a la tabla.
@Check('chk_administrador_rol', "rol IN ('admin')")
export class Admin {
  // Llave primaria que genera Postgres (GENERATED ALWAYS AS IDENTITY).
  // 'identity' + generatedIdentity 'ALWAYS': TypeORM NUNCA envía el id al insertar.
  @PrimaryGeneratedColumn('identity', {
    name: 'id_admin',
    type: 'integer',
    generatedIdentity: 'ALWAYS',
  })
  id!: number;

  // Nombre visible del administrador (columna "nombre" del esquema del equipo)
  @Column({ name: 'nombre', type: 'text' })
  name!: string;

  // Correo para el login; único sin distinguir mayúsculas (índice uq_administrador_email)
  @Column({ name: 'email', type: 'text' })
  email!: string;

  // Hash argon2 de la contraseña; NUNCA la contraseña en texto plano.
  // select: false = las consultas normales no lo traen; solo el login lo pide a propósito.
  @Column({ name: 'password_hash', type: 'text', select: false })
  passwordHash!: string;

  // Rol del administrador; si no se envía, la base pone 'admin'
  @Column({ name: 'rol', type: 'text', default: 'admin' })
  role!: AdminRole;
}