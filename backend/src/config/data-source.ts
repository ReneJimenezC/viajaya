// Configuración de TypeORM: cómo conectarse a Postgres y qué entidades conoce.
// Equivale al DataSource / EntityManagerFactory de JPA. Es la única instancia de la app.

import { DataSource } from 'typeorm';
import { env } from './env';

export const AppDataSource = new DataSource({
  // Motor de base de datos; TypeORM usa por debajo el driver "pg"
  type: 'postgres',
  // Usuario, clave, host, puerto y base salen de una sola URL ya validada en env.ts
  url: env.databaseUrl,
  // Clases @Entity que TypeORM conoce; se agregan una por una en los módulos siguientes
  entities: [],
  // NUNCA crear ni alterar tablas a partir de las entidades: solo con migraciones (SAD 4)
  synchronize: false,
  // En desarrollo muestra los errores de SQL; en producción no, porque el mensaje
  // incluye la consulta y sus parámetros (correos, nombres)
  logging: env.nodeEnv === 'development' ? ['error'] : false,
  // Si Postgres no responde en 5 s, falla en vez de quedarse esperando para siempre
  connectTimeoutMS: 5000,
});