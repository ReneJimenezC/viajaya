// Página de respaldo si una pantalla falla al dibujarse (un error inesperado de programación).
// Sin ella, React Router mostraría su pantalla por defecto, en inglés. Va como "errorElement"
// en las rutas principales (router.tsx). El detalle técnico no se muestra a la persona.

import { Link } from 'react-router';

export function RouteErrorPage() {
  return (
    <main className="mx-auto max-w-xl space-y-4 px-4 py-16">
      <h1 className="text-3xl font-bold">Algo salió mal al mostrar esta página</h1>
      <p>Recarga la página o vuelve al inicio. Si el problema sigue, intenta de nuevo en unos minutos.</p>
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="inline-flex min-h-11 items-center rounded-lg bg-bosque px-5 py-2 font-semibold text-white hover:bg-bosque-oscuro"
        >
          Recargar la página
        </button>
        {/* reloadDocument: carga la app de cero, por si el error dejó algo a medias */}
        <Link
          to="/"
          reloadDocument
          className="inline-flex min-h-11 items-center rounded-lg border border-bosque bg-papel px-5 py-2 font-semibold text-bosque hover:bg-celeste-claro"
        >
          Ir al inicio
        </Link>
      </div>
    </main>
  );
}