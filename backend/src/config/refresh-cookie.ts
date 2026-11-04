// Cookie del refresh token (N-7): nombre y atributos en un solo lugar.

import type { CookieOptions, Request, Response } from 'express';
import { env } from './env';

// Nombre de la cookie
export const REFRESH_COOKIE_NAME = 'refresh_token';

// Atributos (decisión 3 del 03/11):
// - httpOnly: el JavaScript de la página no puede leerla (protege contra XSS)
// - secure: solo viaja por HTTPS; en tu PC (http://127.0.0.1) se apaga
// - sameSite 'strict': ningún otro sitio puede hacer que el navegador la envíe (protege contra CSRF)
// - path '/auth': el navegador solo la manda a las rutas /auth/...
// - sin maxAge: cookie de sesión, se borra al cerrar el navegador
const REFRESH_COOKIE_OPTIONS: CookieOptions = {
  httpOnly: true,
  secure: env.nodeEnv === 'production',
  sameSite: 'strict',
  path: '/auth',
};

// Pone la cookie con el token nuevo en la respuesta (cabecera Set-Cookie)
export function setRefreshCookie(res: Response, token: string): void {
  res.cookie(REFRESH_COOKIE_NAME, token, REFRESH_COOKIE_OPTIONS);
}

// Le pide al navegador que borre la cookie (mismos atributos, o no la reconoce)
export function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE_NAME, REFRESH_COOKIE_OPTIONS);
}

// Lee el refresh token de la cabecera Cookie. Devuelve el valor o undefined.
// Ejemplo: "otra=1; refresh_token=abc_123" → "abc_123".
// No hace falta una librería: nuestro valor es base64url (letras, números, - y _),
// sin caracteres que necesiten decodificarse.
export function readRefreshCookie(req: Request): string | undefined {
  const header = req.headers.cookie;
  if (!header) {
    return undefined;
  }
  const prefix = `${REFRESH_COOKIE_NAME}=`;
  // Las cookies llegan separadas por ";": se quitan espacios y se busca la nuestra
  const found = header
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix));
  const value = found?.slice(prefix.length);
  // Solo se acepta la forma exacta de nuestros tokens (43 caracteres base64url)
  return value && /^[A-Za-z0-9_-]{43}$/.test(value) ? value : undefined;
}