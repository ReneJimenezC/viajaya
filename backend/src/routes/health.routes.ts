// Rutas de salud. Una ruta solo conecta método + URL con su controlador
// (como @GetMapping en Spring). La lógica vive en el controlador.

import { Router } from 'express';
import { getHealth } from '../controllers/health.controller';

// Router = mini aplicación que agrupa rutas relacionadas
export const healthRouter = Router();

// GET /health -> getHealth
healthRouter.get('/health', getHealth);