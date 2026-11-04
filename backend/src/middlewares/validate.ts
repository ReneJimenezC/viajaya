// Middleware que revisa el body con una plantilla de zod ANTES de llegar al controlador.
// Si no cumple, pasa el ZodError al manejador central (→ 400 VALIDATION_ERROR con details).
// Equivale a @Valid @RequestBody en Spring.

import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';

// Mensajes por defecto de zod en español (para los casos sin mensaje propio).
// Se configura una sola vez, al cargar este archivo.
z.config(z.locales.es());

// Recibe una plantilla y devuelve el middleware que la aplica. Ejemplo de uso:
// router.post('/auth/login', validate(loginSchema), controller.login)
export function validate(schema: z.ZodType) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    // safeParse no lanza: devuelve { success: true, data } o { success: false, error }
    const result = schema.safeParse(req.body);
    if (!result.success) {
      next(result.error);
      return;
    }
    // Se reemplaza el body por la versión limpia (correo en minúsculas, sin campos extra)
    req.body = result.data;
    next();
  };
}