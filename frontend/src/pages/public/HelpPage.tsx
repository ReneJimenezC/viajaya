// Ayuda: preguntas frecuentes y contacto (decisión del 10/11: el sitio se ve completo).
// Las respuestas salen de las reglas del SRS (RN-01 a RN-04, CU-04 a CU-06): no prometen
// nada que el sistema no haga. <details> abre y cierra cada respuesta sin JavaScript y
// funciona con teclado y lector de pantalla.

import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { SITE_INFO } from '../../utils/site-info';

const QUESTIONS: { question: string; answer: ReactNode }[] = [
  {
    question: '¿Qué días sale cada excursión?',
    answer:
      'Todos los destinos salen todos los días. Cada uno tiene un cupo máximo de personas por día; cuando se llena, ese día ya no se puede reservar. En la portada, elige la fecha y las personas y pulsa "Ver cupos": te mostramos los lugares libres de cada destino ese día.',
  },
  {
    question: '¿Qué incluye el precio?',
    answer:
      'El precio que ves es por persona y sin impuestos. Al cotizar se multiplica por la cantidad de personas y se suma el IVA del 13 %. Ves el desglose completo antes de pagar.',
  },
  {
    question: '¿Cómo pago?',
    answer:
      'Con tarjeta, al final de la reserva. Los pagos de este sitio son simulados: no se cobra dinero real. Si el pago se aprueba, recibes tu código de confirmación al instante.',
  },
  {
    question: '¿Puedo cambiar la fecha o cancelar?',
    answer: (
      <>
        Sí, desde <Link to="/mi-reserva" className="font-semibold text-bosque underline">Mi reserva</Link>, con tu
        código y tu correo, siempre que falten más de 48 horas para el viaje. El monto no cambia al cambiar la fecha, y
        al cancelar los lugares quedan libres para otras personas.
      </>
    ),
  },
  {
    question: 'Perdí mi código de reserva, ¿qué hago?',
    answer:
      'El código aparece en la confirmación de tu reserva (puedes imprimirla). Si lo perdiste, escríbenos con el correo que usaste y la fecha del viaje.',
  },
  {
    question: '¿Qué pasa si la agencia cancela mi reserva?',
    answer:
      'Lo verás en Mi reserva. Si fue porque el pago no se aprobó, también te lo dice. Si tienes dudas, comunícate con nosotros.',
  },
];

export function HelpPage() {
  useDocumentTitle('Ayuda');

  return (
    <div className="mx-auto max-w-3xl space-y-10">
      <div>
        <h1 className="text-3xl font-bold sm:text-4xl">Ayuda</h1>
        <p className="mt-2 text-basalto-suave">Respuestas rápidas sobre reservas, pagos, cambios y cancelaciones.</p>
      </div>

      <section aria-labelledby="faq-title">
        <h2 id="faq-title" className="text-2xl font-bold">
          Preguntas frecuentes
        </h2>
        <div className="mt-4 divide-y divide-musgo rounded-2xl border border-musgo bg-papel">
          {QUESTIONS.map((item) => (
            <details key={item.question} className="group px-5 py-4">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-md font-semibold [&::-webkit-details-marker]:hidden">
                {item.question}
                <span aria-hidden="true" className="text-xl text-bosque transition-transform group-open:rotate-45">
                  +
                </span>
              </summary>
              <p className="mt-3 max-w-prose text-basalto-suave">{item.answer}</p>
            </details>
          ))}
        </div>
      </section>

      <section aria-labelledby="contact-title" className="rounded-2xl bg-marino p-6 text-white sm:p-8">
        <h2 id="contact-title" className="text-2xl font-bold">
          Contacto
        </h2>
        <dl className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-sm text-celeste-claro">Correo</dt>
            <dd>
              <a href={`mailto:${SITE_INFO.email}`} className="rounded-sm font-semibold underline underline-offset-4">
                {SITE_INFO.email}
              </a>
            </dd>
          </div>
          <div>
            <dt className="text-sm text-celeste-claro">Teléfono</dt>
            <dd>
              <a href={SITE_INFO.phoneHref} className="rounded-sm font-semibold underline underline-offset-4">
                {SITE_INFO.phoneDisplay}
              </a>
            </dd>
          </div>
          <div>
            <dt className="text-sm text-celeste-claro">Horario</dt>
            <dd className="font-semibold">{SITE_INFO.schedule}</dd>
          </div>
          <div>
            <dt className="text-sm text-celeste-claro">Ubicación</dt>
            <dd className="font-semibold">{SITE_INFO.city}</dd>
          </div>
        </dl>
      </section>
    </div>
  );
}