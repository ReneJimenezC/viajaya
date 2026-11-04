// Migración 002: tabla de sesiones del administrador (refresh tokens, N-7).
// Está en su propia migración para poder quitar el refresh token sin tocar la 001.

import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AdminSessions implements MigrationInterface {
  // TypeORM exige que el nombre termine en 13+ dígitos para ordenar: descripción + AAAAMMDDhhmmss
  name = 'AdminSessions20261103191500';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Una fila por cada refresh token entregado. Todos los de un mismo login comparten "familia".
    await queryRunner.query(`
      CREATE TABLE sesiones_admin (
        id_sesion   integer GENERATED ALWAYS AS IDENTITY,
        id_admin    integer NOT NULL,
        familia     uuid NOT NULL,
        token_hash  text NOT NULL,
        creado_en   timestamptz NOT NULL,
        expira_en   timestamptz NOT NULL,
        tope_en     timestamptz NOT NULL,
        usado_en    timestamptz,
        revocado_en timestamptz,
        CONSTRAINT pk_sesiones_admin PRIMARY KEY (id_sesion),
        CONSTRAINT fk_sesiones_admin_admin FOREIGN KEY (id_admin)
          REFERENCES administrador (id_admin) ON DELETE CASCADE,
        CONSTRAINT uq_sesiones_admin_token_hash UNIQUE (token_hash),
        CONSTRAINT chk_sesiones_admin_expira CHECK (expira_en > creado_en AND expira_en <= tope_en)
      )
    `);
    // Buscar rápido todas las filas de una familia (para anularlas juntas)
    await queryRunner.query('CREATE INDEX idx_sesiones_admin_familia ON sesiones_admin (familia)');
    // Buscar rápido las filas de un admin (para la limpieza en el login)
    await queryRunner.query('CREATE INDEX idx_sesiones_admin_admin ON sesiones_admin (id_admin)');
    // Igual que las demás tablas: la API pública de Supabase no puede leerla
    await queryRunner.query('ALTER TABLE sesiones_admin ENABLE ROW LEVEL SECURITY');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Borrar la tabla también borra sus índices y restricciones
    await queryRunner.query('DROP TABLE sesiones_admin');
  }
}