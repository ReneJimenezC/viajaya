// Mapa de páginas de la SPA (equivale a la tabla de @RequestMapping del frontend).
// Turista: / (portada y búsqueda), /cotizar, /reserva-confirmada, /mi-reserva, /ayuda.
// Admin (botón "Administración" en el menú): /admin/ingresar, /admin/reservas, /admin/destinos.

import { createBrowserRouter, Navigate } from 'react-router';
import { AdminLayout } from './components/layout/AdminLayout';
import { AdminRoot } from './components/layout/AdminRoot';
import { PublicLayout } from './components/layout/PublicLayout';
import { RequireAdmin } from './components/layout/RequireAdmin';
import { DestinationsPage } from './pages/admin/DestinationsPage';
import { LoginPage } from './pages/admin/LoginPage';
import { ReservationsPage } from './pages/admin/ReservationsPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { RouteErrorPage } from './pages/RouteErrorPage';
import { ConfirmationPage } from './pages/public/ConfirmationPage';
import { HelpPage } from './pages/public/HelpPage';
import { MyReservationPage } from './pages/public/MyReservationPage';
import { QuotePage } from './pages/public/QuotePage';
import { SearchPage } from './pages/public/SearchPage';

export const router = createBrowserRouter([
  {
    // Sitio del turista
    element: <PublicLayout />,
    errorElement: <RouteErrorPage />,
    children: [
      { index: true, element: <SearchPage /> },
      { path: 'cotizar', element: <QuotePage /> },
      { path: 'reserva-confirmada', element: <ConfirmationPage /> },
      { path: 'mi-reserva', element: <MyReservationPage /> },
      { path: 'ayuda', element: <HelpPage /> },
    ],
  },
  {
    // Panel del admin: aquí vive la sesión (AdminRoot)
    path: 'admin',
    element: <AdminRoot />,
    errorElement: <RouteErrorPage />,
    children: [
      { index: true, element: <Navigate to="/admin/reservas" replace /> },
      { path: 'ingresar', element: <LoginPage /> },
      {
        // Todo lo de aquí abajo exige sesión (RequireAdmin) y usa el marco del panel
        element: <RequireAdmin />,
        children: [
          {
            element: <AdminLayout />,
            children: [
              { path: 'reservas', element: <ReservationsPage /> },
              { path: 'destinos', element: <DestinationsPage /> },
            ],
          },
        ],
      },
    ],
  },
  {
    // Cualquier otra dirección
    element: <PublicLayout />,
    errorElement: <RouteErrorPage />,
    children: [{ path: '*', element: <NotFoundPage /> }],
  },
]);