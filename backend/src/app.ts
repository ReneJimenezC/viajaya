// Arma la aplicación Express SIN ponerla a escuchar.
// Separarlo de server.ts permite probar la app con Jest sin abrir un puerto.

import express from 'express';
import { healthRouter } from './routes/health.routes';
import { httpLogger } from './middlewares/http-logger';
import { errorHandler, notFoundHandler } from './middlewares/error-handler';
import { env } from './config/env';
import { AppDataSource } from './config/data-source';
import { Admin } from './models/admin.entity';
import { AdminRepository } from './repositories/admin.repository';
import { AuthService } from './services/auth.service';
import { SessionService } from './services/session.service';
import { AuthController } from './controllers/auth.controller';
import { createAuthRouter } from './routes/auth.routes';
import { DestinationService } from './services/destination.service';
import { AdminDestinationController } from './controllers/admin-destination.controller';
import { createAdminDestinationRouter } from './routes/admin-destination.routes';
import { DestinationController } from './controllers/destination.controller';
import { createDestinationRouter } from './routes/destination.routes';




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

  
  // Arma las piezas del módulo auth, de adentro hacia afuera:
  // repositorio → servicio → controlador → rutas (lo que en Spring hace la inyección)
  const adminRepository = new AdminRepository(AppDataSource.getRepository(Admin));
  const authService = new AuthService(adminRepository, env.jwtSecret);
    const sessionService = new SessionService(AppDataSource);
  const authController = new AuthController(authService, sessionService);

  // Módulo de destinos (RF-07): servicio → controlador → rutas
  const destinationService = new DestinationService(AppDataSource);
  const adminDestinationController = new AdminDestinationController(destinationService);
  const destinationController = new DestinationController(destinationService);



  // Registra las rutas. Aquí se sumarán las de los módulos client y admin.
  app.use(healthRouter);
  app.use(createAuthRouter(authController));
    app.use(createDestinationRouter(destinationController));
    app.use(createAdminDestinationRouter(adminDestinationController, authService));
  
  // Ninguna ruta atendió la petición → 404
  app.use(notFoundHandler);
  // Siempre al final: convierte cualquier error en JSON
  app.use(errorHandler);

  return app;
}
