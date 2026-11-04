// Rutas públicas de destinos (RF-01, SAD 3.4).

import { Router } from 'express';
import type { DestinationController } from '../controllers/destination.controller';

export function createDestinationRouter(controller: DestinationController): Router {
  const router = Router();
  router.get('/destinos', controller.search);
  return router;
}