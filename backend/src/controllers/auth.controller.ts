// Controlador de autenticación: recibe la petición HTTP, llama al servicio y responde.
// Equivale a un @RestController de Spring. No tiene lógica de negocio.

import type { Request, Response } from 'express';
import { AppError } from '../errors/app-error';
import type { AuthService } from '../services/auth.service';
import type { LoginInput } from '../models/auth.schema';

export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // POST /auth/login. El body ya pasó por validate(loginSchema).
  // Es una "función flecha" para poder pasarla al router sin perder "this".
  login = async (req: Request<unknown, unknown, LoginInput>, res: Response): Promise<void> => {
    try {
      const result = await this.authService.login(req.body);
      // Evento de seguridad (sin correo ni contraseña); req.log lleva el ticket req.id
      req.log.info({ event: 'login_succeeded' }, 'Inicio de sesión correcto');
      // Las respuestas con tokens no se guardan en ninguna caché (RFC 6749, OAuth2)
      res.set('Cache-Control', 'no-store');
      res.json(result);
    } catch (error) {
      if (error instanceof AppError && error.status === 401) {
        req.log.warn({ event: 'login_failed' }, 'Inicio de sesión fallido');
      }
      // Se relanza: el manejador central arma la respuesta 401 en formato B
      throw error;
    }
  };
}