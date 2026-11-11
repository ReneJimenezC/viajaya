// Desglose de la tarifa (CU-02 paso 4: destino, fecha, personas, precio base, subtotal, IVA y
// total). Los montos los calcula SIEMPRE la API (RN-03); aquí solo se muestran.
// Es una lista de definiciones (<dl>): cada concepto con su valor, bien leída por lectores de pantalla.

import type { Quote } from '../services/types';
import { formatColones, formatTravelDate } from '../utils/format';

interface QuoteBreakdownProps {
  destinationName: string;
  place: string;
  travelDate: string;
  quote: Quote;
}

export function QuoteBreakdown({ destinationName, place, travelDate, quote }: QuoteBreakdownProps) {
  const rows: [string, string][] = [
    ['Destino', `${destinationName} (${place})`],
    ['Fecha del viaje', formatTravelDate(travelDate)],
    ['Personas', String(quote.people)],
    ['Precio por persona', formatColones(quote.basePrice)],
    [`Subtotal (${quote.people} × ${formatColones(quote.basePrice)})`, formatColones(quote.subtotal)],
    ['IVA (13 %)', formatColones(quote.iva)],
  ];
  return (
    <dl className="divide-y divide-musgo rounded-xl border border-musgo bg-papel">
      {rows.map(([term, value]) => (
        <div key={term} className="flex flex-col gap-1 px-5 py-3 sm:flex-row sm:justify-between sm:gap-6">
          <dt className="text-basalto-suave">{term}</dt>
          <dd className="font-semibold sm:text-right">{value}</dd>
        </div>
      ))}
      <div className="flex items-baseline justify-between gap-6 bg-celeste-claro px-5 py-4">
        <dt className="font-display text-lg font-bold">Total a pagar</dt>
        <dd className="font-display text-2xl font-bold">{formatColones(quote.total)}</dd>
      </div>
    </dl>
  );
}
