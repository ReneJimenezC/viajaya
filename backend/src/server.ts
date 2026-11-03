// Punto de entrada: valida la configuración, conecta a la base, crea la app y la pone a escuchar.

// Debe ir antes que cualquier entidad: da soporte a los metadatos de los decoradores de TypeORM
import 'reflect-metadata';
// "import type" solo trae el tipo para TypeScript; no carga nada al ejecutar
import type { Server } from 'node:http';
// Importar env primero valida las variables antes de hacer cualquier otra cosa
import { env } from './config/env';
import { AppDataSource } from './config/data-source';
import { createApp } from './app';

// Servidor HTTP; sigue en undefined mientras la base todavía no está conectada
let server: Server | undefined;
// Evita ejecutar el apagado dos veces (por ejemplo, Ctrl+C presionado dos veces)
let shuttingDown = false;

// Arranque en orden: primero la base, después el puerto
async function start(): Promise<void> {
  // Abre el pool de conexiones a Postgres; si falla, lanza un error y no se abre el puerto
  await AppDataSource.initialize();
  console.log('Conectado a la base de datos');

  const app = createApp();
  // Abre el puerto. En Express 5, si falla (ej. puerto ocupado) llega "error".
  server = app.listen(env.port, (error?: Error) => {
    if (error) {
      // Sin puerto no hay servicio: se informa y se termina con código de error
      console.error('No se pudo iniciar el servidor:', error.message);
      process.exit(1);
    }
    // Mensaje temporal; el logging estructurado llega en un módulo posterior
    console.log(`API escuchando en el puerto ${env.port} (${env.nodeEnv})`);
  });
}

// Apagado ordenado: Docker y Render envían SIGTERM; Ctrl+C envía SIGINT
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal} recibido, cerrando...`);
  // Si en 10 s no terminó, se fuerza la salida; unref() no bloquea el cierre normal
  setTimeout(() => process.exit(1), 10_000).unref();

  try {
    // 1) Deja de aceptar conexiones nuevas y espera a que terminen las peticiones abiertas
    const current = server;
    if (current) {
      await new Promise<void>((resolve) => current.close(() => resolve()));
    }
    // 2) Cierra las conexiones a Postgres, solo si llegaron a abrirse
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
    }
    console.log('Servidor y base de datos cerrados');
    process.exit(0);
  } catch (error) {
    console.error('Error al cerrar:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

// Escucha ambas señales; "void" indica que no se espera la promesa a propósito
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

// Si el arranque falla (base apagada, clave incorrecta...), se informa y se termina.
// Los mensajes de pg ("ECONNREFUSED", "password authentication failed") no incluyen la clave.
start().catch((error: unknown) => {
  console.error('No se pudo iniciar la API:', error instanceof Error ? error.message : error);
  process.exit(1);
});