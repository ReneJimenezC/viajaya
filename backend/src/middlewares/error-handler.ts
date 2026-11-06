// Manejo central de errores: convierte cualquier error en una respuesta JSON con el
// formato B. Equivale a @ControllerAdvice + @ExceptionHandler de Spring.

import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { AppError, type ErrorDetail } from '../errors/app-error';

// Forma del JSON de error que recibe el cliente (formato B, SAD 4)
interface ErrorBody {
  error: {
    code: string;
    message: string;
    details?: ErrorDetail[];
  };
}

// Arma el JSON del formato B. Ejemplo:
// toBody('NOT_FOUND', 'La ruta solicitada no existe')
//   → { error: { code: 'NOT_FOUND', message: 'La ruta solicitada no existe' } }
function toBody(code: string, message: string, details?: ErrorDetail[]): ErrorBody {
  return { error: details ? { code, message, details } : { code, message } };
}

// Dice si un error viene del lector de JSON de Express (librería body-parser).
// Esos errores traen "type" (qué pasó) y "status" (el código que sugiere).
// Ejemplo: un JSON mal escrito llega como { type: 'entity.parse.failed', status: 400 }.
function isBodyParserError(error: unknown): error is { type: string; status: number } {
  return (
    error instanceof Error &&
    typeof (error as { type?: unknown }).type === 'string' &&
    typeof (error as { status?: unknown }).status === 'number'
  );
}

// Rutas que no existen: se convierte en un AppError 404 y sigue al manejador central.
// Va DESPUÉS de todas las rutas: si la petición llegó hasta aquí, nadie la atendió.
export function notFoundHandler(_req: Request, _res: Response, next: NextFunction): void {
  next(new AppError(404, 'NOT_FOUND', 'La ruta solicitada no existe'));
}

// Manejador central. Express lo reconoce como "de errores" porque recibe 4 parámetros.
// Va AL FINAL de app.ts. "_req" lleva guion bajo: se recibe porque Express exige los
// 4 parámetros, pero no se usa.
export function errorHandler(error: unknown, _req: Request, res: Response, next: NextFunction): void {
  // Si la respuesta ya empezó a enviarse, no se puede cambiar: se deja a Express
  if (res.headersSent) {
    next(error);
    return;
  }

  // 1) Errores conocidos de nuestra API
  if (error instanceof AppError) {
    res.status(error.status).json(toBody(error.code, error.message, error.details));
    return;
  }

  // 2) Datos que no pasaron la plantilla de zod (la "ventanilla del banco")
  if (error instanceof ZodError) {
    // Cada problema trae la ruta del campo (["persona", "correo"]) y su mensaje
    const details = error.issues.map((issue) => ({
      field: issue.path.map(String).join('.'),
      message: issue.message,
    }));
    res.status(400).json(toBody('VALIDATION_ERROR', 'Los datos enviados no son válidos', details));
    return;
  }

  // 3) Problemas al leer el body (antes de llegar a cualquier ruta)
  if (isBodyParserError(error)) {
    // Body de más de 10 KB (decisión A del 03/11: 413)
    if (error.type === 'entity.too.large') {
      res.status(413).json(toBody('PAYLOAD_TOO_LARGE', 'La petición es demasiado grande'));
      return;
    }
    // JSON mal escrito u otro problema del cliente con el body
    if (error.status >= 400 && error.status < 500) {
      res.status(400).json(toBody('VALIDATION_ERROR', 'El cuerpo de la petición no es un JSON válido'));
      return;
    }
  }

  // 4) Cualquier otra cosa es un fallo nuestro: el detalle va SOLO al log (con el
  // ticket req.id) y el cliente recibe un mensaje genérico, sin pistas internas.
  // res.err hace que pino-http anote la petición como "error" junto con la excepción.
  res.err = error instanceof Error ? error : new Error(String(error));
  res.status(500).json(toBody('INTERNAL_ERROR', 'Ocurrió un error inesperado'));
}