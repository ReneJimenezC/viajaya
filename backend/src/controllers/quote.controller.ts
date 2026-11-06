// Controlador público de cotizaciones para el turista (RF-02). No exige token.

import type { Request, Response } from 'express';
import type { CreateQuoteInput } from '../models/quote.schema';
import type { QuoteService } from '../services/quote.service';

export class QuoteController {
  constructor(private readonly quoteService: QuoteService) {}

  // POST /cotizaciones (CU-02). El body ya pasó por validate(createQuoteSchema).
  // Responde 200 (no 201): la cotización se calcula, pero no se guarda.
  create = async (req: Request<unknown, unknown, CreateQuoteInput>, res: Response): Promise<void> => {
    res.json(await this.quoteService.create(req.body));
  };
}