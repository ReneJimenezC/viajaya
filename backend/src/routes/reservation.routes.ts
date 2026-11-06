// Rutas públicas de reservas (RF-03, SAD 3.4).

import { Router } from 'express';
import type { ReservationController } from '../controllers/reservation.controller';
import { validate } from '../middlewares/validate';
import { createReservationSchema } from '../models/reservation.schema';

export function createReservationRouter(controller: ReservationController): Router {
  const router = Router();
  router.post('/reservas', validate(createReservationSchema), controller.create);
  return router;
}