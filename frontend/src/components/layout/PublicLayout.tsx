// Marco de las páginas del turista: encabezado azul marino con el menú, contenido y pie de
// página con columnas (estética propuesta por el equipo el 10/11).
// <Outlet /> es el lugar donde React Router dibuja la página de la ruta actual.
// La portada (/) ocupa todo el ancho (su franja de portada va de borde a borde); las demás
// páginas van dentro de una columna centrada.

import { useRef } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router';
import { SITE_INFO } from '../../utils/site-info';
import { Logo } from '../Logo';
import { SkipLink } from './SkipLink';
import { useFocusOnNavigate } from './useFocusOnNavigate';

// NavLink marca la página actual con aria-current="page"; aquí también con un subrayado celeste
function navClasses({ isActive }: { isActive: boolean }): string {
  return `rounded-md px-3 py-2 font-semibold text-white hover:bg-white/10 ${
    isActive ? 'underline decoration-celeste decoration-4 underline-offset-8' : ''
  }`;
}

// Enlace del pie de página
function FooterLink({ to, children }: { to: string; children: string }) {
  return (
    <li>
      <Link to={to} className="rounded-sm text-celeste-claro underline-offset-4 hover:underline">
        {children}
      </Link>
    </li>
  );
}

export function PublicLayout() {
  const mainRef = useRef<HTMLElement>(null);
  useFocusOnNavigate(mainRef);
  const isHome = useLocation().pathname === '/';

  return (
    <div className="flex min-h-screen flex-col">
      <SkipLink />
      <header className="no-print bg-marino text-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <Link to="/" className="rounded-md">
            <Logo onDark />
          </Link>
          <nav aria-label="Principal">
            <ul className="flex flex-wrap items-center gap-1">
              <li>
                <NavLink to="/" end className={navClasses}>
                  Inicio
                </NavLink>
              </li>
              <li>
                <NavLink to="/mi-reserva" className={navClasses}>
                  Mi reserva
                </NavLink>
              </li>
              <li>
                <NavLink to="/ayuda" className={navClasses}>
                  Ayuda
                </NavLink>
              </li>
              <li className="ml-1">
                {/* Entrada al panel del personal (decisión del 10/11). Mostrarlo no baja la seguridad:
                    el panel lo protege la API con login y token (N-7), no el estar oculto */}
                <Link
                  to="/admin"
                  className="inline-flex min-h-10 items-center rounded-lg bg-celeste px-4 py-1.5 font-semibold text-marino-oscuro hover:bg-celeste-claro"
                >
                  Administración
                </Link>
              </li>
            </ul>
          </nav>
        </div>
      </header>

      <main
        id="contenido"
        ref={mainRef}
        tabIndex={-1}
        className={`w-full flex-1 outline-none ${isHome ? '' : 'mx-auto max-w-5xl px-4 py-8'}`}
      >
        <Outlet />
      </main>

      <footer className="no-print bg-marino text-white">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1.3fr]">
          <div>
            <Logo onDark />
            <p className="mt-3 max-w-xs text-celeste-claro">
              Excursiones en Costa Rica. Reserva fácil, rápido y sin complicaciones.
            </p>
          </div>
          <nav aria-labelledby="footer-explore">
            <h2 id="footer-explore" className="text-lg font-bold">
              Explora
            </h2>
            <ul className="mt-3 space-y-2">
              <FooterLink to="/">Destinos</FooterLink>
              <FooterLink to="/mi-reserva">Mi reserva</FooterLink>
            </ul>
          </nav>
          <nav aria-labelledby="footer-help">
            <h2 id="footer-help" className="text-lg font-bold">
              Ayuda
            </h2>
            <ul className="mt-3 space-y-2">
              <FooterLink to="/ayuda">Preguntas frecuentes</FooterLink>
              <FooterLink to="/ayuda">Cambios y cancelaciones</FooterLink>
            </ul>
          </nav>
          <div>
            <h2 className="text-lg font-bold">Contacto</h2>
            <ul className="mt-3 space-y-2 text-celeste-claro">
              <li>
                <a href={`mailto:${SITE_INFO.email}`} className="rounded-sm underline-offset-4 hover:underline">
                  {SITE_INFO.email}
                </a>
              </li>
              <li>
                <a href={SITE_INFO.phoneHref} className="rounded-sm underline-offset-4 hover:underline">
                  {SITE_INFO.phoneDisplay}
                </a>
              </li>
              <li>{SITE_INFO.schedule}</li>
            </ul>
          </div>
        </div>
        <div className="bg-marino-oscuro">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-4 text-sm text-celeste-claro">
            <p>© 2026 ViajaYa. Precios en colones; el total incluye el IVA del 13 %. Los pagos son simulados.</p>
            <Link to="/admin" className="rounded-sm underline underline-offset-4">
              Acceso para el personal
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}