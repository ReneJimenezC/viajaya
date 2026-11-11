// Punto de entrada: carga los estilos y dibuja la app dentro de <div id="root"> (index.html).
// Equivale al main() de una aplicación Java.

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router/dom';
import { router } from './router';
import './styles/index.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('No existe el elemento #root en index.html');
}

// StrictMode: en desarrollo ejecuta dos veces algunas partes para detectar errores; no afecta a producción
createRoot(rootElement).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);