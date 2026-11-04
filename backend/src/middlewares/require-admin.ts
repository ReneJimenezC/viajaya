// Protege las rutas /admin/...: exige un access token válido con rol "admin".
// Equivale a un OncePerRequestFilter + @PreAuthorize("hasRole('ADMIN')") de Spring.

import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../errors/app-error';
import type { AdminRole } from '../models/admin.entity';
import type { AuthenticatedAdmin, AuthService } from '../services/auth.service';

// Agrega "admin" al tipo Request de Express: después de este middleware,
// los controladores leen req.admin (id y rol del admin que hizo la petición).
declare global {
  namespace Express {
    interface Request {
      admin?: AuthenticatedAdmin;
    }
  }
}

// Único rol con acceso a /admin/...
const REQUIRED_ROLE: AdminRole = 'admin';
// Cabecera esperada: "Bearer <jwt>" (la palabra Bearer sin distinguir mayúsculas).
// Un JWT son tres partes base64url separadas por puntos.
const BEARER_PATTERN = /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/i;

// Recibe el AuthService ya armado y devuelve el middleware. Uso:
// router.get('/admin/destinos', requireAdmin(authService), controller.list)
export function requireAdmin(authService: AuthService) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const token = BEARER_PATTERN.exec(req.headers.authorization ?? '')?.[1];
    if (!token) {
      // RFC 6750: un 401 de una API con Bearer indica el esquema esperado
      res.set('WWW-Authenticate', 'Bearer');
      throw new AppError(401, 'UNAUTHORIZED', 'Se requiere iniciar sesión como administrador.');
    }

    let admin: AuthenticatedAdmin;
    try {
      admin = await authService.verifyAccessToken(token);
    } catch (error) {
      if (error instanceof AppError) {
        res.set('WWW-Authenticate', 'Bearer error="invalid_token"');
        req.log.warn({ event: 'access_token_rejected' }, 'Access token rechazado');
      }
      throw error;
    }

    if (admin.role !== REQUIRED_ROLE) {
      req.log.warn({ event: 'access_forbidden', adminId: admin.id }, 'Rol sin permiso');
      throw new AppError(403, 'FORBIDDEN', 'No tienes permiso para realizar esta acción.');
    }

    req.admin = admin;
    next();
  };
}