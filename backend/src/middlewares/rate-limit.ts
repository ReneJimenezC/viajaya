// Límites de peticiones por IP (SAD 6 y decisiones del 03/11 y del 06/11).
// createRateLimit arma un límite con todo lo que es igual en los tres (login, sesión y
// consulta de reservas); cada archivo solo indica sus datos (decisión 13 = A, C17).
// Equivale a una sola clase de filtro (Bucket4j) que recibe su configuración por constructor.

import { rateLimit, type RateLimitRequestHandler } from 'express-rate-limit';
import { AppError } from '../errors/app-error';

// Ventana de tiempo común a todos los límites: 15 minutos
const WINDOW_MS = 15 * 60 * 1000;

// Los datos que cambian de un límite a otro
export interface RateLimitOptions {
  // Cuántas peticiones (que cuentan) se permiten por IP dentro de la ventana
  limit: number;
  // true = solo cuentan las respuestas con error (400 o más); los aciertos no suman
  onlyFailed: boolean;
  // Nombre del evento que queda en el log al bloquear (ej. 'login_rate_limited')
  event: string;
  // Mensaje que recibe el usuario en el 429
  message: string;
}

// Devuelve el middleware del límite. Ejemplo:
// createRateLimit({ limit: 5, onlyFailed: true, event: 'login_rate_limited', message: '...' })
export function createRateLimit(options: RateLimitOptions): RateLimitRequestHandler {
  return rateLimit({
    windowMs: WINDOW_MS,
    limit: options.limit,
    // Si es true, las respuestas menores a 400 se descuentan: solo cuentan las fallidas
    skipSuccessfulRequests: options.onlyFailed,
    // Cabeceras estándar "RateLimit" y "RateLimit-Policy" (cuántas quedan y cuándo se
    // reinicia) y, al bloquear, "Retry-After" con los segundos que faltan
    standardHeaders: 'draft-8',
    // Sin las cabeceras viejas "X-RateLimit-*" (son la versión anterior de las de arriba)
    legacyHeaders: false,
    // Al pasar el límite: en vez de la respuesta de la librería, se manda un AppError al
    // manejador central, así el 429 sale con el formato B como todos los errores
    handler: (req, _res, next) => {
      req.log.warn({ event: options.event }, 'Límite de peticiones alcanzado');
      next(new AppError(429, 'TOO_MANY_REQUESTS', options.message));
    },
  });
}