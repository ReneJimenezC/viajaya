// Cotización (RF-02, CU-02) y reserva con pago simulado (RF-03, CU-03) en una misma página.
// URL: /cotizar?destino=4&fecha=2026-12-10&personas=2 (viene del botón "Cotizar" de la búsqueda).
// 1) Pide la cotización a la API y muestra el desglose (CU-02 paso 4).
// 2) "Reservar" muestra el formulario: nombre, correo y tarjeta (CU-03 pasos 1 a 3).
// 3) La API vuelve a revisar el cupo, cobra (RN-04) y devuelve el código (CU-03 pasos 4 a 9).

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { QuoteBreakdown } from '../../components/QuoteBreakdown';
import { Loading } from '../../components/Loading';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { TextField } from '../../components/ui/Field';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { ApiError, errorMessage } from '../../services/api-client';
import { createReservation, getQuote } from '../../services/public-api';
import type { QuoteResult } from '../../services/types';
import { isCalendarDate } from '../../utils/format';
import { reservationFormSchema, toFieldErrors, type FieldErrors } from '../../utils/validation';

// Datos del viaje leídos de la URL; null si faltan o no tienen forma válida
function tripFromParams(params: URLSearchParams): { destinationId: number; travelDate: string; people: number } | null {
  const destino = params.get('destino') ?? '';
  const fecha = params.get('fecha') ?? '';
  const personas = params.get('personas') ?? '';
  if (!/^[1-9]\d{0,9}$/.test(destino) || !isCalendarDate(fecha) || !/^[1-9]\d{0,3}$/.test(personas)) {
    return null;
  }
  return { destinationId: Number(destino), travelDate: fecha, people: Number(personas) };
}

// Error de reserva que se muestra arriba del formulario, con un enlace para volver si aplica
interface SubmitProblem {
  message: string;
  backToSearch: boolean;
}

