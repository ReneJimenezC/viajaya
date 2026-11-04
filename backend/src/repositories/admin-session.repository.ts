// Acceso a la tabla "sesiones_admin" (refresh tokens, N-7).
// Recibe el EntityManager de la transacción en curso, para que todas sus consultas
// vayan dentro de la misma transacción (como un @Transactional de Spring).

import { IsNull, LessThan, type EntityManager } from 'typeorm';
import { AdminSession } from '../models/admin-session.entity';
import { Admin } from '../models/admin.entity';

// Datos para crear una fila nueva
export interface NewSession {
  adminId: number;
  family: string;
  tokenHash: string;
  createdAt: Date;
  expiresAt: Date;
  absoluteExpiresAt: Date;
}

export class AdminSessionRepository {
  constructor(private readonly manager: EntityManager) {}

  // Busca la fila del token y la BLOQUEA hasta el fin de la transacción (SELECT ... FOR UPDATE).
  // Si llegan dos renovaciones con el mismo token a la vez, la segunda espera a la primera.
  findByHashForUpdate(tokenHash: string): Promise<AdminSession | null> {
    return this.manager.findOne(AdminSession, {
      where: { tokenHash },
      lock: { mode: 'pessimistic_write' },
    });
  }

  // Inserta una fila. Devuelve false si ese hash ya existía (casi imposible): ON CONFLICT
  // DO NOTHING evita el error, que en Postgres anularía toda la transacción.
  async insertIfNew(session: NewSession): Promise<boolean> {
    const rows: unknown[] = await this.manager.query(
      `INSERT INTO sesiones_admin (id_admin, familia, token_hash, creado_en, expira_en, tope_en)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (token_hash) DO NOTHING
       RETURNING id_sesion`,
      [
        session.adminId,
        session.family,
        session.tokenHash,
        session.createdAt,
        session.expiresAt,
        session.absoluteExpiresAt,
      ],
    );
    return rows.length === 1;
  }

  // Marca un token como usado (ya se cambió por uno nuevo)
  async markUsed(id: number, at: Date): Promise<void> {
    await this.manager.update(AdminSession, { id }, { usedAt: at });
  }

  // Anula los tokens de la familia que todavía no se usaron (el sucesor que nadie recibió)
  async revokeUnusedInFamily(family: string, at: Date): Promise<void> {
    await this.manager.update(
      AdminSession,
      { family, usedAt: IsNull(), revokedAt: IsNull() },
      { revokedAt: at },
    );
  }

  // Anula TODA la familia (logout o robo detectado). Las ya anuladas conservan su fecha.
  async revokeFamily(family: string, at: Date): Promise<void> {
    await this.manager.update(AdminSession, { family, revokedAt: IsNull() }, { revokedAt: at });
  }

  // Borra las filas de un admin cuyo tope de 8 h pasó antes de "before" (limpieza)
  async deleteExpiredForAdmin(adminId: number, before: Date): Promise<void> {
    await this.manager.delete(AdminSession, { adminId, absoluteExpiresAt: LessThan(before) });
  }

  // Rol actual del admin (para el access token nuevo); null si el admin ya no existe
  async findAdminRole(adminId: number): Promise<string | null> {
    const admin = await this.manager.findOne(Admin, { where: { id: adminId }, select: { id: true, role: true } });
    return admin ? admin.role : null;
  }
}