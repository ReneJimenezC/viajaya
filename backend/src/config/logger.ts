// Logger único de la API (el "libro de registro"). Escribe una línea JSON por evento.
// Equivale al Logger de SLF4J/Logback en Java. Todo el código importa "logger" desde aquí.

import pino from 'pino';
import { env } from './env';

// Desde qué nivel se anota: en producción solo lo importante; en desarrollo también
// los detalles; en las pruebas (Jest) nada, para no ensuciar la salida.
const LEVEL_BY_ENV = {
  production: 'info',
  development: 'debug',
  test: 'silent',
} as const;

export const logger = pino({
  level: LEVEL_BY_ENV[env.nodeEnv],
  // Hora legible (ISO 8601, en UTC) en vez de milisegundos desde 1970
  timestamp: pino.stdTimeFunctions.isoTime,
  // Nivel con su nombre ("info", "error") en vez de un número (30, 50): más fácil de leer
  formatters: {
    level: (label) => ({ level: label }),
  },
  // "Tinta censora": estos campos se reemplazan por "[Redacted]" aunque alguien
  // los mande al log por error. "*" = cualquier objeto de primer nivel.
  redact: {
    paths: [
      'req.headers.authorization', // access token (Bearer)
      'req.headers.cookie', // cookie con el refresh token
      'res.headers["set-cookie"]', // cookie que la API envía al navegador
      'password',
      '*.password',
      'refreshToken',
      '*.refreshToken',
      'cardNumber',
      '*.cardNumber',
    ],
    censor: '[Redacted]',
  },
});