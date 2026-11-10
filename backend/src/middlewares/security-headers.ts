// Cabeceras de seguridad (decisión 2 = A del Paso 10, V56): helmet con sus valores por
// defecto, ajustado para una API que SOLO responde JSON (no sirve páginas HTML).
// Equivale a http.headers() de Spring Security, que pone estas cabeceras por defecto.

import helmet from 'helmet';
import type { RequestHandler } from 'express';

export function securityHeaders(): RequestHandler {
  return helmet({
    // CSP mínima: la API no carga scripts, estilos ni imágenes, así que no se permite nada
    // ('none'), y ninguna página puede meter sus respuestas en un iframe (frame-ancestors).
    // useDefaults: false quita las reglas pensadas para páginas HTML.
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
    // Lo mismo para navegadores viejos que no entienden frame-ancestors: X-Frame-Options: DENY
    frameguard: { action: 'deny' },
  });
}