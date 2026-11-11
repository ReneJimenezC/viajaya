// Aviso cuando no se pudo revisar la sesión del admin (sin conexión, API apagada o demasiados
// intentos). No se manda al login porque la sesión puede seguir viva: se ofrece reintentar.

import { useAdminSession } from '../../hooks/useAdminSession';
import { Alert } from '../ui/Alert';
import { Button } from '../ui/Button';

export function SessionUnreachable() {
  const { startupError, retry } = useAdminSession();
  return (
    <main className="mx-auto max-w-md space-y-4 px-4 py-16">
      <h1 className="text-3xl font-bold">No pudimos revisar tu sesión</h1>
      <Alert tone="error">{startupError}</Alert>
      <Button onClick={retry}>Intentar de nuevo</Button>
    </main>
  );
}