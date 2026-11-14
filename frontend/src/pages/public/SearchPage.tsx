// Búsqueda de destinos (RF-01, CU-01). Primera página del sitio.
// - Al entrar se listan los destinos activos (CU-01 paso 2).
// - Con fecha y personas, la API agrega los cupos libres de cada destino ese día (pasos 3 a 6).
// - Los filtros viven en la URL (?lugar&fecha&personas): al volver atrás desde la cotización
//   la búsqueda sigue ahí. Aquí no hay datos sensibles (no es código ni correo).
// Aspecto: estética propuesta por el equipo (11/11): portada azul con paisaje, tarjetas con
// dibujo, pasos para reservar y consulta rápida. El funcionamiento de la búsqueda no cambia.
// - "¿Ya tienes una reserva?" lleva el código y el correo a Mi reserva por el estado de la
//   navegación (nunca por la URL, N-4); Mi reserva los borra del historial al leerlos.

import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { DestinationArt, artKindFor } from '../../components/DestinationArt';
import { HeroArt, HeroHills } from '../../components/HeroArt';
import { Loading } from '../../components/Loading';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { TextField } from '../../components/ui/Field';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { ApiError, errorMessage } from '../../services/api-client';
import { searchDestinations, type DestinationSearch } from '../../services/public-api';
import type { PublicDestination } from '../../services/types';
import { firstTravelDate, formatColones, formatTravelDate, isCalendarDate } from '../../utils/format';
import { lookupFormSchema, searchFormSchema, toFieldErrors, type FieldErrors } from '../../utils/validation';

// Lee los filtros de la URL. Ejemplo: "?fecha=2026-12-10&personas=2" → { fecha, personas: 2 }.
// Un valor mal escrito en la URL (enlace cortado, "?fecha=x") se ignora en vez de romper la página.
function searchFromParams(params: URLSearchParams): DestinationSearch {
  const lugar = params.get('lugar') ?? undefined;
  const fechaText = params.get('fecha');
  const fecha = fechaText && isCalendarDate(fechaText) ? fechaText : undefined;
  const personasText = params.get('personas');
  const personas = personasText && /^[1-9]\d{0,3}$/.test(personasText) ? Number(personasText) : undefined;
  return { lugar: lugar || undefined, fecha, personas };
}

