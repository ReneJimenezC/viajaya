// Boleto de confirmación (CU-03 paso 9: "muestra la confirmación con el código único y toda la
// información de la reserva"). El código va grande, con "Copiar" e "Imprimir" (opción 1 del
// 06/11: el código no se envía por correo, así que el turista debe guardarlo).

import { useState } from 'react';
import type { Reservation } from '../services/types';
import { formatColones, formatTravelDate } from '../utils/format';
import { Button } from './ui/Button';

export function Ticket({ reservation }: { reservation: Reservation }) {
  // Resultado de "Copiar", anunciado a los lectores de pantalla (role="status")
  const [copyMessage, setCopyMessage] = useState('');

  async function copyCode() {
    try {
      // navigator.clipboard solo existe en páginas seguras (https o 127.0.0.1)
      await navigator.clipboard.writeText(reservation.code);
      setCopyMessage('Código copiado.');
    } catch {
      setCopyMessage('No se pudo copiar. Selecciona el código y cópialo a mano.');
    }
  }

  return (
    <article
      aria-labelledby="ticket-code-label"
      className="print-only-area overflow-hidden rounded-2xl border-2 border-bosque bg-papel"
    >
      {/* Talón superior: el código */}
      <div className="bg-bosque px-6 py-6 text-white">
        <p id="ticket-code-label" className="text-celeste-claro">
          Tu código de reserva
        </p>
        <p className="mt-1 font-display text-4xl font-bold tracking-wider break-all sm:text-5xl">
          {reservation.code}
        </p>
        <p className="mt-3 max-w-prose text-celeste-claro">
          Guárdalo: con este código y tu correo puedes consultar, cambiar la fecha o cancelar tu reserva.
        </p>
      </div>

      {/* Línea perforada entre el talón y el cuerpo del boleto (decorativa) */}
      <div aria-hidden="true" className="relative h-0 border-t-2 border-dashed border-celeste">
        <span className="absolute -top-3 -left-3 h-6 w-6 rounded-full border-2 border-bosque bg-neblina" />
        <span className="absolute -top-3 -right-3 h-6 w-6 rounded-full border-2 border-bosque bg-neblina" />
      </div>

      <dl className="grid gap-4 px-6 py-6 sm:grid-cols-2">
        <div>
          <dt className="text-basalto-suave">Destino</dt>
          <dd className="font-semibold">
            {reservation.destination.name} ({reservation.destination.place})
          </dd>
        </div>
        <div>
          <dt className="text-basalto-suave">Fecha del viaje</dt>
          <dd className="font-semibold">{formatTravelDate(reservation.travelDate)}</dd>
        </div>
        <div>
          <dt className="text-basalto-suave">Personas</dt>
          <dd className="font-semibold">{reservation.quote.people}</dd>
        </div>
        <div>
          <dt className="text-basalto-suave">A nombre de</dt>
          <dd className="font-semibold break-words">{reservation.customerName}</dd>
        </div>
        <div>
          <dt className="text-basalto-suave">Correo</dt>
          <dd className="font-semibold break-words">{reservation.customerEmail}</dd>
        </div>
        <div>
          <dt className="text-basalto-suave">Total pagado (IVA incluido)</dt>
          <dd className="font-semibold">{formatColones(reservation.quote.total)}</dd>
        </div>
        <div>
          <dt className="text-basalto-suave">Estado</dt>
          <dd className="font-semibold">
            Reserva {reservation.status.toLowerCase()}, pago {reservation.payment.status.toLowerCase()} (tarjeta
            terminada en {reservation.payment.cardLastDigit})
          </dd>
        </div>
      </dl>

      <div className="no-print flex flex-wrap items-center gap-3 border-t border-musgo px-6 py-4">
        <Button variant="primary" onClick={copyCode}>
          Copiar código
        </Button>
        <Button variant="secondary" onClick={() => window.print()}>
          Imprimir
        </Button>
        <p role="status" className="text-sm text-basalto-suave">
          {copyMessage}
        </p>
      </div>
    </article>
  );
}