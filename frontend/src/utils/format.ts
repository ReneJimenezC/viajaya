// Formatos para mostrar dinero y fechas, siempre en español de Costa Rica.
// Funciones puras (sin React), probadas en tests/format.test.ts.

const COSTA_RICA_TIME_ZONE = 'America/Costa_Rica';

// Colones con el formato local. Ejemplo: '96050.00' → '₡96 050,00'
const colonesFormat = new Intl.NumberFormat('es-CR', { style: 'currency', currency: 'CRC' });

export function formatColones(amount: string | number): string {
  return colonesFormat.format(typeof amount === 'string' ? Number(amount) : amount);
}

// Hoy en Costa Rica como "AAAA-MM-DD" (mismo criterio que el backend: la fecha del viaje
// debe ser POSTERIOR a hoy en Costa Rica). 'en-CA' da justo el formato AAAA-MM-DD.
// Ejemplo: 2026-11-10T03:00:00Z (21:00 del 09/11 en Costa Rica) → '2026-11-09'
export function todayInCostaRica(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: COSTA_RICA_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

// Suma días a una fecha "AAAA-MM-DD". Ejemplo: ('2026-12-31', 1) → '2027-01-01'
export function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

// Primera fecha que se puede elegir para un viaje: mañana en Costa Rica (CU-01: "fecha futura")
export function firstTravelDate(now: Date = new Date()): string {
  return addDays(todayInCostaRica(now), 1);
}

// Dice si "AAAA-MM-DD" existe en el calendario. Ejemplo: '2026-02-30' → false
export function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

// Fecha de viaje larga. Ejemplo: '2026-12-10' → 'jueves, 10 de diciembre de 2026'
// Se formatea en UTC porque la fecha no tiene hora: así nunca se corre un día.
export function formatTravelDate(date: string): string {
  return new Intl.DateTimeFormat('es-CR', { dateStyle: 'full', timeZone: 'UTC' }).format(
    new Date(`${date}T00:00:00Z`),
  );
}

// Fecha de viaje corta para tablas. Ejemplo: '2026-12-10' → '10 dic 2026'
export function formatShortDate(date: string): string {
  return new Intl.DateTimeFormat('es-CR', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(`${date}T00:00:00Z`))
    .replace(/\./g, '');
}

// Momento exacto (creación de la reserva) en hora de Costa Rica.
// Ejemplo: '2026-11-10T15:30:00Z' → '10 nov 2026, 9:30 a. m.' (aprox., según el navegador)
export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat('es-CR', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: COSTA_RICA_TIME_ZONE,
  }).format(new Date(iso));
}

// Último día en que se puede cambiar la fecha o cancelar (RN-02: deben faltar MÁS de 48 h
// para las 00:00 del día del viaje). Es solo informativo: quien decide es la API.
// Ejemplo: viaje '2026-12-10' → '2026-12-07' (el 07/12 a las 23:59 todavía faltan más de 48 h)
export function lastChangeDate(travelDate: string): string {
  return addDays(travelDate, -3);
}