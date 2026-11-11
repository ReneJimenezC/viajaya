// Página para direcciones que no existen en la app

import { Link } from 'react-router';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

export function NotFoundPage() {
  useDocumentTitle('Página no encontrada');
  return (
    <div className="mx-auto max-w-xl space-y-4 py-10">
      <h1 className="text-3xl font-bold">No encontramos esta página</h1>
      <p>Revisa la dirección o vuelve al inicio para buscar una excursión.</p>
      <Link
        to="/"
        className="inline-flex min-h-11 items-center rounded-lg bg-bosque px-5 py-2 font-semibold text-white hover:bg-bosque-oscuro"
      >
        Ir al inicio
      </Link>
    </div>
  );
}
