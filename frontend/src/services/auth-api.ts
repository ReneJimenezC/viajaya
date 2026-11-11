// Sesión del administrador (SAD 3.4 + N-7). El access token (15 min) vive SOLO en memoria;
// el refresh token viaja en una cookie HttpOnly que el JavaScript no puede leer.
// Por eso las 3 llamadas usan withCredentials: el navegador manda y recibe esa cookie.

import { request } from './api-client';
import type { LoginResult } from './types';

// POST /auth/login. 200 con el access token + la cookie del refresh.
export function login(email: string, password: string): Promise<LoginResult> {
  return request<LoginResult>('/auth/login', {
    method: 'POST',
    body: { email, password },
    withCredentials: true,
  });
}

// POST /auth/refresh. Sin body: el refresh token va en la cookie. 200 con un access token
// nuevo y otra cookie (rotación); 401 si la sesión venció (20 min sin uso u 8 h desde el login).
export function refreshSession(): Promise<LoginResult> {
  return request<LoginResult>('/auth/refresh', { method: 'POST', withCredentials: true });
}

// POST /auth/logout. Siempre 204: anula la sesión y borra la cookie.
export function logout(): Promise<void> {
  return request<void>('/auth/logout', { method: 'POST', withCredentials: true });
}