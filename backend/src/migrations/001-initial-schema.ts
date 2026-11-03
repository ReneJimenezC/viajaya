// Primera migración: crea las 4 tablas del sistema en una sola base (SAD 3.1, bitácora 5.1).
// Equivale a un V1__initial_schema.sql de Flyway. NUNCA se edita una vez aplicada en
// producción: cualquier cambio posterior va en una migración nueva.

import type { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema implements MigrationInterface {
  // Nombre con el que TypeORM la registra en la tabla "migrations"
   // TypeORM exige un número de 13+ dígitos al final para ordenar las migraciones.
  // Usamos la fecha de creación: 2026-11-03 08:43:00 (AAAAMMDDhhmmss)
  name = 'InitialSchema20261103084300';

  // up: aplica la migración (npm run migration:run)
  public async up(queryRunner: QueryRunner): Promise<void> {
    // ---------- USUARIO_ADMIN ----------
    await queryRunner.query(`
      CREATE TABLE administrador (
        -- Lo genera siempre la base; ALWAYS impide escribirlo a mano
        id_admin      integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        nombre        text NOT NULL,
        email         text NOT NULL,
        -- Solo el hash bcrypt; la contraseña nunca se guarda (RNF-02)
        password_hash text NOT NULL,
        -- Rol para el control de acceso (SAD); por ahora existe uno solo
        rol           text NOT NULL DEFAULT 'admin'
                      CONSTRAINT chk_administrador_rol CHECK (rol IN ('admin'))
      )
    `);
    // Correo único sin distinguir mayúsculas: Ana@x.com = ana@x.com
    await queryRunner.query(`
      CREATE UNIQUE INDEX uq_administrador_email ON administrador (lower(email))
    `);

    // ---------- DESTINO ----------
    await queryRunner.query(`
      CREATE TABLE destinos (
        id_destino       integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        nombre           text NOT NULL,
        descripcion      text,
        -- Obligatorio: RF-01 busca destinos por lugar
        lugar            text NOT NULL,
        -- Colones con 2 decimales exactos (nunca float)
        precio_base      numeric(12,2) NOT NULL
                         CONSTRAINT chk_destinos_precio_base CHECK (precio_base > 0),
        capacidad_diaria integer NOT NULL
                         CONSTRAINT chk_destinos_capacidad CHECK (capacidad_diaria > 0),
        -- Los destinos no se borran: se desactivan (RF-07)
        activo           boolean NOT NULL DEFAULT true
      )
    `);
    // Nombre único sin mayúsculas ni espacios a los lados (CU-07): "Arenal" = " arenal "
    await queryRunner.query(`
      CREATE UNIQUE INDEX uq_destinos_nombre ON destinos (lower(btrim(nombre)))
    `);

    // ---------- RESERVA ----------
    await queryRunner.query(`
      CREATE TABLE reservas (
        id_reserva        integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        -- Código de confirmación que recibe el turista
        codigo            text NOT NULL CONSTRAINT uq_reservas_codigo UNIQUE,
        -- FK real: no puede existir una reserva de un destino inexistente.
        -- RESTRICT: no se puede borrar un destino que tenga reservas
        id_destino        integer NOT NULL
                          CONSTRAINT fk_reservas_destino REFERENCES destinos (id_destino)
                          ON DELETE RESTRICT,
        nombre_cliente    text NOT NULL,
        email_cliente     text NOT NULL,
        -- Solo la fecha, sin hora
        fecha_viaje       date NOT NULL,
        cantidad_personas integer NOT NULL
                          CONSTRAINT chk_reservas_personas CHECK (cantidad_personas > 0),
        -- Cotización congelada al reservar (RN-03): no cambia si el admin edita el precio
        precio_base       numeric(12,2) NOT NULL
                          CONSTRAINT chk_reservas_precio_base CHECK (precio_base > 0),
        subtotal          numeric(12,2) NOT NULL
                          CONSTRAINT chk_reservas_subtotal CHECK (subtotal > 0),
        iva               numeric(12,2) NOT NULL
                          CONSTRAINT chk_reservas_iva CHECK (iva >= 0),
        monto_total       numeric(12,2) NOT NULL
                          CONSTRAINT chk_reservas_monto_total CHECK (monto_total > 0),
        estado            text NOT NULL DEFAULT 'Pendiente'
                          CONSTRAINT chk_reservas_estado
                          CHECK (estado IN ('Pendiente', 'Aprobada', 'Cancelada')),
        -- Cuántas veces se movió la fecha
        reagendas         integer NOT NULL DEFAULT 0
                          CONSTRAINT chk_reservas_reagendas CHECK (reagendas >= 0),
        -- Momento exacto con zona horaria (Render corre en UTC)
        creado_en         timestamptz NOT NULL DEFAULT now(),
        -- Borrado lógico (CU-14): NULL = visible
        eliminado_en      timestamptz
      )
    `);
    // Acelera la suma de personas por destino y fecha (RN-01, SAD 3.1)
    await queryRunner.query(`
      CREATE INDEX idx_reservas_destino_fecha ON reservas (id_destino, fecha_viaje)
    `);

    // ---------- PAGO ----------
    await queryRunner.query(`
      CREATE TABLE pagos (
        id_pago               integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        -- RESTRICT (no CASCADE): borrar una reserva nunca borra su historial de cobros
        id_reserva            integer NOT NULL
                              CONSTRAINT fk_pagos_reserva REFERENCES reservas (id_reserva)
                              ON DELETE RESTRICT,
        monto                 numeric(12,2) NOT NULL
                              CONSTRAINT chk_pagos_monto CHECK (monto > 0),
        -- Solo el último dígito; nunca la tarjeta completa (SAD)
        tarjeta_ultimo_digito integer NOT NULL
                              CONSTRAINT chk_pagos_digito CHECK (tarjeta_ultimo_digito BETWEEN 0 AND 9),
        estado                text NOT NULL
                              CONSTRAINT chk_pagos_estado
                              CHECK (estado IN ('Pendiente', 'Aprobado', 'Rechazado')),
        fecha                 timestamptz NOT NULL DEFAULT now()
      )
    `);
    // Postgres no indexa las FK solo: acelera buscar los pagos de una reserva
    await queryRunner.query(`
      CREATE INDEX idx_pagos_reserva ON pagos (id_reserva)
    `);

    // ---------- SEGURIDAD (Supabase) ----------
    // RLS sin políticas = la API pública de Supabase no puede leer ni escribir estas tablas.
    // El backend sí puede, porque se conecta como dueño de las tablas.
    await queryRunner.query(`ALTER TABLE administrador ENABLE ROW LEVEL SECURITY`);
    await queryRunner.query(`ALTER TABLE destinos ENABLE ROW LEVEL SECURITY`);
    await queryRunner.query(`ALTER TABLE reservas ENABLE ROW LEVEL SECURITY`);
    await queryRunner.query(`ALTER TABLE pagos ENABLE ROW LEVEL SECURITY`);
    // La tabla "migrations" la crea TypeORM; también se protege
    await queryRunner.query(`ALTER TABLE migrations ENABLE ROW LEVEL SECURITY`);
  }

  // down: deshace la migración (npm run migration:revert), en orden inverso
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE migrations DISABLE ROW LEVEL SECURITY`);
    // Primero las tablas que dependen de otras (pagos → reservas → destinos)
    await queryRunner.query(`DROP TABLE pagos`);
    await queryRunner.query(`DROP TABLE reservas`);
    await queryRunner.query(`DROP TABLE destinos`);
    await queryRunner.query(`DROP TABLE administrador`);
  }
}