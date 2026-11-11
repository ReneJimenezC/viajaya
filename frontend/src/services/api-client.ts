// Único cliente HTTP hacia la API (SAD 3.4: "services/ = cliente HTTP hacia la API").
// Todas las peticiones pasan por request(): así el manejo de errores es igual en toda la app.
// Equivale a un RestTemplate/WebClient configurado una sola vez en Spring.

import type { ApiErrorBody, ApiErrorDetail } from './types';

// Dirección de la API: sale de VITE_API_URL (.env del frontend) y, si no está, la de tu PC.
// replace quita una barra final para no armar URLs con "//".
export const API_URL: string = (import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:3000').replace(/\/$/, '');

// En una compilación de producción sin VITE_API_URL, la app llamaría a 127.0.0.1 (la PC de quien
// la abre) y nada funcionaría: se deja un error claro en la consola para encontrarlo rápido.
if (import.meta.env.PROD && !import.meta.env.VITE_API_URL) {
  console.error('Falta VITE_API_URL al compilar el frontend: la app no sabe dónde está la API.');
}

// Mensajes que muestra la app cuando no hay una respuesta de la API que mostrar
export const NETWORK_ERROR_MESSAGE =
  'No se pudo conectar con el servidor. Revisa tu conexión a internet e intenta de nuevo.';
const UNEXPECTED_ERROR_MESSAGE = 'Ocurrió un error inesperado. Intenta de nuevo en unos minutos.';

// Error de la API ya entendido: el código HTTP, el código fijo del backend (NOT_FOUND,
// CONFLICT...), el mensaje en español y los problemas por campo. Equivale a una excepción
// propia en Java con esos atributos.
// status 0 = no hubo respuesta (sin internet o API apagada).
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: ApiErrorDetail[];

  constructor(status: number, code: string, message: string, details: ApiErrorDetail[] = []) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  // Mensaje del campo indicado, si el backend lo marcó. Ejemplo: fieldError('travelDate')
  fieldError(field: string): string | undefined {
    return this.details.find((detail) => detail.field === field)?.message;
  }
}

// Opciones de una petición
export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  // Se convierte a JSON; si no hay body, no se envía Content-Type
  body?: unknown;
  // Access token del admin (cabecera Authorization: Bearer ...)
  token?: string;
  // true solo en /auth/...: permite enviar y recibir la cookie del refresh token (N-7)
  withCredentials?: boolean;
  // Permite cancelar la petición si el usuario sale de la página
  signal?: AbortSignal;
}

// Dice si un JSON tiene la forma del error del backend: { error: { code, message } }
function isApiErrorBody(value: unknown): value is ApiErrorBody {
  if (typeof value !== 'object' || value === null || !('error' in value)) {
    return false;
  }
  const error = (value as { error: unknown }).error;
  return (
    typeof error === 'object' &&
    error !== null &&
    typeof (error as { code?: unknown }).code === 'string' &&
    typeof (error as { message?: unknown }).message === 'string'
  );
}

// Hace una petición a la API y devuelve el JSON ya convertido al tipo T.
// Si la respuesta es un error (4xx/5xx) o no hay conexión, lanza un ApiError.
// Ejemplo: await request<PublicDestination[]>('/destinos')
export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method: options.method ?? 'GET',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      // 'include' manda la cookie a la API (otro puerto = otro origen); 'omit', ninguna
      credentials: options.withCredentials ? 'include' : 'omit',
      signal: options.signal,
    });
  } catch (error) {
    // Si el usuario salió de la página, se deja pasar la cancelación tal cual
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw error;
    }
    throw new ApiError(0, 'NETWORK_ERROR', NETWORK_ERROR_MESSAGE);
  }

  // 204 = salió bien y no hay contenido (logout, eliminar reserva)
  if (response.status === 204) {
    return undefined as T;
  }

  // Se lee como texto primero: una respuesta vacía o que no es JSON no debe romper la app
  const text = await response.text();
  let data: unknown = undefined;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = undefined;
    }
  }

  if (!response.ok) {
    if (isApiErrorBody(data)) {
      throw new ApiError(response.status, data.error.code, data.error.message, data.error.details ?? []);
    }
    throw new ApiError(response.status, 'INTERNAL_ERROR', UNEXPECTED_ERROR_MESSAGE);
  }
  return data as T;
}

// Convierte cualquier error en un texto para mostrarle a la persona.
// Ejemplo: un ApiError 409 → su mensaje; un error de programación → el mensaje genérico.
export function errorMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : UNEXPECTED_ERROR_MESSAGE;
}