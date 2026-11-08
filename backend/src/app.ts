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
import { DestinationRepository } from './repositories/destination.repository';
import { QuoteService } from './services/quote.service';
import { QuoteController } from './controllers/quote.controller';
import { createQuoteRouter } from './routes/quote.routes';
import { ReservationRepository } from './repositories/reservation.repository';
import { ReservationService } from './services/reservation.service';
import { SimulatedPaymentGateway } from './services/payment-gateway';
import { ReservationController } from './controllers/reservation.controller';
import { createReservationRouter } from './routes/reservation.routes';
// NUEVO (Paso 8): gestión de reservas del admin
import { AdminActionRepository } from './repositories/admin-action.repository';
import { AdminReservationService } from './services/admin-reservation.service';
import { AdminReservationController } from './controllers/admin-reservation.controller';
import { createAdminReservationRouter } from './routes/admin-reservation.routes';


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
    // Módulo de cotización (RF-02): repositorio → servicio → controlador → rutas
  const quoteService = new QuoteService(new DestinationRepository(AppDataSource.manager));
  const quoteController = new QuoteController(quoteService);
     // Módulo de reservas (RF-03): cada reserva abre una transacción que entrega los repositorios
  // que trabajan dentro de ella; la pasarela simulada va por constructor (SAD 2.2, ADR-05)
  const reservationService = new ReservationService(
    (work) =>
      AppDataSource.transaction((manager) =>
        work({
          destinations: new DestinationRepository(manager),
          reservations: new ReservationRepository(manager),
        }),
      ),
    new SimulatedPaymentGateway(),
  );
  const reservationController = new ReservationController(reservationService);
     // NUEVO (Paso 8): reservas del admin (RF-08). Cada acción abre una transacción con los
  // repositorios de reservas y del historial (V14: la acción y su fila, todo o nada)
  const adminReservationService = new AdminReservationService((work) =>
    AppDataSource.transaction((manager) =>
      work({
        reservations: new ReservationRepository(manager),
        adminActions: new AdminActionRepository(manager),
      }),
    ),
  );
  const adminReservationController = new AdminReservationController(adminReservationService);
  // Registra las rutas. Aquí se sumarán las de los módulos client y admin.
  app.use(healthRouter);
  app.use(createAuthRouter(authController));
    app.use(createDestinationRouter(destinationController));
    app.use(createAdminDestinationRouter(adminDestinationController, authService));
    app.use(createQuoteRouter(quoteController));
      app.use(createReservationRouter(reservationController));
        // NUEVO (Paso 8)
  app.use(createAdminReservationRouter(adminReservationController, authService));
  // Ninguna ruta atendió la petición → 404
  app.use(notFoundHandler);
  // Siempre al final: convierte cualquier error en JSON
  app.use(errorHandler);

  return app;
}
