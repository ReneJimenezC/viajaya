// DestinoService (SAD 3.1): CRUD de destinos (RF-07). La búsqueda pública (RF-01)
// se agrega en el subpaso 4.G.3.

import type { DataSource } from 'typeorm';
import { AppError } from '../errors/app-error';
import type { Destination } from '../models/destination.entity';
import type { CreateDestinationInput, UpdateDestinationInput } from '../models/destination.schema';
import { DestinationRepository } from '../repositories/destination.repository';
import { todayInCostaRica } from './reservation.service';

// Mensaje para un id que no existe (CU-09 6b y CU-10 2a)
const NOT_FOUND_MESSAGE = 'El destino no existe';

export class DestinationService {
  constructor(private readonly dataSource: DataSource) {}

  // CU-08: lista todos los destinos con su estado
  list(): Promise<Destination[]> {
    return new DestinationRepository(this.dataSource.manager).findAll();
  }

  // CU-07: registra un destino; queda activo. Nombre repetido → 409.
  create(input: CreateDestinationInput): Promise<Destination> {
    return new DestinationRepository(this.dataSource.manager).insert(input);
  }

  // CU-09: modifica solo los campos enviados. No existe → 404; nombre repetido → 409;
  // capacidad menor que las personas ya reservadas en un día futuro → 422.
  update(id: number, changes: UpdateDestinationInput, now: Date = new Date()): Promise<Destination> {
    return this.dataSource.transaction(async (manager) => {
      const repo = new DestinationRepository(manager);
      const destination = await repo.findByIdForUpdate(id);
      if (!destination) {
        throw new AppError(404, 'NOT_FOUND', NOT_FOUND_MESSAGE);
      }

      if (changes.dailyCapacity !== undefined) {
        const reserved = await repo.maxReservedPeopleFrom(id, todayInCostaRica(now));
        if (changes.dailyCapacity < reserved) {
          throw new AppError(
            422,
            'BUSINESS_RULE',
            `La capacidad diaria no puede ser menor que ${reserved}: hay un día futuro con esa cantidad de personas reservadas`,
          );
        }
      }

      // Copia solo los campos que vinieron (los ausentes quedan undefined y se saltan)
      if (changes.name !== undefined) destination.name = changes.name;
      if (changes.place !== undefined) destination.place = changes.place;
      if (changes.description !== undefined) destination.description = changes.description;
      if (changes.basePrice !== undefined) destination.basePrice = changes.basePrice;
      if (changes.dailyCapacity !== undefined) destination.dailyCapacity = changes.dailyCapacity;
      return repo.update(destination);
    });
  }

  // CU-10: desactiva un destino activo. No existe → 404; ya inactivo → 409.
  // Las reservas que ya tiene se conservan (sección 7 de la bitácora).
  deactivate(id: number): Promise<Destination> {
    return this.dataSource.transaction(async (manager) => {
      const repo = new DestinationRepository(manager);
      const destination = await repo.findByIdForUpdate(id);
      if (!destination) {
        throw new AppError(404, 'NOT_FOUND', NOT_FOUND_MESSAGE);
      }
      if (!destination.active) {
        throw new AppError(409, 'CONFLICT', 'El destino ya está inactivo');
      }
      destination.active = false;
      return repo.update(destination);
    });
  }
}