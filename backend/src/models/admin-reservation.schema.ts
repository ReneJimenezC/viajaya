// Plantillas (zod) de las rutas de reservas del administrador (RF-08, CU-12 a CU-14).

import { z } from 'zod';
import { ADMIN_REASON_MAX_LENGTH } from './admin-action.entity';
import { PAYMENT_STATES } from './payment.entity';

// Motivo de una acción del admin (V10): sin espacios a los lados, de 1 a 500 caracteres.
// Se exporta porque el cambio de pago (8.F) y la reagenda (8.G) lo usarán como OBLIGATORIO.
// Ejemplo: "  Cliente confirmó por teléfono " → "Cliente confirmó por teléfono"; "   " → error
export const reasonField = z
  .string({ error: 'El motivo debe ser un texto' })
  .trim()
  .min(1, { error: 'El motivo no puede estar vacío' })
  .max(ADMIN_REASON_MAX_LENGTH, {
    error: `El motivo no puede tener más de ${ADMIN_REASON_MAX_LENGTH} caracteres`,
  });

// Body de aprobar, cancelar y eliminar (V26): todo opcional. Si la petición llega SIN body
// (Express 5 deja req.body en undefined), se toma como {} para no responder 400 por eso.
// Ejemplos válidos: {}, { "reason": "Cliente confirmó por teléfono" }, o ningún body.
export const adminActionSchema = z.preprocess(
  // ?? = "si es undefined o null, usa {}" (como Optional.ofNullable(body).orElse(Map.of()))
  (body) => body ?? {},
  z.object(
    { reason: reasonField.optional() },
    { error: 'El cuerpo de la petición debe ser un objeto JSON' },
  ),
);

// Tipo que sale de la plantilla: { reason?: string }
export type AdminActionInput = z.infer<typeof adminActionSchema>;

// NUEVO (8.F): body de PATCH /admin/pagos/:id (CU-15, V30, V31). El estado se escribe EXACTO,
// como en la base (CU-15 paso 5). Al rechazar, el motivo es OBLIGATORIO (N-1).
// Ejemplos válidos: { "status": "Aprobado" }, { "status": "Rechazado", "reason": "No llegó el pago" }
export const changePaymentStatusSchema = z
  .object(
    {
      // z.enum = solo uno de esos textos (CU-15 6a: "estado no válido" → 400)
      status: z.enum(PAYMENT_STATES, { error: 'El estado debe ser Pendiente, Aprobado o Rechazado' }),
      reason: reasonField.optional(),
    },
    { error: 'El cuerpo de la petición debe ser un objeto JSON' },
  )
  // superRefine = una regla que mira VARIOS campos a la vez (como un validador de clase en Java)
  .superRefine((body, ctx) => {
    if (body.status === 'Rechazado' && body.reason === undefined) {
      ctx.addIssue({ code: 'custom', path: ['reason'], message: 'El motivo es obligatorio para rechazar un pago' });
    }
  });

// Tipo que sale de la plantilla: { status: 'Pendiente' | 'Aprobado' | 'Rechazado'; reason?: string }
export type ChangePaymentStatusInput = z.infer<typeof changePaymentStatusSchema>;