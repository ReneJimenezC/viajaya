     // ReservaService (SAD 3.1): valida RN-01 (cupo) y RN-02 (ventana de 48 h).
     // Por ahora, las dos reglas como funciones puras (sin base de datos). En el Paso 7, la clase
     // ReservaService las llamará dentro de la transacción, después de bloquear el destino
     // con SELECT ... FOR UPDATE (SAD 3.2).
     
// RN-02: mover o cancelar solo si faltan MÁS de 48 horas
const CHANGE_WINDOW_MS = 48 * 60 * 60 * 1000;
// Hora de referencia: 00:00 de la fecha del viaje en Costa Rica (decisión V).
// Costa Rica usa UTC-6 todo el año (no tiene horario de verano).
const COSTA_RICA_OFFSET = '-06:00';
// Fecha del viaje como la guarda Postgres (columna date): "AAAA-MM-DD"
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// Datos para revisar el cupo de un destino en una fecha
export interface CapacityCheck {
  dailyCapacity: number;
  reservedPeople: number;
  requestedPeople: number;
}

// RN-01: true si las personas ya reservadas más las nuevas caben en la capacidad diaria.
// Ejemplo: capacidad 20, reservadas 18, pide 2 → true; pide 3 → false.
export function hasCapacity({ dailyCapacity, reservedPeople, requestedPeople }: CapacityCheck): boolean {
  for (const value of [dailyCapacity, reservedPeople, requestedPeople]) {
    if (!Number.isInteger(value) || value < 0) {
      throw new RangeError(`Valor de cupo inválido: ${value}`);
    }
  }
  if (requestedPeople === 0) {
    throw new RangeError('La cantidad de personas debe ser mayor que 0');
  }
  return reservedPeople + requestedPeople <= dailyCapacity;
}

// Momento exacto en que empieza el día del viaje en Costa Rica.
// Ejemplo: "2026-11-10" → 2026-11-10T06:00:00.000Z (00:00 en Costa Rica)
export function travelDayStart(travelDate: string): Date {
  // El día en UTC sirve para detectar fechas imposibles: JavaScript convierte
  // "2026-02-30" en 2 de marzo en vez de dar error, así que se compara de vuelta
  const sameDayUtc = new Date(`${travelDate}T00:00:00Z`);
  if (!DATE_PATTERN.test(travelDate) || Number.isNaN(sameDayUtc.getTime()) ||
      sameDayUtc.toISOString().slice(0, 10) !== travelDate) {
    throw new RangeError(`Fecha de viaje inválida: "${travelDate}"`);
  }
  return new Date(`${travelDate}T00:00:00${COSTA_RICA_OFFSET}`);
}

// RN-02: true si todavía se puede mover o cancelar (faltan MÁS de 48 h).
// Ejemplo: viaje "2026-11-10"; el límite es 2026-11-08 00:00 en Costa Rica.
//   now = 07/11 23:59 CR → true;  now = 08/11 00:00 CR → false (exactamente 48 h no basta)
export function canChangeReservation(travelDate: string, now: Date): boolean {
  return travelDayStart(travelDate).getTime() - now.getTime() > CHANGE_WINDOW_MS;
}