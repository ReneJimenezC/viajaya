// Controlador público de destinos para el turista (RF-01). No exige token.

import type { Request, Response } from 'express';
import { searchDestinationsSchema } from '../models/destination.schema';
import type { DestinationService } from '../services/destination.service';

export class DestinationController {
  constructor(private readonly destinationService: DestinationService) {}

  // GET /destinos?lugar&fecha&personas (CU-01). La consulta se valida aquí con zod:
  // si no cumple, parse() lanza un ZodError y el manejador central responde 400.
  search = async (req: Request, res: Response): Promise<void> => {
    const input = searchDestinationsSchema.parse(req.query);
    res.json(await this.destinationService.search(input));
  };
}