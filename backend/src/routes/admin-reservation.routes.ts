// Rutas de reservas del administrador (RF-08, SAD 3.4). Todas exigen un access token de
// administrador (requireAdmin) antes de validar o tocar nada.
// N (va al ADR-07): el SAD 3.4 dice "PATCH /admin/reservas/:id" para aprobar, cancelar o
// eliminar; aquí cada acción tiene su propia ruta (sección 6), como "desactivar" en destinos.

import { Router } from 'express';
import type { AdminReservationController } from '../controllers/admin-reservation.controller';
import { requireAdmin } from '../middlewares/require-admin';
import { validate } from '../middlewares/validate';
import {
  adminActionSchema,
  adminRescheduleSchema,
  changePaymentStatusSchema,
} from '../models/admin-reservation.schema';
import type { AuthService } from '../services/auth.service';

export function createAdminReservationRouter(
  controller: AdminReservationController,
  authService: AuthService,
): Router {
  const router = Router();
  const adminOnly = requireAdmin(authService);

  router.get('/admin/reservas', adminOnly, controller.list);
  router.post('/admin/reservas/:id/aprobar', adminOnly, validate(adminActionSchema), controller.approve);
  router.post('/admin/reservas/:id/cancelar', adminOnly, validate(adminActionSchema), controller.cancel);
  router.delete('/admin/reservas/:id', adminOnly, validate(adminActionSchema), controller.remove);
    // NUEVO (8.G): reagenda del admin sin RN-02 (N-2a), ruta prevista en la sección 6
  router.patch('/admin/reservas/:id/fecha', adminOnly, validate(adminRescheduleSchema), controller.reschedule);
    // NUEVO (8.F): cambio del estado del pago (RF-09, CU-15), con la ruta del SAD 3.4 (decisión 3 = A)
  router.patch('/admin/pagos/:id', adminOnly, validate(changePaymentStatusSchema), controller.changePaymentStatus);
  return router;
}