// Rutas públicas de reservas (RF-03, RF-04 y RF-05, SAD 3.4).

import { Router } from 'express';
import type { ReservationController } from '../controllers/reservation.controller';
import { lookupRateLimit } from '../middlewares/reservation-rate-limit';
import { validate } from '../middlewares/validate';
import {
  createReservationSchema,
  lookupReservationSchema,
  rescheduleReservationSchema,
} from '../models/reservation.schema';

export function createReservationRouter(controller: ReservationController): Router {
  const router = Router();
  router.post('/reservas', validate(createReservationSchema), controller.create);
  // Consulta con código + correo en el body (N-4: POST en vez del GET del SAD 3.4, para que esos
  // datos no queden en URLs ni logs). 1) límite de intentos, 2) valida, 3) controlador.
  // El límite va PRIMERO: así también cuentan los intentos con formato inválido (400).
  router.post('/reservas/consulta', lookupRateLimit, validate(lookupReservationSchema), controller.lookup);
  // NUEVO (6.E): cambio de fecha (decisión 15 = C, N-4: el SAD dice PATCH /reservas/:codigo/fecha;
  // aquí el código va en el body). Mismo límite de intentos que la consulta (un solo contador).
  router.patch('/reservas/fecha', lookupRateLimit, validate(rescheduleReservationSchema), controller.reschedule);
  return router;
}