export function SearchPage() {
  useDocumentTitle('Buscar excursiones');
  const [params, setParams] = useSearchParams();
  const search = searchFromParams(params);
  // La búsqueda trae disponibilidad solo si la URL tiene fecha y personas
  const withAvailability = search.fecha !== undefined && search.personas !== undefined;

  // Lo que la persona escribe en el formulario (texto, como en los campos)
  const [lugar, setLugar] = useState(search.lugar ?? '');
  const [fecha, setFecha] = useState(search.fecha ?? '');
  const [personas, setPersonas] = useState(search.personas !== undefined ? String(search.personas) : '');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const [destinations, setDestinations] = useState<PublicDestination[] | null>(null);
  const [loadError, setLoadError] = useState('');

  // Consulta a la API cada vez que cambian los filtros de la URL.
  // AbortController cancela la petición anterior si la persona busca otra vez antes de que llegue.
  const paramsKey = params.toString();
  useEffect(() => {
    const controller = new AbortController();
    const current = searchFromParams(new URLSearchParams(paramsKey));
    // Si la URL cambió por "atrás"/"adelante" del navegador, el formulario la refleja
    setLugar(current.lugar ?? '');
    setFecha(current.fecha ?? '');
    setPersonas(current.personas !== undefined ? String(current.personas) : '');
    setDestinations(null);
    setLoadError('');
    searchDestinations(current, controller.signal)
      .then(setDestinations)
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        // La API también valida (por ejemplo, una fecha de hoy escrita a mano en la URL)
        if (error instanceof ApiError && error.status === 400) {
          setFieldErrors({ fecha: error.fieldError('fecha'), personas: error.fieldError('personas') });
        }
        setLoadError(errorMessage(error));
      });
    return () => controller.abort();
  }, [paramsKey]);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const result = searchFormSchema.safeParse({ lugar, fecha, personas });
    if (!result.success) {
      setFieldErrors(toFieldErrors(result.error));
      return;
    }
    setFieldErrors({});
    const next = new URLSearchParams();
    if (result.data.lugar) next.set('lugar', result.data.lugar);
    next.set('fecha', result.data.fecha);
    next.set('personas', String(result.data.personas));
    setParams(next);
  }

  return (
    <>
      {/* Portada: degradado azul, paisaje (completo solo en pantallas grandes) y el buscador
          encima del borde inferior */}
      <section
        aria-labelledby="search-title"
        className="relative overflow-hidden bg-gradient-to-br from-marino via-marino to-bosque-oscuro text-white"
      >
        <HeroArt className="absolute inset-y-0 right-0 hidden h-full w-3/4 opacity-90 lg:block" />
        <HeroHills className="absolute inset-x-0 bottom-0 h-20 w-full lg:hidden" />
        <div className="relative mx-auto max-w-6xl px-4 pt-12 pb-32 sm:pt-16">
          <p className="inline-block rounded-full bg-white/15 px-3 py-1 text-sm font-semibold text-celeste-claro">
            Excursiones en Costa Rica
          </p>
          <h1 id="search-title" className="mt-4 max-w-xl text-4xl font-bold sm:text-5xl">
            Reserva tu próxima aventura en minutos
          </h1>
          <p className="mt-4 max-w-md text-lg text-celeste-claro">
            Elige la fecha y cuántas personas viajan: te mostramos los cupos libres de cada destino ese día.
          </p>
        </div>
      </section>

      <div className="relative mx-auto -mt-20 max-w-6xl px-4">
        <form
          onSubmit={handleSubmit}
          noValidate
          aria-label="Buscar excursión"
          className="grid gap-4 rounded-2xl bg-papel p-5 shadow-lg shadow-marino/15 sm:grid-cols-2 sm:p-6 lg:grid-cols-[2fr_1.4fr_1fr_auto] lg:items-start"
        >
          {/* Pedido del tester (13/11): "Lugar" solo no decía qué escribir. La API busca el texto
              dentro del lugar del destino ("La Fortuna, Alajuela"), así que sirve un pueblo,
              una zona o una provincia. La ayuda va visible (no solo como placeholder, que se borra
              al escribir) y los lectores de pantalla la leen con el campo (WCAG 3.3.2).
              Los 3 campos llevan una ayuda de una línea para que queden alineados. */}
          <TextField
            label="Lugar o provincia"
            optional
            hint="Pueblo, zona o provincia. Ej.: Puntarenas"
            name="lugar"
            value={lugar}
            onChange={(event) => setLugar(event.target.value)}
            maxLength={150}
            error={fieldErrors.lugar}
          />
          <TextField
            label="Fecha del viaje"
            hint="A partir de mañana"
            name="fecha"
            type="date"
            min={firstTravelDate()}
            value={fecha}
            onChange={(event) => setFecha(event.target.value)}
            error={fieldErrors.fecha}
            required
          />
          <TextField
            label="Personas"
            hint="Cuántas viajan"
            name="personas"
            type="number"
            inputMode="numeric"
            min={1}
            max={9999}
            step={1}
            value={personas}
            onChange={(event) => setPersonas(event.target.value)}
            error={fieldErrors.personas}
            required
          />
          <Button type="submit" className="sm:mt-12">
            Ver cupos
          </Button>
        </form>
      </div>

      <div className="mx-auto max-w-6xl space-y-16 px-4 py-12">
        <section aria-labelledby="results-title" aria-busy={destinations === null && !loadError}>
          <h2 id="results-title" className="text-3xl font-bold">
            {withAvailability && search.fecha
              ? `Destinos para el ${formatTravelDate(search.fecha)}, ${search.personas} ${search.personas === 1 ? 'persona' : 'personas'}`
              : 'Destinos disponibles'}
          </h2>
          <p className="mt-2 max-w-2xl text-basalto-suave">Precio por persona; el IVA (13 %) se suma al cotizar.</p>

          {loadError && (
            <Alert tone="error" className="mt-4">
              {loadError}
            </Alert>
          )}
          {destinations === null && !loadError && <Loading text="Buscando destinos…" />}

          {destinations?.length === 0 && (
            <p className="mt-4 rounded-xl border border-musgo bg-papel px-5 py-6">
              {search.lugar
                ? `Ningún destino activo coincide con «${search.lugar}». Prueba con otro lugar o deja el campo vacío.`
                : 'Por ahora no hay destinos disponibles.'}
            </p>
          )}

          {/* Anuncia a los lectores de pantalla que llegaron los resultados */}
          {destinations && destinations.length > 0 && (
            <p role="status" className="mt-4 font-semibold">
              {destinations.length} {destinations.length === 1 ? 'destino encontrado' : 'destinos encontrados'}
            </p>
          )}

          {destinations && destinations.length > 0 && (
            <ul className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {destinations.map((destination) => (
                <DestinationCard key={destination.id} destination={destination} search={search} />
              ))}
            </ul>
          )}
        </section>

        <HowItWorks />
        <ReservationShortcut />
      </div>
    </>
  );
}

