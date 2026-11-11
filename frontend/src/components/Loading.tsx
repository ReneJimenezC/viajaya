// Mensaje de "cargando" que también escuchan los lectores de pantalla (role="status").

export function Loading({ text = 'Cargando…' }: { text?: string }) {
  return (
    <p role="status" className="py-8 text-basalto-suave">
      {text}
    </p>
  );
}