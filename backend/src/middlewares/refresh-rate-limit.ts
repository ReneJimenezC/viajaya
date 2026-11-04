// Límite para /auth/refresh y /auth/logout (decisión 4 del 03/11): evita que alguien
// sature la base con peticiones falsas. Contador propio, separado del del login.

import { rateLimit } from 'express-rate-limit';
import { AppError } from '../errors/app-error';

// 30 peticiones cada 15 minutos por IP; el uso normal es ~1 cada 14 minutos
const SESSION_WINDOW_MS = 15 * 60 * 1000;
const SESSION_MAX_REQUESTS = 30;

export const sessionRateLimit = rateLimit({
  windowMs: SESSION_WINDOW_MS,
  limit: SESSION_MAX_REQUESTS,
  // Aquí cuentan todas las peticiones (no solo las fallidas)
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: (req, _res, next) => {
    req.log.warn({ event: 'session_rate_limited' }, 'Límite de renovaciones de sesión alcanzado');
    next(
      new AppError(
        429,
        'TOO_MANY_REQUESTS',
        'Demasiadas solicitudes de sesión. Intenta de nuevo más tarde.',
      ),
    );
  },
});