// Configuración de Vite: el servidor de desarrollo, la compilación y las pruebas (Vitest).
// Equivale al pom.xml + plugins de Maven del frontend.

import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  // react: entiende JSX/TSX. tailwindcss: genera solo las clases que se usan.
  plugins: [react(), tailwindcss()],
  server: {
    // Decisión del 10/11: todo en 127.0.0.1 (la API también), así la cookie del admin
    // (SameSite=Strict) viaja entre el frontend y la API como en producción.
    host: '127.0.0.1',
    port: 5173,
    // Si el puerto 5173 está ocupado, falla en vez de usar otro: CORS_ORIGIN espera el 5173
    strictPort: true,
  },
  preview: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
  },
  test: {
    // Navegador simulado para probar componentes sin abrir Chrome
    environment: 'jsdom',
    // Archivo que se carga antes de cada prueba (agrega expect(...).toBeInTheDocument())
    setupFiles: ['./src/tests/setup.ts'],
    include: ['src/tests/**/*.test.{ts,tsx}'],
  },
});