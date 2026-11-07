// Rutas públicas de reservas (RF-03 y RF-04, SAD 3.4).

import { Router } from 'express';
import type { ReservationController } from '../controllers/reservation.controller';
import { lookupRateLimit } from '../middlewares/reservation-rate-limit';
import { validate } from '../middlewares/validate';
import { createReservationSchema, lookupReservationSchema } from '../models/reservation.schema';

export function createReservationRouter(controller: ReservationController): Router {
  const router = Router();
  router.post('/reservas', validate(createReservationSchema), controller.create);
  // NUEVO (6.D): consulta con código + correo en el body (N-4: POST en vez del GET del SAD 3.4,
  // para que esos datos no queden en URLs ni logs). 1) límite de intentos, 2) valida, 3) controlador.
  // El límite va PRIMERO: así también cuentan los intentos con formato inválido (400).
  router.post('/reservas/consulta', lookupRateLimit, validate(lookupReservationSchema), controller.lookup);
  return router;
}