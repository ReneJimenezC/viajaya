// Acceso a la tabla "administrador". Equivale a un JpaRepository<Admin, Integer> en Java.

import type { Repository } from 'typeorm';
import type { Admin } from '../models/admin.entity';

export class AdminRepository {
  // Recibe el repositorio de TypeORM por constructor (sin inyección automática)
  constructor(private readonly repo: Repository<Admin>) {}

  // Busca al admin por correo E INCLUYE el hash (que normalmente no se trae, select: false).
  // Solo lo usa el login. El correo ya llega en minúsculas, como se guardó.
  // Devuelve el Admin o null si no existe.
  findForLogin(email: string): Promise<Admin | null> {
    return this.repo.findOne({
      where: { email },
      select: { id: true, email: true, role: true, passwordHash: true },
    });
  }
}