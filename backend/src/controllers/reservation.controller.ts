// Controlador público de reservas para el turista (RF-03, RF-04 y RF-05). No exige token.

import type { Request, Response } from 'express';
import { AppError } from '../errors/app-error';
import type {
  CreateReservationInput,
  LookupReservationInput,
  RescheduleReservationInput,
} from '../models/reservation.schema';
import type { ReservationService } from '../services/reservation.service';

export class ReservationController {
  constructor(private readonly reservationService: ReservationService) {}

  // POST /reservas (CU-03). El body ya pasó por validate(createReservationSchema).
  // Responde 201: se guardó una reserva nueva.
  create = async (req: Request<unknown, unknown, CreateReservationInput>, res: Response): Promise<void> => {
    try {
      const { reservationId, reservation } = await this.reservationService.create(req.body);
      // Auditoría (SAD 4): solo el id interno. NO el código: con código + correo se
      // puede cancelar la reserva, así que no debe quedar en el log.
      req.log.info({ event: 'reservation_created', reservationId }, 'Reserva creada');
      res.status(201).json(reservation);
    } catch (error) {
      if (error instanceof AppError && error.status === 402) {
        // Pago rechazado (CU-03 6a): sin tarjeta, sin correo, sin código
        req.log.warn({ event: 'payment_declined', destinationId: req.body.destinationId }, 'Pago rechazado');
      }
      // Se relanza: el manejador central arma la respuesta en formato B
      throw error;
    }
  };

  // NUEVO (6.D): POST /reservas/consulta (CU-04). El body ya pasó por el límite de intentos
  // y por validate(lookupReservationSchema). Responde 200 con la misma forma que la reserva
  // creada (decisión 11 = A), o 404 si no hay una reserva activa con esos datos.
  // No se anota ni el código ni el correo: el log de la petición solo dice "/reservas/consulta".
  lookup = async (req: Request<unknown, unknown, LookupReservationInput>, res: Response): Promise<void> => {
    res.json(await this.reservationService.lookup(req.body));
  };

  // NUEVO (6.E): PATCH /reservas/fecha (CU-05). El body ya pasó por el límite de intentos y por
  // validate(rescheduleReservationSchema). Responde 200 con la reserva y su fecha nueva (V4).
  reschedule = async (req: Request<unknown, unknown, RescheduleReservationInput>, res: Response): Promise<void> => {
    const { reservationId, reservation } = await this.reservationService.reschedule(req.body);
    // Auditoría (SAD 4, V5): solo el id interno, sin código ni correo (como reservation_created)
    req.log.info({ event: 'reservation_rescheduled', reservationId }, 'Fecha de reserva cambiada');
    res.json(reservation);
  };
}