// Una tarjeta del resultado: dibujo, datos del destino, precio y cupos (si se buscó con fecha y personas)
function DestinationCard({ destination, search }: { destination: PublicDestination; search: DestinationSearch }) {
  const hasAvailability = destination.available !== undefined && destination.availableSeats !== undefined;
  const quoteLink =
    hasAvailability && destination.available && search.fecha && search.personas !== undefined
      ? `/cotizar?${new URLSearchParams({
          destino: String(destination.id),
          fecha: search.fecha,
          personas: String(search.personas),
        }).toString()}`
      : null;

  return (
    <li className="dest-card flex flex-col overflow-hidden rounded-2xl border border-musgo bg-papel shadow-sm">
      <div className="relative h-36">
        <DestinationArt kind={artKindFor(destination)} />
        {/* Etiqueta sobre el dibujo con los lugares libres (el detalle también va abajo en texto) */}
        {hasAvailability && (
          <p
            aria-hidden="true"
            className="absolute top-3 left-3 inline-flex items-center gap-1.5 rounded-full bg-papel px-3 py-1 text-sm font-semibold"
          >
            <span className={`h-2 w-2 rounded-full ${destination.available ? 'bg-exito' : 'bg-error'}`} />
            {destination.available
              ? `${destination.availableSeats} ${destination.availableSeats === 1 ? 'lugar libre' : 'lugares libres'}`
              : destination.availableSeats === 0
                ? 'Lleno ese día'
                : 'Sin cupo suficiente'}
          </p>
        )}
      </div>

      <div className="flex flex-1 flex-col p-5">
        <h3 className="text-xl font-bold">{destination.name}</h3>
        <p className="text-basalto-suave">{destination.place}</p>
        {destination.description && <p className="mt-2">{destination.description}</p>}

        <div className="mt-auto space-y-3 pt-5">
          <p>
            <span className="font-display text-2xl font-bold">{formatColones(destination.basePrice)}</span>{' '}
            <span className="text-sm text-basalto-suave">por persona, sin IVA</span>
          </p>
          {!hasAvailability && <p className="text-sm text-basalto-suave">Indica fecha y personas para ver los cupos.</p>}
          {hasAvailability && destination.available && (
            <p className="font-semibold text-exito">
              Hay cupo: {destination.availableSeats} {destination.availableSeats === 1 ? 'lugar libre' : 'lugares libres'}
            </p>
          )}
          {hasAvailability && !destination.available && (
            <p className="font-semibold text-error">
              No hay cupo suficiente: {destination.availableSeats === 0
                ? 'no quedan lugares ese día'
                : `quedan ${destination.availableSeats} ${destination.availableSeats === 1 ? 'lugar' : 'lugares'}`}
            </p>
          )}
          {quoteLink && (
            <Link
              to={quoteLink}
              className="inline-flex min-h-11 items-center justify-center rounded-lg bg-bosque px-5 py-2 font-semibold text-white hover:bg-bosque-oscuro"
            >
              Cotizar {destination.name}
            </Link>
          )}
        </div>
      </div>
    </li>
  );
}

// Los 3 pasos para reservar (son una secuencia real: por eso van numerados)
function HowItWorks() {
  const steps = [
    {
      title: 'Busca y cotiza',
      text: 'Elige fecha y personas, y mira los cupos de cada destino. Ves el desglose del costo con IVA antes de confirmar.',
    },
    {
      title: 'Paga en línea',
      text: 'Completa tus datos y la tarjeta. Recibes tu código de confirmación al instante.',
    },
    {
      title: 'Administra tu viaje',
      text: 'Con tu código y tu correo cambias la fecha o cancelas hasta 48 horas antes del viaje.',
    },
  ];
  return (
    <section aria-labelledby="steps-title">
      <h2 id="steps-title" className="text-3xl font-bold">
        Reservar es así de fácil
      </h2>
      <ol className="mt-6 grid gap-4 md:grid-cols-3">
        {steps.map((step, index) => (
          <li key={step.title} className="flex gap-4 rounded-2xl border border-musgo bg-papel p-5">
            <span
              aria-hidden="true"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-celeste-claro font-display text-lg font-bold text-bosque"
            >
              {index + 1}
            </span>
            <div>
              <h3 className="text-lg font-bold">{step.title}</h3>
              <p className="mt-1 text-basalto-suave">{step.text}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

// "¿Ya tienes una reserva?": valida aquí y pasa los datos a Mi reserva sin ponerlos en la URL (N-4)
function ReservationShortcut() {
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [email, setEmail] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const result = lookupFormSchema.safeParse({ code, customerEmail: email });
    if (!result.success) {
      setErrors(toFieldErrors(result.error));
      return;
    }
    navigate('/mi-reserva', { state: { lookup: result.data } });
  }

  return (
    <section
      aria-labelledby="shortcut-title"
      className="grid gap-6 rounded-2xl bg-marino p-6 text-white sm:p-8 lg:grid-cols-[1fr_1.4fr] lg:items-center"
    >
      <div>
        <h2 id="shortcut-title" className="text-3xl font-bold">
          ¿Ya tienes una reserva?
        </h2>
        <p className="mt-2 text-celeste-claro">
          Consúltala, cambia la fecha o cancélala con tu código y el correo con el que reservaste.
        </p>
      </div>
      <form
        onSubmit={handleSubmit}
        noValidate
        aria-label="Consultar mi reserva"
        className="grid gap-4 rounded-xl bg-papel p-5 text-basalto sm:grid-cols-[1fr_1fr_auto] sm:items-start"
      >
        <TextField
          label="Código de reserva"
          name="code"
          placeholder="VY-F57NXNW9"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={20}
          value={code}
          onChange={(event) => setCode(event.target.value)}
          error={errors.code}
          required
        />
        <TextField
          label="Correo electrónico"
          name="customerEmail"
          type="email"
          autoComplete="email"
          maxLength={254}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          error={errors.customerEmail}
          required
        />
        <Button type="submit" className="sm:mt-7">
          Consultar
        </Button>
      </form>
    </section>
  );
}