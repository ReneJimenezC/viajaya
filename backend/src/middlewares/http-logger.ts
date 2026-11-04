// Anota en el log cada petición HTTP con su resultado y su duración (el "ticket" de cada
// huésped). Equivale a un filtro de log de peticiones en Spring.

import { randomUUID } from 'node:crypto';
import { pinoHttp } from 'pino-http';
import { logger } from '../config/logger';

// Ruta que Docker y Render consultan cada pocos segundos para saber si la API vive
const HEALTH_PATH = '/health';

export const httpLogger = pinoHttp({
  // Usa el mismo logger de toda la API (misma censura, mismo formato)
  logger,
  // Identificador único de cada petición (req.id); con él se juntan todas las líneas
  // de una misma petición. randomUUID usa aleatoriedad criptográfica (como UUID.randomUUID()).
  genReqId: () => randomUUID(),
  // Nivel de cada línea según cómo terminó la petición
  customLogLevel: (req, res, error) => {
    // Falló el servidor (500 o más), o hubo una excepción: es un error
    if (error || res.statusCode >= 500) {
      return 'error';
    }
    // El cliente mandó algo mal (400 a 499): es un aviso
    if (res.statusCode >= 400) {
      return 'warn';
    }
    // /health que respondió bien: no se anota (decisión A del 03/11).
    // split('?')[0] quita la parte de consulta: "/health?x=1" → "/health"
    if (req.url?.split('?')[0] === HEALTH_PATH) {
      return 'silent';
    }
    // Todo lo demás que salió bien
    return 'info';
  },
});