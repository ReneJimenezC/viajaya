// Rutas públicas de cotización (RF-02, SAD 3.4).

import { Router } from 'express';
import type { QuoteController } from '../controllers/quote.controller';
import { validate } from '../middlewares/validate';
import { createQuoteSchema } from '../models/quote.schema';

export function createQuoteRouter(controller: QuoteController): Router {
  const router = Router();
  router.post('/cotizaciones', validate(createQuoteSchema), controller.create);
  return router;
}