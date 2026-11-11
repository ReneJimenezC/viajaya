// Tipos de las variables de entorno del frontend (import.meta.env.VITE_...).
// Así TypeScript avisa si se escribe mal el nombre de una variable.

/// <reference types="vite/client" />

interface ImportMetaEnv {
  // Dirección de la API sin barra final (ver .env.example)
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}