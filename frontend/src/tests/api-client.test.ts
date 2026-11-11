// Pruebas del cliente HTTP (services/api-client.ts) con un fetch falso: sin red ni backend.

import { describe, expect, test, vi } from 'vitest';
import { API_URL, ApiError, NETWORK_ERROR_MESSAGE, errorMessage, request } from '../services/api-client';

// Respuesta falsa de fetch con un código y un cuerpo JSON
function fakeResponse(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('request', () => {
  test('envía JSON y devuelve el cuerpo de la respuesta', async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse(200, { ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    const data = await request<{ ok: boolean }>('/cotizaciones', { method: 'POST', body: { people: 2 } });

    expect(data).toEqual({ ok: true });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${API_URL}/cotizaciones`);
    expect(init.method).toBe('POST');
    expect(init.body).toBe('{"people":2}');
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
    // Las rutas públicas nunca mandan cookies
    expect(init.credentials).toBe('omit');
  });

  test('agrega el token del admin y permite la cookie solo si se pide', async () => {
    // Una respuesta nueva en cada llamada (el cuerpo de una Response solo se puede leer una vez)
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(fakeResponse(200, [])));
    vi.stubGlobal('fetch', fetchMock);

    await request('/admin/reservas', { token: 'abc' });
    await request('/auth/refresh', { method: 'POST', withCredentials: true });

    const first = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const second = fetchMock.mock.calls[1]?.[1] as RequestInit;
    expect((first.headers as Record<string, string>).Authorization).toBe('Bearer abc');
    expect(first.credentials).toBe('omit');
    expect(second.credentials).toBe('include');
  });

  test('convierte el error del backend (formato B) en ApiError con sus detalles', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        fakeResponse(400, {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Los datos enviados no son válidos',
            details: [{ field: 'travelDate', message: 'La fecha del viaje debe ser posterior a hoy' }],
          },
        }),
      ),
    );

    const error = await request('/reservas', { method: 'POST', body: {} }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    const apiError = error as ApiError;
    expect(apiError.status).toBe(400);
    expect(apiError.code).toBe('VALIDATION_ERROR');
    expect(apiError.fieldError('travelDate')).toBe('La fecha del viaje debe ser posterior a hoy');
    expect(apiError.fieldError('people')).toBeUndefined();
  });

  test('204 devuelve undefined', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
    await expect(request('/auth/logout', { method: 'POST' })).resolves.toBeUndefined();
  });

  test('sin conexión: ApiError con status 0 y un mensaje claro', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    const error = (await request('/destinos').catch((e: unknown) => e)) as ApiError;
    expect(error.status).toBe(0);
    expect(error.message).toBe(NETWORK_ERROR_MESSAGE);
  });

  test('un error sin el formato del backend da un mensaje genérico, no el texto crudo', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>Bad Gateway</html>', { status: 502 })));
    const error = (await request('/destinos').catch((e: unknown) => e)) as ApiError;
    expect(error.status).toBe(502);
    expect(error.message).not.toContain('html');
  });
});

describe('errorMessage', () => {
  test('usa el mensaje de ApiError y uno genérico para lo demás', () => {
    expect(errorMessage(new ApiError(409, 'CONFLICT', 'No hay cupo'))).toBe('No hay cupo');
    expect(errorMessage(new Error('detalle interno'))).not.toContain('detalle interno');
  });
});