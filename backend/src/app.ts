// Arma la aplicación Express SIN ponerla a escuchar.
// Separarlo de server.ts permite probar la app con Jest sin abrir un puerto.

import express from 'express';
import { healthRouter } from './routes/health.routes';

import { httpLogger } from './middlewares/http-logger';
import { errorHandler, notFoundHandler } from './middlewares/error-handler';

// Tamaño máximo del body: sobra para un login o una reserva (menos de 1 KB)
const BODY_LIMIT = '10kb';

export function createApp(): express.Express {
  // Crea la aplicación
  const app = express();

  // Quita la cabecera "X-Powered-By: Express" (no revelar la tecnología usada)
  app.disable('x-powered-by');

  
  // 1) Primero el log: así se anotan TODAS las peticiones, incluso las que fallan después
  app.use(httpLogger);
  // 2) Lee el body JSON (si el Content-Type es application/json) y lo deja en req.body
  app.use(express.json({ limit: BODY_LIMIT }));

  // Registra las rutas. Aquí se sumarán las de los módulos client y admin.
  app.use(healthRouter);

  
  // Ninguna ruta atendió la petición → 404
  app.use(notFoundHandler);
  // Siempre al final: convierte cualquier error en JSON
  app.use(errorHandler);

  return app;
}
