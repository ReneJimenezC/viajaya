// Controlador de reservas del administrador (RF-08, CU-11 a CU-14). Las rutas ya pasaron por
// requireAdmin (y las acciones por validate), así que req.admin existe y el body está limpio.

import type { Request, Response } from 'express';
import type { AdminActionInput, ChangePaymentStatusInput } from '../models/admin-reservation.schema';
import type { AdminReservationService } from '../services/admin-reservation.service';
import { parseId } from './parse-id';

// V20: el mismo mensaje del servicio para un :id imposible ("abc", "0") o inexistente
const NOT_FOUND_MESSAGE = 'La reserva no existe';
// NUEVO (8.F): CU-15 2a, para un :id de pago imposible o inexistente
const PAYMENT_NOT_FOUND_MESSAGE = 'El pago no existe';

// Id del admin que hace la petición (lo dejó requireAdmin en req.admin). Si no está, la ruta
// se armó sin requireAdmin: es un error de programación → 500, nunca un acceso sin permiso.
// Ejemplo: req.admin = { id: 3, role: 'admin' } → 3
function adminIdOf(req: Request): number {
  if (!req.admin) {
    throw new Error('Ruta de admin sin requireAdmin');
  }
  return req.admin.id;
}

export class AdminReservationController {
  constructor(private readonly adminReservationService: AdminReservationService) {}

  // GET /admin/reservas (CU-11). 200 con la lista; [] si no hay reservas (V18).
  list = async (_req: Request, res: Response): Promise<void> => {
    res.json(await this.adminReservationService.list());
  };

  // POST /admin/reservas/:id/aprobar (CU-12). 200 con la reserva aprobada (V25).
  approve = async (req: Request<{ id: string }, unknown, AdminActionInput>, res: Response): Promise<void> => {
    const adminId = adminIdOf(req);
    const reservation = await this.adminReservationService.approve(
      parseId(req.params.id, NOT_FOUND_MESSAGE),
      adminId,
      req.body,
    );
    // Auditoría (SAD 4, V28): ids internos, sin código ni correo
    req.log.info({ event: 'reservation_approved', reservationId: reservation.id, adminId }, 'Reserva aprobada');
    res.json(reservation);
  };

  // POST /admin/reservas/:id/cancelar (CU-13). 200 con la reserva cancelada (V25).
  cancel = async (req: Request<{ id: string }, unknown, AdminActionInput>, res: Response): Promise<void> => {
    const adminId = adminIdOf(req);
    const reservation = await this.adminReservationService.cancel(
      parseId(req.params.id, NOT_FOUND_MESSAGE),
      adminId,
      req.body,
    );
    req.log.info(
      { event: 'reservation_cancelled_by_admin', reservationId: reservation.id, adminId },
      'Reserva cancelada por el administrador',
    );
    res.json(reservation);
  };

  // DELETE /admin/reservas/:id (CU-14). 204 sin contenido (V25): ya no hay nada que mostrar.
  remove = async (req: Request<{ id: string }, unknown, AdminActionInput>, res: Response): Promise<void> => {
    const adminId = adminIdOf(req);
    const reservationId = parseId(req.params.id, NOT_FOUND_MESSAGE);
    await this.adminReservationService.remove(reservationId, adminId, req.body);
    req.log.info({ event: 'reservation_deleted', reservationId, adminId }, 'Reserva eliminada');
    res.status(204).end();
  };

  
  // NUEVO (8.F) PATCH /admin/pagos/:id (CU-15 + N-1). 200 con la reserva (V37): si el pago se
  // rechazó, ahí se ve también la reserva cancelada.
  changePaymentStatus = async (
    req: Request<{ id: string }, unknown, ChangePaymentStatusInput>,
    res: Response,
  ): Promise<void> => {
    const adminId = adminIdOf(req);
    const paymentId = parseId(req.params.id, PAYMENT_NOT_FOUND_MESSAGE);
    const reservation = await this.adminReservationService.changePaymentStatus(paymentId, adminId, req.body);
    // Auditoría (SAD 4: "cambios de pago", V38): ids y el estado nuevo; sin tarjeta, código ni correo
    req.log.info(
      { event: 'payment_status_changed', paymentId, reservationId: reservation.id, adminId, status: req.body.status },
      'Estado del pago cambiado',
    );
    res.json(reservation);
  };
}