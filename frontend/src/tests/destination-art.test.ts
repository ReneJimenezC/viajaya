// Pruebas de la elección del dibujo de cada destino (components/DestinationArt.tsx)

import { describe, expect, test } from 'vitest';
import { artKindFor } from '../components/DestinationArt';

const destination = (name: string, description: string | null = null, place = 'Puntarenas') => ({
  name,
  description,
  place,
});

describe('artKindFor', () => {
  test('elige el dibujo por palabras, sin importar tildes ni mayúsculas', () => {
    expect(artKindFor(destination('Manuel Antonio', 'Playa y parque nacional'))).toBe('playa');
    expect(artKindFor(destination('VOLCÁN Poás'))).toBe('volcan');
    expect(artKindFor(destination('Monteverde', 'Canopy y bosque nuboso'))).toBe('bosque');
    expect(artKindFor(destination('Tortuguero', 'Canales y tortugas'))).toBe('agua');
  });

  test('si nada coincide usa montañas', () => {
    expect(artKindFor(destination('Cerro Chirripó', null, 'Pérez Zeledón'))).toBe('montana');
  });
});