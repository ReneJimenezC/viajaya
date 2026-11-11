// Raíz de todo lo que cuelga de /admin: aquí (y solo aquí) existe la sesión del admin.
// El sitio del turista no la carga, así sus visitas nunca llaman a /auth/refresh.

import { Outlet } from 'react-router';
import { AdminSessionProvider } from '../../context/AdminSessionContext';

export function AdminRoot() {
  return (
    <AdminSessionProvider>
      <Outlet />
    </AdminSessionProvider>
  );
}