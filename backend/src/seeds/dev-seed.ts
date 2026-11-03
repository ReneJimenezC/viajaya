// Carga datos de prueba en la base de DESARROLLO (npm run seed:dev).
// Nunca corre en producción, y se puede ejecutar varias veces sin duplicar nada.
// Equivale a un CommandLineRunner con @Profile("dev") en Spring.

import 'reflect-metadata';
import { env } from '../config/env';
import { AppDataSource } from '../config/data-source';

// Destinos de prueba (del script de los compañeros + lugar). Precios en colones, solo para pruebas.
const DESTINATIONS = [
  { name: 'Volcán Arenal', description: 'Caminata y aguas termales', place: 'La Fortuna, Alajuela', basePrice: 42500, dailyCapacity: 30 },
  { name: 'Monteverde', description: 'Canopy y bosque nuboso', place: 'Monteverde, Puntarenas', basePrice: 35000, dailyCapacity: 25 },
  { name: 'Manuel Antonio', description: 'Playa y parque nacional', place: 'Quepos, Puntarenas', basePrice: 30000, dailyCapacity: 40 },
  { name: 'Tortuguero', description: 'Canales y tortugas', place: 'Tortuguero, Limón', basePrice: 47500, dailyCapacity: 20 },
  { name: 'Rincón de la Vieja', description: 'Senderos y aguas termales', place: 'Liberia, Guanacaste', basePrice: 37500, dailyCapacity: 25 },
];

async function main(): Promise<void> {
  // Candado: los datos de prueba nunca deben llegar a la base real (Supabase)
  if (env.nodeEnv === 'production') {
    throw new Error('seed:dev no se puede ejecutar con NODE_ENV=production');
  }

  await AppDataSource.initialize();
  try {
    // Todo o nada: si un insert falla, no queda ninguno a medias
    const inserted = await AppDataSource.transaction(async (manager) => {
      let count = 0;
      for (const d of DESTINATIONS) {
        // $1..$5 son parámetros: el driver envía los valores aparte del SQL (sin inyección SQL).
        // ON CONFLICT DO NOTHING: si el nombre ya existe (índice único), lo salta sin error.
        // RETURNING devuelve una fila solo si de verdad se insertó.
        const rows: unknown[] = await manager.query(
          `INSERT INTO destinos (nombre, descripcion, lugar, precio_base, capacidad_diaria)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT DO NOTHING
           RETURNING id_destino`,
          [d.name, d.description, d.place, d.basePrice, d.dailyCapacity],
        );
        count += rows.length;
      }
      return count;
    });
    console.log(`Destinos nuevos: ${inserted}. Ya existían: ${DESTINATIONS.length - inserted}.`);
  } finally {
    // Siempre cierra la conexión, haya funcionado o no
    await AppDataSource.destroy();
  }
}

main().catch((error: unknown) => {
  console.error('No se pudo cargar el seed:', error instanceof Error ? error.message : error);
  // exitCode en vez de exit(): deja terminar el cierre de la conexión antes de salir
  process.exitCode = 1;
});