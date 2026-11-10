// Controlador de destinos del administrador (RF-07). Las rutas ya pasaron por
// requireAdmin, así que req.admin siempre existe aquí.

import type { Request, Response } from 'express';
import type { CreateDestinationInput, UpdateDestinationInput } from '../models/destination.schema';
import type { DestinationService } from '../services/destination.service';
import { parseId } from './parse-id';

// CAMBIO (8.B, decisión B de C17): parseId ahora vive en parse-id.ts y la comparten los
// controladores del admin; aquí solo se le pasa el mensaje de los destinos.
const NOT_FOUND_MESSAGE = 'El destino no existe';

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
    const destination = await this.destinationService.update(parseId(req.params.id, NOT_FOUND_MESSAGE), req.body);
    req.log.info({ event: 'destination_updated', destinationId: destination.id, adminId: req.admin?.id }, 'Destino modificado');
    res.json(destination);
  };

  // POST /admin/destinos/:id/desactivar (CU-10, decisión A)
  deactivate = async (req: Request<{ id: string }>, res: Response): Promise<void> => {
    const destination = await this.destinationService.deactivate(parseId(req.params.id, NOT_FOUND_MESSAGE));
    req.log.info({ event: 'destination_deactivated', destinationId: destination.id, adminId: req.admin?.id }, 'Destino desactivado');
    res.json(destination);
  };
}