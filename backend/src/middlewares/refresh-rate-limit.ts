// Límite para /auth/refresh y /auth/logout (decisión 4 del 03/11): evita que alguien
// sature la base con peticiones falsas. Contador propio, separado del del login.
// La lógica común está en rate-limit.ts.

import { createRateLimit } from './rate-limit';

// 30 peticiones cada 15 minutos por IP (cuentan todas); el uso normal es ~1 cada 14 minutos
export const sessionRateLimit = createRateLimit({
  limit: 30,
  onlyFailed: false,
  event: 'session_rate_limited',
  message: 'Demasiadas solicitudes de sesión. Intenta de nuevo más tarde.',
});