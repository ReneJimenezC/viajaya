// Crea el ÚNICO administrador del sistema (npm run seed:admin).
// Lee ADMIN_EMAIL y ADMIN_PASSWORD del .env; la API nunca las lee. Después de ejecutarlo,
// esas dos líneas se borran del .env. Si ya existe un administrador, no hace nada.
// A diferencia de seed:dev, SÍ se puede ejecutar en producción (para crear el admin real).

import 'reflect-metadata';
import { argon2id, hash } from 'argon2';
import { AppDataSource } from '../config/data-source';
import { Admin } from '../models/admin.entity';

// Nombre fijo del administrador (decidido: no hay una persona específica)
const ADMIN_NAME = 'Administrador';
// Largo permitido de la contraseña (recomendación del NIST: largo, sin reglas de símbolos).
// El máximo evita que una "contraseña" gigante deje a argon2 trabajando de más.
const PASSWORD_MIN_LENGTH = 12;
const PASSWORD_MAX_LENGTH = 128;
// Largo máximo de un correo según el estándar de direcciones de correo
const EMAIL_MAX_LENGTH = 254;
// Forma básica de un correo: algo@algo.algo, sin espacios ni "@" de más
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Lee ADMIN_EMAIL, lo normaliza (sin espacios a los lados y en minúsculas) y valida su forma.
// Ejemplo: "  Admin@ViajaYa.com " → "admin@viajaya.com"
function readAdminEmail(): string {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  if (!email) {
    throw new Error('Variable de entorno faltante: ADMIN_EMAIL');
  }
  if (email.length > EMAIL_MAX_LENGTH || !EMAIL_PATTERN.test(email)) {
    throw new Error('ADMIN_EMAIL inválido: debe tener la forma nombre@dominio.com');
  }
  return email;
}

// Lee ADMIN_PASSWORD y valida su largo. Los errores NUNCA muestran la contraseña.
// No se le quitan espacios: lo que se escribe es exactamente lo que se guarda.
function readAdminPassword(): string {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) {
    throw new Error('Variable de entorno faltante: ADMIN_PASSWORD');
  }
  if (password.length < PASSWORD_MIN_LENGTH || password.length > PASSWORD_MAX_LENGTH) {
    throw new Error(
      `ADMIN_PASSWORD debe tener entre ${PASSWORD_MIN_LENGTH} y ${PASSWORD_MAX_LENGTH} caracteres`,
    );
  }
  return password;
}

async function main(): Promise<void> {
  // Se valida ANTES de conectarse: si falta algo, ni se toca la base
  const email = readAdminEmail();
  const password = readAdminPassword();

  await AppDataSource.initialize();
  try {
    // Todo dentro de una transacción: o se crea completo, o no se crea nada
    const createdId = await AppDataSource.transaction(async (manager) => {
      // Bloquea la tabla hasta el final de la transacción (como un "synchronized"):
      // si el script se ejecuta dos veces al mismo tiempo, el segundo espera al primero
      // y luego ve que ya hay un admin. Las lecturas normales no se bloquean.
      await manager.query('LOCK TABLE administrador IN SHARE ROW EXCLUSIVE MODE');

      // Regla acordada: un solo administrador. Si ya hay uno, no se hace nada.
      const existing = await manager.count(Admin);
      if (existing > 0) {
        return null;
      }

      // Hash argon2id con los parámetros por defecto de la librería
      // (64 MB de memoria, 3 pasadas, 4 hilos: superan el mínimo de OWASP)
      const passwordHash = await hash(password, { type: argon2id });

      // create() arma el objeto; save() hace el INSERT (sin id: lo genera Postgres)
      const admin = manager.create(Admin, { name: ADMIN_NAME, email, passwordHash });
      const saved = await manager.save(admin);
      return saved.id;
    });

    if (createdId === null) {
      console.log('Ya existe un administrador; no se creó ninguno.');
    } else {
      // Solo el id: ni el correo ni la contraseña quedan en la consola
      console.log(`Administrador creado (id ${createdId}).`);
    }
  } finally {
    // Siempre cierra la conexión, haya funcionado o no
    await AppDataSource.destroy();
  }
}

main().catch((error: unknown) => {
  console.error('No se pudo crear el administrador:', error instanceof Error ? error.message : error);
  // exitCode en vez de exit(): deja terminar el cierre de la conexión antes de salir
  process.exitCode = 1;
});