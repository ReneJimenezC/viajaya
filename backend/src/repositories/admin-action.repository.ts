// Acceso a la tabla "acciones_admin" (historial del admin, decisión 1 = B del Paso 8).
// Recibe el EntityManager de la transacción en curso: la fila del historial se guarda en la
// MISMA transacción que la acción (V14); si una falla, no queda ninguna de las dos.

import type { EntityManager } from 'typeorm';
import { AdminAction, type AdminActionType } from '../models/admin-action.entity';

// Datos de una acción nueva (ya validados por el servicio)
export interface NewAdminAction {
  reservationId: number;
  adminId: number;
  action: AdminActionType;
  // null cuando la acción no lleva motivo (V10)
  reason: string | null;
  // Solo en 'reagendar' (V12); null en las demás
  previousDate: string | null;
  newDate: string | null;
}

export class AdminActionRepository {
  constructor(private readonly manager: EntityManager) {}

  // Agrega una fila al historial. La base pone el id y la hora (creado_en).
  // Ejemplo: { reservationId: 1, adminId: 3, action: 'aprobar', reason: null,
  //            previousDate: null, newDate: null } → INSERT de una fila
  async record(data: NewAdminAction): Promise<void> {
    await this.manager.insert(AdminAction, data);
  }
}