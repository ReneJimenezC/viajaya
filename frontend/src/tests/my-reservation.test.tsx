// Prueba de la página "Mi reserva" (CU-04 y CU-06) con la API simulada: se escribe como lo haría
// una persona (userEvent) y se revisa lo que ve. Equivale a una prueba de integración con Mockito.

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, MemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, test, vi } from 'vitest';
import { MyReservationPage } from '../pages/public/MyReservationPage';
import type { Reservation } from '../services/types';

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

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function renderPage() {
  return render(
    <MemoryRouter>
      <MyReservationPage />
    </MemoryRouter>,
  );
}

describe('Mi reserva', () => {
  test('valida el formulario antes de llamar a la API', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    renderPage();

    await userEvent.type(screen.getByLabelText('Código de reserva'), 'VY-123');
    await userEvent.click(screen.getByRole('button', { name: 'Buscar mi reserva' }));

    expect(screen.getByText('El código tiene la forma VY- seguido de 8 letras o números')).toBeInTheDocument();
    expect(screen.getByText('Escribe tu correo electrónico')).toBeInTheDocument();
    expect(screen.getByLabelText('Código de reserva')).toHaveAttribute('aria-invalid', 'true');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('muestra el mensaje de CU-04 5a cuando no hay reserva', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(404, {
          error: { code: 'NOT_FOUND', message: 'No se encontró una reserva activa que coincida con los datos' },
        }),
      ),
    );
    renderPage();

    await userEvent.type(screen.getByLabelText('Código de reserva'), 'vy-f57nxnw9');
    await userEvent.type(screen.getByLabelText('Correo electrónico'), 'ana@correo.com');
    await userEvent.click(screen.getByRole('button', { name: 'Buscar mi reserva' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('No se encontró una reserva activa que coincida con los datos');
  });

  test('consulta y cancela con confirmación; el código viaja en el body, no en la URL (N-4)', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, RESERVATION))
      .mockResolvedValueOnce(jsonResponse(200, { ...RESERVATION, status: 'Cancelada' }));
    vi.stubGlobal('fetch', fetchMock);
    renderPage();

    await userEvent.type(screen.getByLabelText('Código de reserva'), ' vy-f57nxnw9 ');
    await userEvent.type(screen.getByLabelText('Correo electrónico'), 'Ana@Correo.com');
    await userEvent.click(screen.getByRole('button', { name: 'Buscar mi reserva' }));

    expect(await screen.findByText('Cambiar o cancelar')).toBeInTheDocument();
    const [lookupUrl, lookupInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(lookupUrl).toMatch(/\/reservas\/consulta$/);
    expect(lookupUrl).not.toContain('VY-');
    expect(JSON.parse(lookupInit.body as string)).toEqual({ code: 'VY-F57NXNW9', customerEmail: 'ana@correo.com' });

    // CU-06 paso 3: primero se pide confirmación; "Volver sin cambios" no llama a la API
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar reserva' }));
    const dialog = screen.getByRole('dialog', { hidden: true });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Volver sin cambios', hidden: true }));
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByRole('button', { name: 'Cancelar reserva' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Sí, cancelar la reserva', hidden: true }));

    expect(await screen.findByText(/Tu reserva fue cancelada/)).toBeInTheDocument();
    const [cancelUrl] = fetchMock.mock.calls[1] as [string];
    expect(cancelUrl).toMatch(/\/reservas\/cancelar$/);
  });

  test('con 48 horas o menos muestra el motivo de la API (RN-02, 422)', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(jsonResponse(200, RESERVATION))
        .mockResolvedValueOnce(
          jsonResponse(422, {
            error: {
              code: 'BUSINESS_RULE',
              message: 'La reserva no se puede cancelar porque faltan 48 horas o menos para la fecha del viaje',
            },
          }),
        ),
    );
    renderPage();

    await userEvent.type(screen.getByLabelText('Código de reserva'), 'VY-F57NXNW9');
    await userEvent.type(screen.getByLabelText('Correo electrónico'), 'ana@correo.com');
    await userEvent.click(screen.getByRole('button', { name: 'Buscar mi reserva' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Cancelar reserva' }));
    await userEvent.click(screen.getByRole('button', { name: 'Sí, cancelar la reserva', hidden: true }));

    expect(await screen.findByRole('alert')).toHaveTextContent('faltan 48 horas o menos');
  });

  test('con los datos que manda la portada consulta sola y los borra del historial (N-4)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, RESERVATION));
    vi.stubGlobal('fetch', fetchMock);
    const router = createMemoryRouter([{ path: '/mi-reserva', element: <MyReservationPage /> }], {
      initialEntries: [
        { pathname: '/mi-reserva', state: { lookup: { code: 'VY-F57NXNW9', customerEmail: 'ana@correo.com' } } },
      ],
    });
    render(<RouterProvider router={router} />);

    expect(await screen.findByText('Cambiar o cancelar')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string)).toEqual({
      code: 'VY-F57NXNW9',
      customerEmail: 'ana@correo.com',
    });
    await vi.waitFor(() => expect(router.state.location.state).toBeNull());
  });
});