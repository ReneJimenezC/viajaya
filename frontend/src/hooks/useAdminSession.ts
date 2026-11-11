// Acceso a la sesión del admin desde cualquier componente del panel.
// Un "hook" es una función de React que empieza con "use" y se llama dentro de un componente.

import { useContext } from 'react';
import { AdminSessionContext, type AdminSession } from '../context/AdminSessionContext';

export function useAdminSession(): AdminSession {
  const session = useContext(AdminSessionContext);
  if (!session) {
    // Error de programación: el componente quedó fuera de <AdminSessionProvider>
    throw new Error('useAdminSession debe usarse dentro de AdminSessionProvider');
  }
  return session;
}