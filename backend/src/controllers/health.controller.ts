// Controlador de salud: responde si la API está viva.
// Lo usan Docker (HEALTHCHECK) y Render para saber si el servicio funciona.

// "import type" solo trae tipos: no agrega código al JavaScript final
import type { Request, Response } from 'express';

// "_req" con guion bajo indica que el parámetro no se usa
export function getHealth(_req: Request, res: Response): void {
  // Responde solo "ok": no expone versión, entorno ni datos internos
  res.status(200).json({ status: 'ok' });
}