// Migración 003: historial de acciones del administrador sobre las reservas (decisión 1 = B
// del Paso 8). Guarda quién hizo qué, cuándo y por qué (SAD 4: auditoría y trazabilidad de
// cobros). Está en su propia migración para poder quitarla sin tocar la 001 (N-1, N-2a, N-3).

import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AdminActions implements MigrationInterface {
  // TypeORM exige que el nombre termine en 13+ dígitos para ordenar: descripción + AAAAMMDDhhmmss
  name = 'AdminActions20261108120000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Una fila por cada acción del admin sobre una reserva (V9). Solo se agregan filas.
    await queryRunner.query(`
      CREATE TABLE acciones_admin (
        id_accion      integer GENERATED ALWAYS AS IDENTITY,
        id_reserva     integer NOT NULL,
        -- NULL si el admin se borra: el historial se conserva (V11)
        id_admin       integer,
        accion         text NOT NULL,
        motivo         text,
        -- Solo en 'reagendar': de qué fecha a qué fecha se movió (V12)
        fecha_anterior date,
        fecha_nueva    date,
        creado_en      timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT pk_acciones_admin PRIMARY KEY (id_accion),
        CONSTRAINT fk_acciones_admin_reserva FOREIGN KEY (id_reserva)
          REFERENCES reservas (id_reserva) ON DELETE RESTRICT,
        CONSTRAINT fk_acciones_admin_admin FOREIGN KEY (id_admin)
          REFERENCES administrador (id_admin) ON DELETE SET NULL,
        -- Acciones permitidas (V13)
        CONSTRAINT chk_acciones_admin_accion CHECK (accion IN (
          'aprobar', 'cancelar', 'eliminar',
          'pago_pendiente', 'pago_aprobado', 'pago_rechazado', 'reagendar'
        )),
        -- Si hay motivo: de 1 a 500 caracteres y no solo espacios (V10)
        CONSTRAINT chk_acciones_admin_motivo_largo CHECK (
          motivo IS NULL OR (char_length(motivo) <= 500 AND btrim(motivo) <> '')
        ),
        -- Motivo obligatorio en las acciones excepcionales (V10, pedido del profesor)
        CONSTRAINT chk_acciones_admin_motivo_obligatorio CHECK (
          accion NOT IN ('reagendar', 'pago_rechazado') OR motivo IS NOT NULL
        ),
        -- Las dos fechas, distintas, en 'reagendar'; ninguna en las demás (V12)
        CONSTRAINT chk_acciones_admin_fechas CHECK (
          (accion = 'reagendar' AND fecha_anterior IS NOT NULL AND fecha_nueva IS NOT NULL
             AND fecha_anterior <> fecha_nueva)
          OR (accion <> 'reagendar' AND fecha_anterior IS NULL AND fecha_nueva IS NULL)
        )
      )
    `);
    // Buscar rápido el historial de una reserva (y si el admin la reagendó, N-3)
    await queryRunner.query('CREATE INDEX idx_acciones_admin_reserva ON acciones_admin (id_reserva)');
    // Igual que las demás tablas: la API pública de Supabase no puede leerla
    await queryRunner.query('ALTER TABLE acciones_admin ENABLE ROW LEVEL SECURITY');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Borrar la tabla también borra su índice y sus restricciones
    await queryRunner.query('DROP TABLE acciones_admin');
  }
}