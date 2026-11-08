// CotizacionService (SAD 3.1): POST /cotizaciones (RF-02, CU-02).
// La regla RN-03 (calculateQuote) vive en business-rules.ts: la misma que usa la reserva.

import { AppError } from '../errors/app-error';
import type { CreateQuoteInput } from '../models/quote.schema';
import type { DestinationRepository } from '../repositories/destination.repository';
import {
  calculateQuote,
  capacityConflict,
  hasCapacity,
  isFutureTravelDate,
  UNAVAILABLE_MESSAGE,
  type Quote,
} from './business-rules';

// Lo único que la cotización necesita del repositorio de destinos.
// Así las pruebas pueden pasarle un repositorio falso con solo estos dos métodos.
export type QuoteDestinationReader = Pick<DestinationRepository, 'findById' | 'reservedPeopleOn'>;

// Respuesta de la cotización (decisión 2 = B del Paso 5): datos del viaje + desglose de RN-03
export interface QuoteResult {
  destination: { id: number; name: string; place: string };
  travelDate: string;
  quote: Quote;
}

export class QuoteService {
  constructor(private readonly destinations: QuoteDestinationReader) {}

  // CU-02 (decisión 1 = A del Paso 5): revisa fecha futura, destino activo y cupo (RN-01) y
  // calcula la tarifa (RN-03). No guarda nada: al reservar (CU-03) todo se vuelve a validar y calcular.
  async create(input: CreateQuoteInput, now: Date = new Date()): Promise<QuoteResult> {
    const { destinationId, travelDate, people } = input;

    if (!isFutureTravelDate(travelDate, now)) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Los datos enviados no son válidos', [
        { field: 'travelDate', message: 'La fecha del viaje debe ser posterior a hoy' },
      ]);
    }

    const destination = await this.destinations.findById(destinationId);
    if (!destination || !destination.active) {
      throw new AppError(404, 'NOT_FOUND', UNAVAILABLE_MESSAGE);
    }

    const reserved = await this.destinations.reservedPeopleOn(travelDate, [destination.id]);
    const reservedPeople = reserved.get(destination.id) ?? 0;
    if (!hasCapacity({ dailyCapacity: destination.dailyCapacity, reservedPeople, requestedPeople: people })) {
      throw capacityConflict(Math.max(destination.dailyCapacity - reservedPeople, 0));
    }

    return {
      destination: { id: destination.id, name: destination.name, place: destination.place },
      travelDate,
      quote: calculateQuote(destination.basePrice, people),
    };
  }
}