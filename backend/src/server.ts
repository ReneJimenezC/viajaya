// Punto de entrada: lee la configuración, crea la app y la pone a escuchar.

// Importar env primero valida las variables antes de hacer cualquier otra cosa
import { env } from './config/env';
import { createApp } from './app';

const app = createApp();

// Abre el puerto. En Express 5, si falla (ej. puerto ocupado) llega "error".
const server = app.listen(env.port, (error?: Error) => {
  if (error) {
    // Sin puerto no hay servicio: se informa y se termina con código de error
    console.error('No se pudo iniciar el servidor:', error.message);
    process.exit(1);
  }
  // Mensaje temporal; el logging estructurado llega en un módulo posterior
  console.log(`API escuchando en el puerto ${env.port} (${env.nodeEnv})`);
});

// Apagado ordenado: Docker y Render envían SIGTERM; Ctrl+C envía SIGINT
function shutdown(signal: string): void {
  console.log(`${signal} recibido, cerrando el servidor...`);
  // Deja de aceptar conexiones nuevas y espera a que terminen las abiertas
  server.close(() => process.exit(0));
  // Si en 10 s no terminó, se fuerza la salida; unref() no bloquea el cierre normal
  setTimeout(() => process.exit(1), 10_000).unref();
}

// Escucha ambas señales y llama a shutdown con su nombre
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));