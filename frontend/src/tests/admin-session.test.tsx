// Pruebas de la sesión del admin (context/AdminSessionContext.tsx, N-7) con la API simulada.
// Comprueban la parte delicada: renovar el token con la cookie y repetir la petición UNA vez.

import { act, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import { AdminSessionProvider } from '../context/AdminSessionContext';
import { useAdminSession } from '../hooks/useAdminSession';
import type { AdminSession } from '../context/AdminSessionContext';

function jsonResponse(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const UNAUTHORIZED = { error: { code: 'UNAUTHORIZED', message: 'La sesión expiró o no es válida. Inicia sesión de nuevo.' } };
const token = (value: string) => ({ accessToken: value, tokenType: 'Bearer', expiresIn: 900 });

// Componente de prueba que expone la sesión para usarla desde la prueba
let session: AdminSession | null = null;
function Probe() {
  session = useAdminSession();
  return <p>estado: {session.status}</p>;
}

function renderWithSession() {
  session = null;
  render(
    <AdminSessionProvider>
      <Probe />
    </AdminSessionProvider>,
  );
}

// Ruta y cabecera Authorization de cada llamada a fetch
function calls(fetchMock: ReturnType<typeof vi.fn>): string[] {
  return fetchMock.mock.calls.map(([url, init]) => {
    const auth = ((init as RequestInit).headers as Record<string, string>).Authorization ?? '-';
    return `${new URL(url as string).pathname} ${auth}`;
  });
}

describe('sesión del admin', () => {
  test('sin cookie válida queda "anonymous"; con login pasa a "authenticated"', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(401, UNAUTHORIZED)) // /auth/refresh al abrir el panel
      .mockResolvedValueOnce(jsonResponse(200, token('t1'))); // /auth/login
    vi.stubGlobal('fetch', fetchMock);
    renderWithSession();

    expect(await screen.findByText('estado: anonymous')).toBeInTheDocument();
    await act(() => session!.login('admin@viajaya.test', 'clave'));
    expect(screen.getByText('estado: authenticated')).toBeInTheDocument();
    // La sesión inicial no vino de un vencimiento: no se avisa "expiró"
    expect(session!.expired).toBe(false);
  });

  test('con la cookie viva, al abrir (F5) no pide la contraseña', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(jsonResponse(200, token('t1'))));
    renderWithSession();
    expect(await screen.findByText('estado: authenticated')).toBeInTheDocument();
  });

  test('si la API responde 401, renueva una vez y repite la petición con el token nuevo', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, token('t1'))) // refresh inicial
      .mockResolvedValueOnce(jsonResponse(401, UNAUTHORIZED)) // GET con t1 (rechazado)
      .mockResolvedValueOnce(jsonResponse(200, token('t2'))) // refresh
      .mockResolvedValueOnce(jsonResponse(200, [{ id: 1 }])); // GET con t2
    vi.stubGlobal('fetch', fetchMock);
    renderWithSession();
    await screen.findByText('estado: authenticated');

    const data = await act(() => session!.send<{ id: number }[]>('/admin/reservas'));

    expect(data).toEqual([{ id: 1 }]);
    expect(calls(fetchMock)).toEqual([
      '/auth/refresh -',
      '/admin/reservas Bearer t1',
      '/auth/refresh -',
      '/admin/reservas Bearer t2',
    ]);
  });

  test('si la renovación también falla, la sesión termina y se avisa que expiró', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, token('t1')))
      .mockResolvedValueOnce(jsonResponse(401, UNAUTHORIZED))
      .mockResolvedValueOnce(jsonResponse(401, UNAUTHORIZED));
    vi.stubGlobal('fetch', fetchMock);
    renderWithSession();
    await screen.findByText('estado: authenticated');

    const error = await act(() => session!.send('/admin/reservas').catch((e: unknown) => e));

    expect((error as Error).message).toBe('Tu sesión expiró. Inicia sesión de nuevo.');
    await waitFor(() => expect(screen.getByText('estado: anonymous')).toBeInTheDocument());
    expect(session!.expired).toBe(true);
    // No reintenta sin fin: 1 refresh inicial + 1 petición + 1 refresh
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  test('dos peticiones a la vez con el token vencido comparten UNA sola renovación', async () => {
    const fetchMock = vi.fn((url: string) => {
      const path = new URL(url).pathname;
      if (path === '/auth/refresh') {
        return Promise.resolve(jsonResponse(200, { ...token('t-nuevo'), expiresIn: 900 }));
      }
      return Promise.resolve(jsonResponse(200, []));
    });
    vi.stubGlobal('fetch', fetchMock);
    // Primer token casi vencido (10 s): se renueva antes de usarlo
    fetchMock.mockImplementationOnce(() => Promise.resolve(jsonResponse(200, { ...token('t-viejo'), expiresIn: 10 })));
    renderWithSession();
    await screen.findByText('estado: authenticated');

    await act(() => Promise.all([session!.send('/admin/reservas'), session!.send('/admin/destinos')]));

    const refreshes = calls(fetchMock).filter((call) => call.startsWith('/auth/refresh'));
    // 1 al abrir + 1 compartida por las dos peticiones (rotación: un segundo uso del mismo
    // refresh token podría anular la sesión en el backend)
    expect(refreshes).toHaveLength(2);
    expect(calls(fetchMock).filter((call) => call.includes('Bearer t-nuevo'))).toHaveLength(2);
  });

  test('cerrar sesión llama a /auth/logout y queda "anonymous" aunque la API falle', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, token('t1')))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'));
    vi.stubGlobal('fetch', fetchMock);
    renderWithSession();
    await screen.findByText('estado: authenticated');

    await act(() => session!.logout());

    expect(screen.getByText('estado: anonymous')).toBeInTheDocument();
    expect(calls(fetchMock).at(-1)).toBe('/auth/logout -');
  });
});