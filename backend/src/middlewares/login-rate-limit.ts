// Límite de intentos en el inicio de sesión (SAD 6). Frena a quien prueba muchas
// contraseñas seguidas. La lógica común está en rate-limit.ts.

import { createRateLimit } from './rate-limit';

// Decisión A (03/11): 5 intentos FALLIDOS cada 15 minutos por IP; los correctos no cuentan
export const loginRateLimit = createRateLimit({
  limit: 5,
  onlyFailed: true,
  event: 'login_rate_limited',
  message: 'Demasiados intentos de inicio de sesión. Intenta de nuevo más tarde.',
});