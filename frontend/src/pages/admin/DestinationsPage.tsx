// Gestión de destinos (RF-07): listar (CU-08), registrar (CU-07), editar (CU-09) y desactivar (CU-10).
// Las reglas (nombre único, capacidad que no baja de lo ya reservado) las aplica la API; aquí
// se muestran sus mensajes junto al campo que corresponde.

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Loading } from '../../components/Loading';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { TextAreaField, TextField } from '../../components/ui/Field';
import { useAdminSession } from '../../hooks/useAdminSession';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { useFocusOnChange } from '../../hooks/useFocusOnChange';
import {
  createDestination,
  deactivateDestination,
  listDestinations,
  updateDestination,
} from '../../services/admin-api';
import { ApiError, errorMessage } from '../../services/api-client';
import type { AdminDestination, DestinationInput } from '../../services/types';
import { formatColones } from '../../utils/format';
import { destinationFormSchema, toFieldErrors, type FieldErrors } from '../../utils/validation';

// Lo que se escribe en el formulario (todo texto, como en los campos)
interface DestinationDraft {
  name: string;
  place: string;
  description: string;
  basePrice: string;
  dailyCapacity: string;
}

const EMPTY_DRAFT: DestinationDraft = { name: '', place: '', description: '', basePrice: '', dailyCapacity: '' };

// Pasa un destino al formulario. Ejemplo: basePrice '42500.00' → '42500.00'
function toDraft(destination: AdminDestination): DestinationDraft {
  return {
    name: destination.name,
    place: destination.place,
    description: destination.description ?? '',
    basePrice: destination.basePrice,
    dailyCapacity: String(destination.dailyCapacity),
  };
}

// Solo los campos que cambiaron respecto al destino original (CU-09: PATCH parcial)
function changedFields(original: AdminDestination, input: DestinationInput): Partial<DestinationInput> {
  const changes: Partial<DestinationInput> = {};
  if (input.name !== original.name) changes.name = input.name;
  if (input.place !== original.place) changes.place = input.place;
  if (input.description !== original.description) changes.description = input.description;
  if (input.basePrice !== Number(original.basePrice)) changes.basePrice = input.basePrice;
  if (input.dailyCapacity !== original.dailyCapacity) changes.dailyCapacity = input.dailyCapacity;
  return changes;
}

// Modo del formulario: cerrado, registrar uno nuevo o editar uno existente
type FormMode = { kind: 'closed' } | { kind: 'create' } | { kind: 'edit'; destination: AdminDestination };

