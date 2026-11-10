// CORS restringido al dominio del frontend (SAD 6, pág. 13).
// El navegador solo deja que una página lea las respuestas de la API si la API le dice
// "ese origen está permitido". Aquí se permite UN solo origen: el del frontend.
// Equivale a una CorsConfiguration de Spring con allowedOrigins de un solo elemento.

import cors from 'cors';
import type { RequestHandler } from 'express';

// Métodos que usa la API (V53). OPTIONS no se lista: lo atiende la librería sola.
const ALLOWED_METHODS = ['GET', 'POST', 'PATCH', 'DELETE'];
// Cabeceras que el frontend puede enviar (V53): el JSON y el access token del admin
const ALLOWED_HEADERS = ['Content-Type', 'Authorization'];
// Segundos que el navegador puede recordar la respuesta del preflight (10 min)
const PREFLIGHT_MAX_AGE_SECONDS = 600;

// Devuelve el middleware de CORS para el origen permitido.
// Ejemplo: corsPolicy('http://localhost:5173')
export function corsPolicy(allowedOrigin: string): RequestHandler {
  return cors({
    // Lista (y no texto suelto) para que la librería compare el origen: si coincide,
    // lo devuelve en Access-Control-Allow-Origin; si no, no agrega la cabecera (V54)
    origin: [allowedOrigin],
    // Permite que el navegador envíe y reciba la cookie del refresh token (V53, N-7)
    credentials: true,
    methods: ALLOWED_METHODS,
    allowedHeaders: ALLOWED_HEADERS,
    maxAge: PREFLIGHT_MAX_AGE_SECONDS,
  });
}