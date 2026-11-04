// Controlador de destinos del administrador (RF-07). Las rutas ya pasaron por
// requireAdmin, así que req.admin siempre existe aquí.

import type { Request, Response } from 'express';
import { AppError } from '../errors/app-error';
import type { CreateDestinationInput, UpdateDestinationInput } from '../models/destination.schema';
import type { DestinationService } from '../services/destination.service';

// Id de la URL: entero positivo que cabe en una columna integer de Postgres
const ID_PATTERN = /^[1-9]\d{0,9}$/;
const ID_MAX = 2_147_483_647;

// Convierte el :id de la URL en número. Si no es un id posible ("abc", "0", "1.5"),
// responde 404 igual que un id inexistente. Ejemplo: "12" → 12.
function parseId(value: string | string[] | undefined): number {
  const id = typeof value === 'string' && ID_PATTERN.test(value) ? Number(value) : NaN;
  if (!Number.isInteger(id) || id > ID_MAX) {
    throw new AppError(404, 'NOT_FOUND', 'El destino no existe');
  }
  return id;
}

export class AdminDestinationController {
  constructor(private readonly destinationService: DestinationService) {}

  // GET /admin/destinos (CU-08)
  list = async (_req: Request, res: Response): Promise<void> => {
    res.json(await this.destinationService.list());
  };

  // POST /admin/destinos (CU-07). Responde 201 con el destino creado.
  create = async (req: Request<unknown, unknown, CreateDestinationInput>, res: Response): Promise<void> => {
    const destination = await this.destinationService.create(req.body);
    req.log.info({ event: 'destination_created', destinationId: destination.id, adminId: req.admin?.id }, 'Destino creado');
    res.status(201).json(destination);
  };

  // PATCH /admin/destinos/:id (CU-09)
  update = async (req: Request<{ id: string }, unknown, UpdateDestinationInput>, res: Response): Promise<void> => {
    const destination = await this.destinationService.update(parseId(req.params.id), req.body);
    req.log.info({ event: 'destination_updated', destinationId: destination.id, adminId: req.admin?.id }, 'Destino modificado');
    res.json(destination);
  };

  // POST /admin/destinos/:id/desactivar (CU-10, decisión A)
  deactivate = async (req: Request<{ id: string }>, res: Response): Promise<void> => {
    const destination = await this.destinationService.deactivate(parseId(req.params.id));
    req.log.info({ event: 'destination_deactivated', destinationId: destination.id, adminId: req.admin?.id }, 'Destino desactivado');
    res.json(destination);
  };
}