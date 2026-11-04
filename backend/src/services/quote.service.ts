// CotizacionService (SAD 3.1): RN-03 (tarifa), total = (precio base × personas) × 1.13.
// Cálculo único, reutilizado por la cotización (RF-02) y la reserva (RF-03).
// Todo se calcula en céntimos enteros: nunca con decimales de punto flotante.

// IVA de Costa Rica: 13 % (RN-03)
const IVA_PERCENT = 13;
// Precio con hasta 2 decimales, sin signo: "42500", "42500.5", "42500.50"
const PRICE_PATTERN = /^\d+(\.\d{1,2})?$/;

// Desglose de la tarifa; los montos van como texto con 2 decimales, igual que NUMERIC(12,2)
export interface Quote {
  basePrice: string;
  people: number;
  subtotal: string;
  iva: string;
  total: string;
}

// Convierte un precio a céntimos enteros. Ejemplo: "42500.5" → 4250050
function toCents(price: string): number {
  if (!PRICE_PATTERN.test(price)) {
    throw new RangeError(`Precio inválido: "${price}"`);
  }
  const [colones = '0', decimals = ''] = price.split('.');
  return Number(colones) * 100 + Number(decimals.padEnd(2, '0'));
}

// Convierte céntimos a texto con 2 decimales. Ejemplo: 4250050 → "42500.50"
function fromCents(cents: number): string {
  const colones = Math.floor(cents / 100);
  const decimals = String(cents % 100).padStart(2, '0');
  return `${colones}.${decimals}`;
}

// Calcula la tarifa. Recibe el precio base (como lo devuelve Postgres) y las personas.
// Ejemplo: calculateQuote('42500.00', 2)
//   → { basePrice: '42500.00', people: 2, subtotal: '85000.00', iva: '11050.00', total: '96050.00' }
export function calculateQuote(basePrice: string, people: number): Quote {
  if (!Number.isInteger(people) || people <= 0) {
    throw new RangeError(`Cantidad de personas inválida: ${people}`);
  }
  const baseCents = toCents(basePrice);
  if (baseCents <= 0) {
    throw new RangeError('El precio base debe ser mayor que 0');
  }
  const subtotalCents = baseCents * people;
  // IVA redondeado al céntimo, la mitad hacia arriba (0.005 → 0.01)
  const ivaCents = Math.floor((subtotalCents * IVA_PERCENT + 50) / 100);
  const totalCents = subtotalCents + ivaCents;
  if (!Number.isSafeInteger(totalCents)) {
    throw new RangeError('Monto demasiado grande');
  }
  return {
    basePrice: fromCents(baseCents),
    people,
    subtotal: fromCents(subtotalCents),
    iva: fromCents(ivaCents),
    total: fromCents(totalCents),
  };
}