// Pruebas de casos borde de las páginas, con la API simulada:
// - una URL mal escrita no rompe la búsqueda;
// - el atajo "¿Ya tienes una reserva?" no pone el código en la URL;
// - la confirmación borra la reserva del historial del navegador (N-4);
// - si no se puede revisar la sesión del admin, no se manda al login.

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, MemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, test, vi } from 'vitest';
import { AdminSessionProvider } from '../context/AdminSessionContext';
import { LoginPage } from '../pages/admin/LoginPage';
import { ConfirmationPage } from '../pages/public/ConfirmationPage';
import { SearchPage } from '../pages/public/SearchPage';
import type { PublicDestination, Reservation } from '../services/types';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const DESTINATION: PublicDestination = {
  id: 4,
  name: 'Tortuguero',
  description: 'Canales y tortugas',
  place: 'Tortuguero, Limón',
  basePrice: '47500.00',
};

const RESERVATION: Reservation = {
  code: 'VY-F57NXNW9',
  status: 'Pendiente',
  destination: { id: 4, name: 'Tortuguero', place: 'Tortuguero, Limón' },
  travelDate: '2099-12-10',
  customerName: 'Ana Mora',
  customerEmail: 'ana@correo.com',
  quote: { basePrice: '47500.00', people: 2, subtotal: '95000.00', iva: '12350.00', total: '107350.00' },
  payment: { status: 'Aprobado', cardLastDigit: 2 },
  createdAt: '2026-11-06T14:00:00.000Z',
};

describe('portada y búsqueda', () => {
  test('una fecha imposible en la URL se ignora: la página no se rompe', async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(jsonResponse(200, [])));
    vi.stubGlobal('fetch', fetchMock);

    render(
      <MemoryRouter initialEntries={['/?fecha=2026-13-01&personas=2']}>
        <SearchPage />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: 'Destinos disponibles' })).toBeInTheDocument();
    // Se buscó sin fecha (la API no recibe el valor inválido)
    expect(fetchMock.mock.calls[0]?.[0]).not.toContain('fecha=');
  });

  test('"¿Ya tienes una reserva?" no pone el código en la URL (N-4)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => Promise.resolve(jsonResponse(200, [DESTINATION]))));
    const router = createMemoryRouter(
      [
        { path: '/', element: <SearchPage /> },
        { path: '/mi-reserva', element: <p>mi reserva</p> },
      ],
      { initialEntries: ['/'] },
    );
    render(<RouterProvider router={router} />);

    const form = await screen.findByRole('form', { name: 'Consultar mi reserva' });
    await userEvent.type(within(form).getByLabelText('Código de reserva'), 'vy-f57nxnw9');
    await userEvent.type(within(form).getByLabelText('Correo electrónico'), 'ana@correo.com');
    await userEvent.click(within(form).getByRole('button', { name: 'Consultar' }));

    expect(await screen.findByText('mi reserva')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/mi-reserva');
    expect(router.state.location.search).toBe('');
    expect(router.state.location.state).toEqual({ lookup: { code: 'VY-F57NXNW9', customerEmail: 'ana@correo.com' } });
  });
});

describe('confirmación', () => {
  test('muestra el código y lo borra del historial del navegador', async () => {
    const router = createMemoryRouter([{ path: '/reserva-confirmada', element: <ConfirmationPage /> }], {
      initialEntries: [{ pathname: '/reserva-confirmada', state: { reservation: RESERVATION } }],
    });
    render(<RouterProvider router={router} />);

    expect(await screen.findByText('VY-F57NXNW9')).toBeInTheDocument();
    // El efecto reemplaza la entrada del historial por una sin datos
    await vi.waitFor(() => expect(router.state.location.state).toBeNull());
    // Y la página sigue mostrando la reserva (quedó en su memoria)
    expect(screen.getByText('VY-F57NXNW9')).toBeInTheDocument();
  });

  test('sin datos explica cómo consultar la reserva', () => {
    render(
      <MemoryRouter initialEntries={['/reserva-confirmada']}>
        <ConfirmationPage />
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { name: 'No hay una reserva para mostrar' })).toBeInTheDocument();
  });
});

describe('ingreso del admin', () => {
  test('si la API no responde al revisar la sesión, ofrece reintentar en vez del login', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    render(
      <MemoryRouter initialEntries={['/admin/ingresar']}>
        <AdminSessionProvider>
          <LoginPage />
        </AdminSessionProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: 'No pudimos revisar tu sesión' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Intentar de nuevo' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Contraseña')).not.toBeInTheDocument();
  });
});