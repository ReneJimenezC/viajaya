// Pruebas de los formatos de dinero y fechas (utils/format.ts)

import { describe, expect, test } from 'vitest';
import {
  addDays,
  firstTravelDate,
  formatColones,
  formatShortDate,
  formatTravelDate,
  isCalendarDate,
  lastChangeDate,
  todayInCostaRica,
} from '../utils/format';

describe('formatColones', () => {
  test('usa el formato de Costa Rica', () => {
    // Intl usa espacios especiales como separador de miles: se normalizan para comparar
    expect(formatColones('96050.00').replace(/\s/g, ' ')).toBe('₡96 050,00');
    expect(formatColones(42500).replace(/\s/g, ' ')).toBe('₡42 500,00');
  });
});

describe('fechas de Costa Rica', () => {
  test('hoy en Costa Rica no es hoy en UTC a las 03:00 UTC', () => {
    // 03:00 UTC del 10/11 = 21:00 del 09/11 en Costa Rica (UTC-6)
    expect(todayInCostaRica(new Date('2026-11-10T03:00:00Z'))).toBe('2026-11-09');
    expect(todayInCostaRica(new Date('2026-11-10T06:00:00Z'))).toBe('2026-11-10');
  });

  test('la primera fecha elegible es mañana en Costa Rica', () => {
    expect(firstTravelDate(new Date('2026-11-10T03:00:00Z'))).toBe('2026-11-10');
  });

  test('addDays cruza meses y años', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  test('isCalendarDate rechaza fechas imposibles', () => {
    expect(isCalendarDate('2026-12-10')).toBe(true);
    expect(isCalendarDate('2026-02-30')).toBe(false);
    expect(isCalendarDate('2026-13-01')).toBe(false);
    expect(isCalendarDate('10/12/2026')).toBe(false);
  });

  test('el último día para cambiar o cancelar es 3 días antes (RN-02)', () => {
    expect(lastChangeDate('2026-12-10')).toBe('2026-12-07');
  });

  test('las fechas de viaje no se corren un día', () => {
    expect(formatTravelDate('2026-12-10')).toContain('10 de diciembre de 2026');
    expect(formatShortDate('2026-12-10')).toMatch(/^10 dic 2026$/);
  });
});