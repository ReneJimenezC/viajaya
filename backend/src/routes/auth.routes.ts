// Rutas de autenticación (SAD 3.4). Equivale a @RequestMapping("/auth") en Spring.

import { Router } from 'express';
import type { AuthController } from '../controllers/auth.controller';
import { validate } from '../middlewares/validate';
import { loginRateLimit } from '../middlewares/login-rate-limit';
import { loginSchema } from '../models/auth.schema';

// Recibe el controlador ya armado y devuelve el router con sus rutas
export function createAuthRouter(controller: AuthController): Router {
  const router = Router();
    // POST /auth/login: 1) límite de intentos, 2) valida el body, 3) controlador
  router.post('/auth/login', loginRateLimit, validate(loginSchema), controller.login);
  return router;
}