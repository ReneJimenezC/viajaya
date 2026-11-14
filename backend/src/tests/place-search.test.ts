// Pruebas unitarias de la búsqueda por lugar sin tildes (RF-01, CU-01; decisión 2 del 13/11).
// No usan base de datos: revisan el patrón que se envía a Postgres y que la tabla de letras
// (ACCENTED → PLAIN) quita las mismas tildes que se quitan del texto buscado.

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { ACCENTED, PLAIN, placeSearchPattern } from '../repositories/destination.repository';

// Imita en JavaScript el translate(lugar, ACCENTED, PLAIN) que hace Postgres con la columna
function translateLikePostgres(text: string): string {
  return [...text].map((char) => {
    const index = ACCENTED.indexOf(char);
    return index === -1 ? char : PLAIN.charAt(index);
  }).join('');
}

describe('placeSearchPattern', () => {
  test('quita tildes y ñ, y rodea el texto con % ("contiene")', () => {
    assert.equal(placeSearchPattern('Limón'), '%Limon%');
    assert.equal(placeSearchPattern('LIMÓN'), '%LIMON%');
    assert.equal(placeSearchPattern('Peña'), '%Pena%');
    assert.equal(placeSearchPattern('Limon'), '%Limon%');
  });

  test('da lo mismo si la tilde viene pegada a la letra o escrita aparte', () => {
    // "ó" de un solo carácter (U+00F3) y "o" + tilde suelta (U+0301): algunos teclados envían la segunda
    assert.equal(placeSearchPattern('Lim\u00f3n'), placeSearchPattern('Limo\u0301n'));
  });

  test('escapa los comodines de ILIKE (% y _) y la barra invertida', () => {
    assert.equal(placeSearchPattern('50%'), '%50\\%%');
    assert.equal(placeSearchPattern('a_b'), '%a\\_b%');
    assert.equal(placeSearchPattern('a\\b'), '%a\\\\b%');
  });
});

describe('tabla de letras ACCENTED → PLAIN', () => {
  test('las dos listas tienen el mismo largo (translate cambia letra por letra)', () => {
    assert.equal([...ACCENTED].length, [...PLAIN].length);
  });

  test('la columna sin tildes coincide con el texto buscado sin tildes', () => {
    // Los lugares del seed y algunos con mayúsculas acentuadas
    const places = [
      'La Fortuna, Alajuela', 'Monteverde, Puntarenas', 'Quepos, Puntarenas',
      'Tortuguero, Limón', 'Liberia, Guanacaste', 'PÉREZ ZELEDÓN', 'Cañas, Guanacaste',
    ];
    for (const place of places) {
      assert.equal(`%${translateLikePostgres(place)}%`, placeSearchPattern(place));
    }
  });
});