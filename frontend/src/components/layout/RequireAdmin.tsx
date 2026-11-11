// Guardia de las páginas del panel: si no hay sesión de admin, manda a la página de ingreso y
// recuerda a dónde se quería ir. Es solo comodidad: la protección REAL está en la API
// (requireAdmin en cada ruta /admin): sin token válido, la API no entrega nada.
// Equivale a la configuración de rutas protegidas de Spring Security.

import { Navigate, Outlet, useLocation } from 'react-router';
import { useAdminSession } from '../../hooks/useAdminSession';
import { Loading } from '../Loading';
import { SessionUnreachable } from './SessionUnreachable';

export function RequireAdmin() {
  const { status } = useAdminSession();
  const location = useLocation();

  if (status === 'checking') {
    return (
      <div className="mx-auto max-w-md px-4">
        <Loading text="Revisando tu sesión…" />
      </div>
    );
  }
  if (status === 'unreachable') {
    return <SessionUnreachable />;
  }
  if (status === 'anonymous') {
    return <Navigate to="/admin/ingresar" replace state={{ from: location.pathname }} />;
  }
  return <Outlet />;
}