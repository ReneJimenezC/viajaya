// Controlador de autenticación: recibe la petición HTTP, llama al servicio y responde.
// Equivale a un @RestController de Spring. No tiene lógica de negocio.

import type { Request, Response } from 'express';
import { AppError } from '../errors/app-error';
import type { AuthService } from '../services/auth.service';
import type { SessionEvent, SessionService } from '../services/session.service';
import type { LoginInput } from '../models/auth.schema';
import { clearRefreshCookie, readRefreshCookie, setRefreshCookie } from '../config/refresh-cookie';

export class AuthController {
    constructor(
    private readonly authService: AuthService,
    // N-7 (refresh token): aislado en su propio servicio
    private readonly sessionService: SessionService,
  ) {}

  // POST /auth/login. El body ya pasó por validate(loginSchema).
  // Es una "función flecha" para poder pasarla al router sin perder "this".
  login = async (req: Request<unknown, unknown, LoginInput>, res: Response): Promise<void> => {
    try {
            const admin = await this.authService.authenticate(req.body);
      const result = await this.authService.issueAccessToken(admin);
      // N-7: abre la sesión y entrega el refresh token en la cookie
      setRefreshCookie(res, await this.sessionService.start(admin.id));

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
  
  // POST /auth/refresh (N-7). No lleva body: el token viene en la cookie.
  // Responde lo mismo que el login (access token nuevo) y una cookie nueva.
  refresh = async (req: Request, res: Response): Promise<void> => {
    const token = readRefreshCookie(req);
    try {
      if (!token) {
        throw new AppError(401, 'UNAUTHORIZED', 'La sesión expiró o no es válida. Inicia sesión de nuevo.');
      }
      const rotated = await this.sessionService.rotate(token, (event: SessionEvent) => {
        if (event === 'reuse_detected') {
          req.log.warn({ event: 'session_reuse_detected' }, 'Refresh token reutilizado: sesión anulada');
        } else {
          req.log.info({ event: 'session_reuse_grace' }, 'Refresh token reusado dentro de la gracia');
        }
      });
      const result = await this.authService.issueAccessToken({ id: rotated.adminId, role: rotated.role });
      setRefreshCookie(res, rotated.refreshToken);
      res.set('Cache-Control', 'no-store');
      res.json(result);
    } catch (error) {
      if (error instanceof AppError && error.status === 401) {
        // La cookie ya no sirve: se le pide al navegador que la borre
        clearRefreshCookie(res);
        req.log.warn({ event: 'session_refresh_rejected' }, 'Renovación de sesión rechazada');
      }
      throw error;
    }
  };

  // POST /auth/logout (N-7). Anula la sesión y borra la cookie. Siempre responde 204,
  // exista o no la sesión (cerrar sesión dos veces no es un error).
  logout = async (req: Request, res: Response): Promise<void> => {
    const token = readRefreshCookie(req);
    if (token) {
      await this.sessionService.revoke(token);
    }
    clearRefreshCookie(res);
    req.log.info({ event: 'logout' }, 'Sesión cerrada');
    // 204 = "No Content": salió bien y no hay nada que devolver
    res.status(204).end();
  };
}