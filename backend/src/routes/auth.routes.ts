// Rutas de autenticación (SAD 3.4). Equivale a @RequestMapping("/auth") en Spring.

import { Router } from 'express';
import type { AuthController } from '../controllers/auth.controller';
import { validate } from '../middlewares/validate';
import { loginSchema } from '../models/auth.schema';

// Recibe el controlador ya armado y devuelve el router con sus rutas
export function createAuthRouter(controller: AuthController): Router {
  const router = Router();
  // POST /auth/login: primero valida el body, después llama al controlador
  router.post('/auth/login', validate(loginSchema), controller.login);
  return router;
}