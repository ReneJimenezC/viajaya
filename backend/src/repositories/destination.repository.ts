// Acceso a la tabla "destinos". Recibe el EntityManager de la transacción en curso,
// igual que AdminSessionRepository, para que todo vaya en la misma transacción.

import { QueryFailedError, type EntityManager } from 'typeorm';
import { AppError } from '../errors/app-error';
import { Destination } from '../models/destination.entity';

// Índice único del nombre (migración 001)
const UNIQUE_NAME_INDEX = 'uq_destinos_nombre';
// Código de Postgres para "valor duplicado en un índice único"
const UNIQUE_VIOLATION = '23505';
// Estados de reserva que ocupan cupo (sección 7: pendiente y aprobada; cancelada no)
const OCCUPYING_STATES = ['Pendiente', 'Aprobada'];
// Búsqueda por lugar sin tildes (decisión 2 del 13/11): cada letra de ACCENTED se cambia por la
// de la misma posición en PLAIN (función translate de Postgres). Mayúsculas y minúsculas van las
// dos, así no depende del idioma configurado en la base (Docker o Supabase).
export const ACCENTED = 'ÁÀÂÄÉÈÊËÍÌÎÏÓÒÔÖÚÙÛÜÑáàâäéèêëíìîïóòôöúùûüñ';
export const PLAIN = 'AAAAEEEEIIIIOOOOUUUUNaaaaeeeeiiiioooouuuun';

// Patrón de búsqueda por lugar: sin tildes ni ñ, con los comodines % y _ escapados (y la \),
// y rodeado de % ("contiene"). Ejemplos: "Limón" → "%Limon%"; "Peña" → "%Pena%"; "50%" → "%50\%%"
export function placeSearchPattern(place: string): string {
  // NFD separa la letra de su tilde ("ó" → "o" + tilde); el rango \u0300-\u036f son las tildes sueltas
  const plain = place.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const escaped = plain.replace(/[\\%_]/g, (char) => `\\${char}`);
  return `%${escaped}%`;
}

// Datos de un destino nuevo (ya validados por zod)
export interface NewDestination {
  name: string;
  place: string;
  description: string | null;
  basePrice: string;
  dailyCapacity: number;
}

// Convierte el error del índice único del nombre en un 409 claro (CU-07 6a).
// Cualquier otro error se relanza tal cual (llegará como 500).
function translateDuplicateName(error: unknown): never {
  if (error instanceof QueryFailedError) {
    const driverError = error.driverError as { code?: string; constraint?: string };
    if (driverError.code === UNIQUE_VIOLATION && driverError.constraint === UNIQUE_NAME_INDEX) {
      throw new AppError(409, 'CONFLICT', 'Ya existe un destino con ese nombre');
    }
  }
  throw error;
}

export class DestinationRepository {
  constructor(private readonly manager: EntityManager) {}

  // Todos los destinos (activos e inactivos), del más antiguo al más nuevo (CU-08)
  findAll(): Promise<Destination[]> {
    return this.manager.find(Destination, { order: { id: 'ASC' } });
  }



    // NUEVO (Paso 5): busca un destino por id, SIN bloquearlo: para lecturas informativas
  // como la cotización (CU-02). Devuelve null si no existe.
  findById(id: number): Promise<Destination | null> {
    return this.manager.findOne(Destination, { where: { id } });
  }

  // Busca un destino y BLOQUEA su fila hasta el fin de la transacción (SELECT ... FOR UPDATE).
  // Es el mismo bloqueo que usarán las reservas (SAD 3.2): editar la capacidad y reservar
  // no pueden pasar a la vez sobre el mismo destino.
  findByIdForUpdate(id: number): Promise<Destination | null> {
    return this.manager.findOne(Destination, { where: { id }, lock: { mode: 'pessimistic_write' } });
  }

  // Inserta un destino nuevo (activo por defecto) y lo devuelve con su id
  async insert(data: NewDestination): Promise<Destination> {
    try {
      return await this.manager.save(this.manager.create(Destination, { ...data, active: true }));
    } catch (error) {
      return translateDuplicateName(error);
    }
  }

  // Guarda los cambios de un destino existente
  async update(destination: Destination): Promise<Destination> {
    try {
      return await this.manager.save(destination);
    } catch (error) {
      return translateDuplicateName(error);
    }
  }
  // Destinos ACTIVOS, opcionalmente filtrados por lugar (contiene el texto, sin distinguir
  // mayúsculas ni tildes). Ejemplos: "punta" encuentra "Quepos, Puntarenas"; "Limon" encuentra
  // "Tortuguero, Limón". Ordenados por nombre.
  findActive(place?: string): Promise<Destination[]> {
    const query = this.manager
      .createQueryBuilder(Destination, 'd')
      .where('d.activo = true')
      .orderBy('d.nombre', 'ASC');
    if (place) {
      // Se quitan las tildes en los dos lados: en la columna con translate y en el texto buscado
      // con placeSearchPattern. ILIKE sigue ignorando mayúsculas.
      query.andWhere('translate(d.lugar, :accented, :plain) ILIKE :pattern', {
        accented: ACCENTED,
        plain: PLAIN,
        pattern: placeSearchPattern(place),
      });
    }
    return query.getMany();
  }

  // Personas ya reservadas en una fecha, por destino. Devuelve un Map id → personas;
  // los destinos sin reservas ese día no aparecen (cuentan como 0).
  // Ejemplo: Tortuguero (4) con 18 personas el 10/12 → Map { 4 => 18 }
  async reservedPeopleOn(date: string, destinationIds: number[]): Promise<Map<number, number>> {
    if (destinationIds.length === 0) {
      return new Map();
    }
    const rows: { id_destino: number; total: number }[] = await this.manager.query(
      `SELECT id_destino, SUM(cantidad_personas)::int AS total
         FROM reservas
        WHERE fecha_viaje = $1
          AND id_destino = ANY($2)
          AND estado = ANY($3)
          AND eliminado_en IS NULL
        GROUP BY id_destino`,
      [date, destinationIds, OCCUPYING_STATES],
    );
    return new Map(rows.map((row) => [row.id_destino, row.total]));
  }
  // Mayor cantidad de personas reservadas en un mismo día, desde "fromDate" en adelante.
  // Sirve para no bajar la capacidad por debajo de lo ya vendido (sección 7).
  // Ejemplo: 10/12 con 18 personas y 11/12 con 7 → 18. Sin reservas → 0.
  async maxReservedPeopleFrom(destinationId: number, fromDate: string): Promise<number> {
    const rows: { max: number }[] = await this.manager.query(
      `SELECT COALESCE(MAX(total), 0)::int AS max
         FROM (SELECT SUM(cantidad_personas) AS total
                 FROM reservas
                WHERE id_destino = $1
                  AND fecha_viaje >= $2
                  AND estado = ANY($3)
                  AND eliminado_en IS NULL
                GROUP BY fecha_viaje) AS por_dia`,
      [destinationId, fromDate, OCCUPYING_STATES],
    );
    return rows[0]?.max ?? 0;
  }
}