export function DestinationsPage() {
  useDocumentTitle('Destinos');
  const { send } = useAdminSession();

  const [destinations, setDestinations] = useState<AdminDestination[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [notice, setNotice] = useState('');

  const [mode, setMode] = useState<FormMode>({ kind: 'closed' });
  const [draft, setDraft] = useState<DestinationDraft>(EMPTY_DRAFT);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formProblem, setFormProblem] = useState('');
  const [saving, setSaving] = useState(false);
  const formHeadingRef = useRef<HTMLHeadingElement>(null);
  // Al guardar o desactivar, el foco va al mensaje con el resultado
  const noticeRef = useRef<HTMLDivElement>(null);
  useFocusOnChange(noticeRef, notice);
  // Al cerrar el formulario sin guardar, el foco vuelve al botón "Registrar destino"
  const registerButtonRef = useRef<HTMLButtonElement>(null);

  const [toDeactivate, setToDeactivate] = useState<AdminDestination | null>(null);
  const [deactivating, setDeactivating] = useState(false);
  const [deactivateProblem, setDeactivateProblem] = useState('');

  const load = useCallback(() => {
    setLoadError('');
    listDestinations(send)
      .then(setDestinations)
      .catch((error: unknown) => setLoadError(errorMessage(error)));
  }, [send]);

  useEffect(load, [load]);

  // Al abrir el formulario, el foco va a su título (así el lector de pantalla lo anuncia)
  useEffect(() => {
    if (mode.kind !== 'closed') formHeadingRef.current?.focus();
  }, [mode]);

  function openCreate() {
    setNotice('');
    setDraft(EMPTY_DRAFT);
    setFieldErrors({});
    setFormProblem('');
    setMode({ kind: 'create' });
  }

  function openEdit(destination: AdminDestination) {
    setNotice('');
    setDraft(toDraft(destination));
    setFieldErrors({});
    setFormProblem('');
    setMode({ kind: 'edit', destination });
  }

  function updateDraft(field: keyof DestinationDraft, value: string) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  async function handleSave(event: FormEvent) {
    event.preventDefault();
    if (mode.kind === 'closed') return;
    setFormProblem('');
    const result = destinationFormSchema.safeParse(draft);
    if (!result.success) {
      setFieldErrors(toFieldErrors(result.error));
      return;
    }
    setFieldErrors({});
    const input: DestinationInput = result.data;

    let changes: Partial<DestinationInput> | null = null;
    if (mode.kind === 'edit') {
      changes = changedFields(mode.destination, input);
      if (Object.keys(changes).length === 0) {
        setFormProblem('No hay cambios para guardar.');
        return;
      }
    }

    setSaving(true);
    try {
      if (mode.kind === 'create') {
        const created = await createDestination(send, input);
        setDestinations((current) => (current ? [...current, created] : [created]));
        setNotice(`Destino «${created.name}» registrado. Ya está activo para los turistas.`);
      } else if (changes) {
        const updated = await updateDestination(send, mode.destination.id, changes);
        setDestinations((current) => current?.map((item) => (item.id === updated.id ? updated : item)) ?? null);
        setNotice(`Destino «${updated.name}» actualizado.`);
      }
      setMode({ kind: 'closed' });
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        // CU-07 6a: nombre repetido
        setFieldErrors({ name: error.message });
      } else if (error instanceof ApiError && error.status === 422) {
        // Capacidad menor que lo ya reservado en un día futuro
        setFieldErrors({ dailyCapacity: error.message });
      } else if (error instanceof ApiError && error.status === 400) {
        setFieldErrors({
          name: error.fieldError('name'),
          place: error.fieldError('place'),
          description: error.fieldError('description'),
          basePrice: error.fieldError('basePrice'),
          dailyCapacity: error.fieldError('dailyCapacity'),
        });
        setFormProblem(error.message);
      } else {
        setFormProblem(errorMessage(error));
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDeactivate() {
    if (!toDeactivate) return;
    setDeactivating(true);
    setDeactivateProblem('');
    try {
      const updated = await deactivateDestination(send, toDeactivate.id);
      setDestinations((current) => current?.map((item) => (item.id === updated.id ? updated : item)) ?? null);
      setNotice(`Destino «${updated.name}» desactivado. Ya no se puede reservar; sus reservas se conservan.`);
      setToDeactivate(null);
    } catch (error) {
      setDeactivateProblem(errorMessage(error));
    } finally {
      setDeactivating(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Destinos</h1>
          <p className="text-basalto-suave">Los destinos no se borran: se desactivan.</p>
        </div>
        {mode.kind === 'closed' && (
          <Button ref={registerButtonRef} onClick={openCreate}>
            Registrar destino
          </Button>
        )}
      </div>

      <div ref={noticeRef} tabIndex={-1} className="outline-none">
        {notice && <Alert tone="success">{notice}</Alert>}
      </div>

      {mode.kind !== 'closed' && (
        <section aria-labelledby="destination-form-title" className="rounded-xl border border-musgo bg-papel p-5 sm:p-6">
          <h2 id="destination-form-title" ref={formHeadingRef} tabIndex={-1} className="text-2xl font-bold outline-none">
            {mode.kind === 'create' ? 'Registrar destino' : `Editar «${mode.destination.name}»`}
          </h2>
          {formProblem && (
            <Alert tone="error" className="mt-4">
              {formProblem}
            </Alert>
          )}
          <form onSubmit={handleSave} noValidate className="mt-4 grid gap-4 sm:grid-cols-2">
            <TextField
              label="Nombre"
              name="name"
              maxLength={100}
              value={draft.name}
              onChange={(event) => updateDraft('name', event.target.value)}
              error={fieldErrors.name}
              required
            />
            <TextField
              label="Lugar"
              hint="Provincia o zona, por ejemplo: La Fortuna, Alajuela"
              name="place"
              maxLength={150}
              value={draft.place}
              onChange={(event) => updateDraft('place', event.target.value)}
              error={fieldErrors.place}
              required
            />
            <TextField
              label="Precio por persona (colones, sin IVA)"
              name="basePrice"
              inputMode="decimal"
              value={draft.basePrice}
              onChange={(event) => updateDraft('basePrice', event.target.value)}
              error={fieldErrors.basePrice}
              required
            />
            <TextField
              label="Capacidad máxima diaria (personas)"
              name="dailyCapacity"
              inputMode="numeric"
              value={draft.dailyCapacity}
              onChange={(event) => updateDraft('dailyCapacity', event.target.value)}
              error={fieldErrors.dailyCapacity}
              required
            />
            <div className="sm:col-span-2">
              <TextAreaField
                label="Descripción"
                optional
                name="description"
                rows={3}
                maxLength={1000}
                value={draft.description}
                onChange={(event) => updateDraft('description', event.target.value)}
                error={fieldErrors.description}
              />
            </div>
            <div className="flex flex-wrap gap-3 sm:col-span-2">
              <Button type="submit" loading={saving} loadingText="Guardando…">
                {mode.kind === 'create' ? 'Registrar destino' : 'Guardar cambios'}
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setMode({ kind: 'closed' });
                  // Después de que el botón vuelva a aparecer en pantalla
                  requestAnimationFrame(() => registerButtonRef.current?.focus());
                }}
                disabled={saving}
              >
                Cancelar
              </Button>
            </div>
          </form>
        </section>
      )}

      {loadError && (
        <Alert tone="error">
          {loadError}{' '}
          <button type="button" onClick={load} className="font-semibold underline">
            Intentar de nuevo
          </button>
        </Alert>
      )}
      {destinations === null && !loadError && <Loading text="Cargando destinos…" />}
      {destinations?.length === 0 && (
        <p className="rounded-xl border border-musgo bg-papel px-5 py-6">Todavía no hay destinos registrados.</p>
      )}

      {destinations && destinations.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-musgo bg-papel">
          <table className="w-full min-w-[44rem] text-left">
            <caption className="sr-only">Destinos registrados</caption>
            <thead className="border-b border-musgo bg-neblina">
              <tr>
                <th scope="col" className="px-4 py-3">Nombre</th>
                <th scope="col" className="px-4 py-3">Lugar</th>
                <th scope="col" className="px-4 py-3 text-right">Precio por persona</th>
                <th scope="col" className="px-4 py-3 text-right">Capacidad diaria</th>
                <th scope="col" className="px-4 py-3">Estado</th>
                <th scope="col" className="px-4 py-3">
                  <span className="sr-only">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-musgo">
              {destinations.map((destination) => (
                <tr key={destination.id}>
                  <th scope="row" className="px-4 py-3 font-semibold">{destination.name}</th>
                  <td className="px-4 py-3">{destination.place}</td>
                  <td className="px-4 py-3 text-right">{formatColones(destination.basePrice)}</td>
                  <td className="px-4 py-3 text-right">{destination.dailyCapacity}</td>
                  <td className="px-4 py-3">
                    <span className={destination.active ? 'font-semibold text-exito' : 'font-semibold text-basalto-suave'}>
                      {destination.active ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <Button variant="secondary" className="min-h-9 px-3 py-1" onClick={() => openEdit(destination)}>
                        Editar<span className="sr-only"> {destination.name}</span>
                      </Button>
                      {destination.active && (
                        <Button
                          variant="ghost"
                          className="min-h-9 px-3 py-1 text-error"
                          onClick={() => {
                            setDeactivateProblem('');
                            setToDeactivate(destination);
                          }}
                        >
                          Desactivar<span className="sr-only"> {destination.name}</span>
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* CU-10 pasos 5 y 6: confirmar antes de desactivar */}
      <ConfirmDialog
        open={toDeactivate !== null}
        title={toDeactivate ? `¿Desactivar «${toDeactivate.name}»?` : 'Desactivar destino'}
        confirmText="Sí, desactivar"
        confirmVariant="danger"
        loading={deactivating}
        loadingText="Desactivando…"
        onConfirm={handleDeactivate}
        onCancel={() => setToDeactivate(null)}
      >
        {deactivateProblem && <Alert tone="error">{deactivateProblem}</Alert>}
        <p>
          Los turistas dejarán de verlo y no se podrá reservar. Las reservas que ya tiene se conservan y se pueden
          consultar y cancelar. Por ahora no hay forma de volver a activarlo.
        </p>
      </ConfirmDialog>
    </div>
  );
}