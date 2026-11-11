// Pruebas de las plantillas de los formularios (utils/validation.ts).
// Deben aceptar y rechazar lo mismo que el backend.

import { describe, expect, test } from 'vitest';
import { addDays, todayInCostaRica } from '../utils/format';
import {
  destinationFormSchema,
  lookupFormSchema,
  reservationFormSchema,
  searchFormSchema,
  toFieldErrors,
} from '../utils/validation';

const tomorrow = addDays(todayInCostaRica(), 1);

describe('búsqueda (CU-01)', () => {
  test('acepta fecha futura y personas', () => {
    const result = searchFormSchema.parse({ lugar: ' Limón ', fecha: tomorrow, personas: '2' });
    expect(result).toEqual({ lugar: 'Limón', fecha: tomorrow, personas: 2 });
  });

  test('hoy no vale: la fecha debe ser posterior a hoy', () => {
    const result = searchFormSchema.safeParse({ lugar: '', fecha: todayInCostaRica(), personas: '2' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(toFieldErrors(result.error).fecha).toBe('La fecha del viaje debe ser posterior a hoy');
    }
  });

  test('personas debe ser entero de 1 a 9999', () => {
    for (const personas of ['0', '1.5', '10000', 'dos', '']) {
      expect(searchFormSchema.safeParse({ lugar: '', fecha: tomorrow, personas }).success).toBe(false);
    }
  });
});

describe('reserva (CU-03)', () => {
  test('limpia el correo y quita espacios y guiones de la tarjeta', () => {
    const result = reservationFormSchema.parse({
      customerName: '  Ana Mora ',
      customerEmail: ' Ana@Correo.COM ',
      cardNumber: '4111 1111-1111 1112',
    });
    expect(result).toEqual({ customerName: 'Ana Mora', customerEmail: 'ana@correo.com', cardNumber: '4111111111111112' });
  });

  test('la tarjeta debe tener de 13 a 19 dígitos', () => {
    const base = { customerName: 'Ana', customerEmail: 'ana@correo.com' };
    expect(reservationFormSchema.safeParse({ ...base, cardNumber: '123456789012' }).success).toBe(false);
    expect(reservationFormSchema.safeParse({ ...base, cardNumber: '12345678901234567890' }).success).toBe(false);
    expect(reservationFormSchema.safeParse({ ...base, cardNumber: '4111a11111111112' }).success).toBe(false);
  });
});

describe('consulta (CU-04)', () => {
  test('normaliza el código a mayúsculas y sin espacios', () => {
    expect(lookupFormSchema.parse({ code: ' vy-f57nxnw9 ', customerEmail: 'ana@correo.com' }).code).toBe('VY-F57NXNW9');
  });

  test('rechaza códigos con caracteres que el sistema no usa (0, O, 1, I, L)', () => {
    expect(lookupFormSchema.safeParse({ code: 'VY-F57NXNW0', customerEmail: 'ana@correo.com' }).success).toBe(false);
    expect(lookupFormSchema.safeParse({ code: 'VY-F57NX', customerEmail: 'ana@correo.com' }).success).toBe(false);
  });
});

describe('destino (CU-07, CU-09)', () => {
  test('acepta coma decimal y deja la descripción vacía como null', () => {
    const result = destinationFormSchema.parse({
      name: ' Volcán Poás ',
      place: 'Alajuela',
      description: '   ',
      basePrice: '25000,50',
      dailyCapacity: '30',
    });
    expect(result).toEqual({ name: 'Volcán Poás', place: 'Alajuela', description: null, basePrice: 25000.5, dailyCapacity: 30 });
  });

  test('el precio debe ser mayor que 0 y con hasta 2 decimales', () => {
    const base = { name: 'X', place: 'Y', description: '', dailyCapacity: '10' };
    expect(destinationFormSchema.safeParse({ ...base, basePrice: '0' }).success).toBe(false);
    expect(destinationFormSchema.safeParse({ ...base, basePrice: '10.555' }).success).toBe(false);
    expect(destinationFormSchema.safeParse({ ...base, basePrice: '-5' }).success).toBe(false);
  });
});