// Rutas de destinos del administrador (RF-07, SAD 3.4). Todas exigen un access token
// de administrador (requireAdmin) antes de validar o tocar nada.

import { Router } from 'express';
import type { AdminDestinationController } from '../controllers/admin-destination.controller';
import { requireAdmin } from '../middlewares/require-admin';
import { validate } from '../middlewares/validate';
import { createDestinationSchema, updateDestinationSchema } from '../models/destination.schema';
import type { AuthService } from '../services/auth.service';

export function createAdminDestinationRouter(
  controller: AdminDestinationController,
  authService: AuthService,
): Router {
  const router = Router();
  const adminOnly = requireAdmin(authService);

  router.get('/admin/destinos', adminOnly, controller.list);
  router.post('/admin/destinos', adminOnly, validate(createDestinationSchema), controller.create);
  router.patch('/admin/destinos/:id', adminOnly, validate(updateDestinationSchema), controller.update);
  router.post('/admin/destinos/:id/desactivar', adminOnly, controller.deactivate);
  return router;
}