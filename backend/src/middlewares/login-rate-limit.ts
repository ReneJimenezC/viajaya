// Límite de intentos en el inicio de sesión (SAD 6). Frena a quien prueba muchas
// contraseñas seguidas. Equivale a un filtro con Bucket4j en Spring.

import { rateLimit } from 'express-rate-limit';
import { AppError } from '../errors/app-error';

// Decisión A (03/11): 5 intentos FALLIDOS cada 15 minutos por IP
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_FAILED_ATTEMPTS = 5;

export const loginRateLimit = rateLimit({
  // Ventana de tiempo en milisegundos (15 min)
  windowMs: LOGIN_WINDOW_MS,
  // Cuántas peticiones (que cuentan) se permiten por IP dentro de la ventana
  limit: LOGIN_MAX_FAILED_ATTEMPTS,
  // Los logins correctos (respuesta menor a 400) se descuentan: solo cuentan los fallidos
  skipSuccessfulRequests: true,
  // Cabeceras estándar "RateLimit" y "RateLimit-Policy" (cuántos intentos quedan y
  // cuándo se reinicia) y, al bloquear, "Retry-After" con los segundos que faltan
  standardHeaders: 'draft-8',
  // Sin las cabeceras viejas "X-RateLimit-*" (son la versión anterior de las de arriba)
  legacyHeaders: false,
  // Al pasar el límite: en vez de la respuesta de la librería, se manda un AppError al
  // manejador central, así el 429 sale con el formato B como todos los errores
  handler: (req, _res, next) => {
    req.log.warn({ event: 'login_rate_limited' }, 'Límite de intentos de inicio de sesión alcanzado');
    next(
      new AppError(
        429,
        'TOO_MANY_REQUESTS',
        'Demasiados intentos de inicio de sesión. Intenta de nuevo más tarde.',
      ),
    );
  },
});