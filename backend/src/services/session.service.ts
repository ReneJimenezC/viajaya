// Sesiones del administrador con refresh token (N-7): crear, renovar (rotación) y anular.
// Está aislado en su propio archivo para poder quitar el N-7 sin tocar el login.

import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { DataSource, EntityManager } from 'typeorm';
import { AppError } from '../errors/app-error';
import { AdminSessionRepository } from '../repositories/admin-session.repository';

// Decisiones del 03/11 (sección 3 de la bitácora)
const REFRESH_TOKEN_BYTES = 32; // 256 bits aleatorios
const INACTIVITY_MS = 20 * 60 * 1000; // muere si no se usa en 20 min
const ABSOLUTE_MS = 8 * 60 * 60 * 1000; // y siempre a las 8 h del login
const REUSE_GRACE_MS = 30 * 1000; // gracia de 30 s (dos pestañas, respuesta perdida)
const CLEANUP_AFTER_MS = 24 * 60 * 60 * 1000; // en el login se borran filas vencidas hace > 1 día
const MAX_INSERT_ATTEMPTS = 3; // reintentos si el hash ya existiera (casi imposible)

// Mensaje único para cualquier refresh rechazado: no da pistas de por qué
const INVALID_SESSION_MESSAGE = 'La sesión expiró o no es válida. Inicia sesión de nuevo.';

// Resultado de una renovación correcta
export interface RotatedSession {
  adminId: number;
  role: string;
  refreshToken: string;
}

// Avisos de seguridad que el controlador anota en el log (el servicio no tiene req.log)
export type SessionEvent = 'reuse_detected' | 'reuse_grace';

// Token nuevo: 32 bytes aleatorios en base64url (43 caracteres, sin + / =)
function generateToken(): string {
  return randomBytes(REFRESH_TOKEN_BYTES).toString('base64url');
}

// SHA-256 del token en hexadecimal: lo único que se guarda en la base
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

// La fecha más temprana de las dos (para no pasar nunca del tope de 8 h)
function earliest(a: Date, b: Date): Date {
  return a.getTime() <= b.getTime() ? a : b;
}

export class SessionService {
  constructor(private readonly dataSource: DataSource) {}

  // Crea una sesión nueva al hacer login. Devuelve el refresh token (va a la cookie).
  async start(adminId: number): Promise<string> {
    return this.dataSource.transaction(async (manager) => {
      const repo = new AdminSessionRepository(manager);
      const now = new Date();
      // Limpieza: filas de este admin cuyo tope pasó hace más de 1 día
      await repo.deleteExpiredForAdmin(adminId, new Date(now.getTime() - CLEANUP_AFTER_MS));
      const absoluteExpiresAt = new Date(now.getTime() + ABSOLUTE_MS);
      return this.issue(manager, adminId, randomUUID(), now, absoluteExpiresAt);
    });
  }

  // Cambia un refresh token por uno nuevo (rotación). Lanza 401 si no sirve.
  // onEvent recibe los avisos de seguridad para anotarlos en el log.
  async rotate(token: string, onEvent: (event: SessionEvent) => void): Promise<RotatedSession> {
    const tokenHash = hashToken(token);
    // reuseDetected se anota FUERA de la transacción: la anulación de la familia se guarda
    // (commit) y recién después se responde 401.
    let reuseDetected = false;

    const result = await this.dataSource.transaction(async (manager) => {
      const repo = new AdminSessionRepository(manager);
      const now = new Date();
      const session = await repo.findByHashForUpdate(tokenHash);

      // No existe, ya anulado, o pasó el tope de 8 h
      if (!session || session.revokedAt || now >= session.absoluteExpiresAt) {
        return null;
      }

      if (session.usedAt) {
        const sinceUse = now.getTime() - session.usedAt.getTime();
        if (sinceUse > REUSE_GRACE_MS) {
          // Token viejo usado otra vez: alguien más lo tiene. Se anula toda la sesión.
          await repo.revokeFamily(session.family, now);
          reuseDetected = true;
          return null;
        }
        // Dentro de la gracia (decisión 2 = A): se anula el sucesor que nadie usó
        // y se entrega uno nuevo de la misma familia
        onEvent('reuse_grace');
        await repo.revokeUnusedInFamily(session.family, now);
      } else {
        // Uso normal: si pasaron más de 20 min desde que se entregó, venció por inactividad
        if (now > session.expiresAt) {
          return null;
        }
        await repo.markUsed(session.id, now);
      }

      const role = await repo.findAdminRole(session.adminId);
      if (!role) {
        return null;
      }
      const refreshToken = await this.issue(
        manager,
        session.adminId,
        session.family,
        now,
        session.absoluteExpiresAt,
      );
      return { adminId: session.adminId, role, refreshToken };
    });

    if (reuseDetected) {
      onEvent('reuse_detected');
    }
    if (!result) {
      throw new AppError(401, 'UNAUTHORIZED', INVALID_SESSION_MESSAGE);
    }
    return result;
  }

  // Logout: anula toda la sesión del token. Si el token no existe, no hace nada.
  async revoke(token: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const repo = new AdminSessionRepository(manager);
      const session = await repo.findByHashForUpdate(hashToken(token));
      if (session) {
        await repo.revokeFamily(session.family, new Date());
      }
    });
  }

  // Crea y guarda un token de la familia indicada. Reintenta si el hash ya existiera.
  private async issue(
    manager: EntityManager,
    adminId: number,
    family: string,
    now: Date,
    absoluteExpiresAt: Date,
  ): Promise<string> {
    const repo = new AdminSessionRepository(manager);
    // Vence en 20 min, pero nunca después del tope de 8 h
    const expiresAt = earliest(new Date(now.getTime() + INACTIVITY_MS), absoluteExpiresAt);
    for (let attempt = 1; attempt <= MAX_INSERT_ATTEMPTS; attempt++) {
      const token = generateToken();
      const inserted = await repo.insertIfNew({
        adminId,
        family,
        tokenHash: hashToken(token),
        createdAt: now,
        expiresAt,
        absoluteExpiresAt,
      });
      if (inserted) {
        return token;
      }
    }
    throw new Error('No se pudo generar un refresh token único');
  }
}