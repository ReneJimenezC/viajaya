// Límite de intentos en las rutas públicas que piden código + correo (decisión 12 = A, 06/11).
// Frena a quien prueba códigos a ciegas. La lógica común está en rate-limit.ts.
// Lo comparten la consulta (6.D) y, después, el cambio de fecha (6.E) y la cancelación (6.F):
// es UN solo contador, así los fallos en cualquiera de ellas suman juntos.

import { createRateLimit } from './rate-limit';

// 10 intentos FALLIDOS cada 15 minutos por IP; las consultas correctas no cuentan
export const lookupRateLimit = createRateLimit({
  limit: 10,
  onlyFailed: true,
  event: 'reservation_lookup_rate_limited',
  message: 'Demasiados intentos de consulta. Intenta de nuevo más tarde.',
});