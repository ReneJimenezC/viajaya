// Marco del panel de administración (SAD 3.1: páginas del administrador). Se ve distinto al
// sitio del turista (franja verde arriba) para que quede claro en qué lado se está.

import { useRef, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router';
import { useAdminSession } from '../../hooks/useAdminSession';
import { Logo } from '../Logo';
import { Button } from '../ui/Button';
import { SkipLink } from './SkipLink';
import { useFocusOnNavigate } from './useFocusOnNavigate';

function navClasses({ isActive }: { isActive: boolean }): string {
  return `block rounded-md px-3 py-2 font-semibold ${
    isActive ? 'bg-celeste-claro text-bosque' : 'text-white hover:bg-bosque-oscuro'
  }`;
}

export function AdminLayout() {
  const { logout } = useAdminSession();
  const navigate = useNavigate();
  const [leaving, setLeaving] = useState(false);
  const mainRef = useRef<HTMLElement>(null);
  useFocusOnNavigate(mainRef);

  async function handleLogout() {
    setLeaving(true);
    await logout();
    navigate('/admin/ingresar', { replace: true });
  }

  return (
    <div className="flex min-h-screen flex-col">
      <SkipLink />
      <header className="bg-bosque text-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="rounded-full bg-neblina px-2 py-1 text-bosque">
              <Logo className="text-xl" />
            </span>
            <span className="font-display text-lg">Panel de administración</span>
          </div>
          <nav aria-label="Administración" className="flex flex-wrap items-center gap-2">
            <ul className="flex flex-wrap gap-1">
              <li>
                <NavLink to="/admin/reservas" className={navClasses}>
                  Reservas
                </NavLink>
              </li>
              <li>
                <NavLink to="/admin/destinos" className={navClasses}>
                  Destinos
                </NavLink>
              </li>
            </ul>
            <Button
              variant="secondary"
              onClick={handleLogout}
              loading={leaving}
              loadingText="Cerrando sesión…"
              className="min-h-10 py-1"
            >
              Cerrar sesión
            </Button>
          </nav>
        </div>
      </header>

      <main id="contenido" ref={mainRef} tabIndex={-1} className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 outline-none">
        <Outlet />
      </main>
    </div>
  );
}