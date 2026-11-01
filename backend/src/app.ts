// Arma la aplicación Express SIN ponerla a escuchar.
// Separarlo de server.ts permite probar la app con Jest sin abrir un puerto.

import express from 'express';
import { healthRouter } from './routes/health.routes';

export function createApp(): express.Express {
  // Crea la aplicación
  const app = express();

  // Quita la cabecera "X-Powered-By: Express" (no revelar la tecnología usada)
  app.disable('x-powered-by');

  // Registra las rutas. Aquí se sumarán las de los módulos client y admin.
  app.use(healthRouter);

  return app;
}