export function QuotePage() {
  useDocumentTitle('Cotización');
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const paramsKey = params.toString();
  const trip = tripFromParams(params);

  const [quote, setQuote] = useState<QuoteResult | null>(null);
  const [quoteError, setQuoteError] = useState('');

  const [showForm, setShowForm] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [problem, setProblem] = useState<SubmitProblem | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const cardRef = useRef<HTMLInputElement>(null);

  // Pide la cotización a la API (CU-02 pasos 2 a 4)
  useEffect(() => {
    const current = tripFromParams(new URLSearchParams(paramsKey));
    if (!current) return;
    const controller = new AbortController();
    setQuote(null);
    setQuoteError('');
    getQuote(current, controller.signal)
      .then(setQuote)
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        // Un 400 trae el motivo por campo (por ejemplo, la fecha ya no es futura en una pestaña vieja)
        const fieldMessage =
          error instanceof ApiError
            ? (error.fieldError('travelDate') ?? error.fieldError('people') ?? error.fieldError('destinationId'))
            : undefined;
        setQuoteError(fieldMessage ?? errorMessage(error));
      });
    return () => controller.abort();
  }, [paramsKey]);

  // Al mostrar el formulario, el foco va al primer campo
  useEffect(() => {
    if (showForm) nameRef.current?.focus();
  }, [showForm]);

  // Vuelve a la búsqueda con los mismos datos (CU-02 5a: cambiar destino, fecha o personas)
  const searchLink = trip
    ? `/?${new URLSearchParams({ fecha: trip.travelDate, personas: String(trip.people) }).toString()}`
    : '/';

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!trip || submitting) return;
    setProblem(null);
    const result = reservationFormSchema.safeParse({ customerName, customerEmail, cardNumber });
    if (!result.success) {
      setFieldErrors(toFieldErrors(result.error));
      return;
    }
    setFieldErrors({});
    setSubmitting(true);
    try {
      const reservation = await createReservation({ ...trip, ...result.data });
      // replace: con "atrás" se vuelve a la búsqueda, no a este formulario (evita reservar dos veces)
      navigate('/reserva-confirmada', { replace: true, state: { reservation } });
    } catch (error) {
      setSubmitting(false);
      if (error instanceof ApiError && error.status === 402) {
        // CU-03 6a: pago rechazado; se puede intentar con otra tarjeta
        setCardNumber('');
        setFieldErrors({ cardNumber: 'Prueba con otra tarjeta.' });
        setProblem({ message: error.message, backToSearch: false });
        cardRef.current?.focus();
        return;
      }
      if (error instanceof ApiError && error.status === 400 && error.details.length > 0) {
        // CU-03 4a: la API marcó campos (por ejemplo, la fecha dejó de ser futura)
        setFieldErrors({
          customerName: error.fieldError('customerName'),
          customerEmail: error.fieldError('customerEmail'),
          cardNumber: error.fieldError('cardNumber'),
        });
        const tripError = error.fieldError('travelDate') ?? error.fieldError('people') ?? error.fieldError('destinationId');
        setProblem({ message: tripError ?? error.message, backToSearch: tripError !== undefined });
        return;
      }
      // CU-03 5a (sin cupo, 409) o destino desactivado (404): hay que elegir otra opción
      const backToSearch = error instanceof ApiError && (error.status === 409 || error.status === 404);
      setProblem({ message: errorMessage(error), backToSearch });
    }
  }

  if (!trip) {
    return (
      <div className="space-y-4">
        <h1 className="text-3xl font-bold">Cotización</h1>
        <Alert tone="error">
          Faltan los datos del viaje. <Link to="/" className="font-semibold underline">Vuelve a la búsqueda</Link> y elige
          un destino, la fecha y las personas.
        </Alert>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link to={searchLink} className="font-semibold text-bosque underline underline-offset-4">
          Cambiar destino, fecha o personas
        </Link>
        <h1 className="mt-3 text-3xl font-bold sm:text-4xl">{quote ? quote.destination.name : 'Cotización'}</h1>
        <p className="text-basalto-suave">Revisa el costo total antes de reservar.</p>
      </div>

      {quoteError && (
        <Alert tone="error">
          {quoteError}{' '}
          <Link to={searchLink} className="font-semibold underline">
            Elige otra opción en la búsqueda
          </Link>
          .
        </Alert>
      )}
      {!quote && !quoteError && <Loading text="Calculando la cotización…" />}

      {quote && (
        <>
          <QuoteBreakdown
            destinationName={quote.destination.name}
            place={quote.destination.place}
            travelDate={quote.travelDate}
            quote={quote.quote}
          />

          {!showForm && (
            <div className="flex flex-wrap gap-3">
              <Button onClick={() => setShowForm(true)}>Reservar</Button>
              <Link
                to={searchLink}
                className="inline-flex min-h-11 items-center rounded-lg border border-bosque bg-papel px-5 py-2 font-semibold text-bosque hover:bg-celeste-claro"
              >
                Volver a la búsqueda
              </Link>
            </div>
          )}

          {showForm && (
            <section aria-labelledby="booking-title" className="rounded-xl border border-musgo bg-papel p-5 sm:p-6">
              <h2 id="booking-title" className="text-2xl font-bold">
                Datos para la reserva
              </h2>
              <p className="mt-1 text-basalto-suave">
                El pago es simulado: no se cobra dinero real. Solo guardamos el último dígito de la tarjeta.
              </p>

              {problem && (
                <Alert tone="error" className="mt-4">
                  {problem.message}
                  {problem.backToSearch && (
                    <>
                      {' '}
                      <Link to={searchLink} className="font-semibold underline">
                        Elige otra fecha u otro destino
                      </Link>
                      .
                    </>
                  )}
                </Alert>
              )}

              <form onSubmit={handleSubmit} noValidate className="mt-4 space-y-4">
                <TextField
                  ref={nameRef}
                  label="Nombre completo"
                  name="customerName"
                  autoComplete="name"
                  maxLength={100}
                  value={customerName}
                  onChange={(event) => setCustomerName(event.target.value)}
                  error={fieldErrors.customerName}
                  required
                />
                <TextField
                  label="Correo electrónico"
                  hint="Con este correo y tu código podrás consultar la reserva."
                  name="customerEmail"
                  type="email"
                  autoComplete="email"
                  maxLength={254}
                  value={customerEmail}
                  onChange={(event) => setCustomerEmail(event.target.value)}
                  error={fieldErrors.customerEmail}
                  required
                />
                <TextField
                  ref={cardRef}
                  label="Número de tarjeta"
                  hint="De 13 a 19 dígitos. Puedes escribirlo con espacios o guiones."
                  name="cardNumber"
                  inputMode="numeric"
                  autoComplete="cc-number"
                  maxLength={30}
                  value={cardNumber}
                  onChange={(event) => setCardNumber(event.target.value)}
                  error={fieldErrors.cardNumber}
                  required
                />
                <div className="flex flex-wrap gap-3 pt-2">
                  <Button type="submit" loading={submitting} loadingText="Procesando el pago…">
                    Pagar y reservar
                  </Button>
                  <Button variant="ghost" onClick={() => setShowForm(false)} disabled={submitting}>
                    Ocultar formulario
                  </Button>
                </div>
              </form>
            </section>
          )}
        </>
      )}
    </div>
  );
}