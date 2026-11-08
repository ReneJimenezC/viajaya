// Pruebas unitarias de la gestión de reservas del admin (RF-08, CU-11 a CU-14): la plantilla
// del body y el servicio AdminReservationService. No usan base de datos: la transacción y los
// repositorios se reemplazan por versiones falsas en memoria (mismo patrón que reservation.test.ts).

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { AppError } from '../errors/app-error';
import { adminActionSchema, adminRescheduleSchema, changePaymentStatusSchema } from '../models/admin-reservation.schema';
import type { Destination } from '../models/destination.entity';
import type { PaymentStatus } from '../models/payment.entity';
import type { NewAdminAction } from '../repositories/admin-action.repository';
import type { AdminReservationDetails } from '../repositories/reservation.repository';
import { AdminReservationService, type AdminRunInTransaction } from '../services/admin-reservation.service';

const CREATED_AT = new Date('2026-11-04T03:00:01Z');
// NUEVO (8.C-8.E): 12:00 del 08/11/2026 en Costa Rica (18:00 UTC)
const NOW = new Date('2026-11-08T18:00:00Z');
// Admin que hace las acciones (como req.admin.id)
const ADMIN_ID = 3;
// NUEVO (8.G): destinos falsos (Tortuguero activo, capacidad 20; Irazú desactivado)
const TORTUGUERO = {
  id: 4, name: 'Tortuguero', description: null, place: 'Tortuguero, Limón',
  basePrice: '47500.00', dailyCapacity: 20, active: true,
} as Destination;
const IRAZU = { ...TORTUGUERO, id: 14, name: 'Volcán Irazú', active: false } as Destination;

// Reserva de Ana tal como la devuelve el repositorio (findAllForAdmin)
const ANA: AdminReservationDetails = {
  id: 1,
  code: 'VY-F57NXNW9',
  status: 'Pendiente',
  destination: { id: 4, name: 'Tortuguero', place: 'Tortuguero, Limón' },
  travelDate: '2026-12-10',
  customerName: 'Ana Mora',
  customerEmail: 'ana@correo.com',
  people: 2,
  basePrice: '47500.00',
  subtotal: '95000.00',
  iva: '12350.00',
  total: '107350.00',
  payment: { status: 'Aprobado', cardLastDigit: 2 },
  // NUEVO (8.F, V29): id del pago más reciente
  paymentId: 7,
  reschedules: 2,
  createdAt: CREATED_AT,
};
// Reserva cancelada de Carla (V15: las canceladas también se listan)
const CARLA: AdminReservationDetails = {
  ...ANA,
  id: 2,
  code: 'VY-N7WYTNPA',
  status: 'Cancelada',
  travelDate: '2026-12-08',
  customerName: 'Carla Rojas',
  customerEmail: 'carla@correo.com',
  paymentId: 8,
  reschedules: 0,
};
// NUEVO (8.C-8.E): Luis ya aprobada; Pedro viaja en 36 h (RN-02); Marta con el pago pendiente
// CAMBIO (8.F): cada una con su propio pago (paymentId)
const LUIS: AdminReservationDetails = { ...ANA, id: 3, code: 'VY-LUIS2345', status: 'Aprobada', customerName: 'Luis Pérez', paymentId: 9 };
const PEDRO: AdminReservationDetails = { ...ANA, id: 4, code: 'VY-PEDR2345', travelDate: '2026-11-10', customerName: 'Pedro Solís', paymentId: 10 };
const MARTA: AdminReservationDetails = {
  ...ANA,
  id: 5,
  code: 'VY-MART2345',
  customerName: 'Marta Vega',
  payment: { status: 'Pendiente', cardLastDigit: 2 },
  paymentId: 11,
};

// Lo que el servicio hizo con la "base" falsa
// CAMBIO (8.C-8.E): se agregan los bloqueos, los cambios de estado y el historial
interface Recorder {
  transactions: number;
  lockedIds: number[];
  approvedIds: number[];
  cancelledIds: number[];
  deletedIds: number[];
  actions: NewAdminAction[];
  // NUEVO (8.F): pagos cambiados por updatePaymentStatus
  paymentUpdates: { paymentId: number; status: PaymentStatus }[];
  // NUEVO (8.G): destinos bloqueados y fechas cambiadas por updateTravelDate
  lockedDestinationIds: number[];
  updatedDates: { id: number; travelDate: string }[];
}

// Arma un AdminReservationService con piezas falsas.
// - stored: reservas guardadas, ya en el orden de la base (V16). Se COPIAN: así una prueba no
//   cambia los datos de otra. Las "eliminadas" (markDeleted) dejan de aparecer, como en la base.
// - oldPayments: NUEVO (8.F) intentos de pago ANTERIORES de una reserva (no son el más reciente, V32)
// - reservedInTortuguero: NUEVO (8.G) personas ya reservadas en Tortuguero en la fecha NUEVA
function buildService(
  options: {
    stored?: AdminReservationDetails[];
    oldPayments?: { paymentId: number; reservationId: number }[];
    reservedInTortuguero?: number;
  } = {},
) {
  const { stored = [], oldPayments = [], reservedInTortuguero = 0 } = options;
  const recorder: Recorder = {
    transactions: 0, lockedIds: [], approvedIds: [], cancelledIds: [], deletedIds: [], actions: [], paymentUpdates: [],
    lockedDestinationIds: [], updatedDates: [],
  };
  const destinationsById = new Map([[TORTUGUERO.id, TORTUGUERO], [IRAZU.id, IRAZU]]);
  const rows = stored.map((r) => ({ ...r, payment: { ...r.payment } }));
  const deleted = new Set<number>();
  const visible = () => rows.filter((r) => !deleted.has(r.id));
  const byId = (id: number) => visible().find((r) => r.id === id);
  const setStatus = (id: number, status: AdminReservationDetails['status']) => {
    const row = rows.find((r) => r.id === id);
    if (row) row.status = status;
  };

  const runInTransaction: AdminRunInTransaction = async (work) => {
    recorder.transactions++;
    return work({
      reservations: {
        findAllForAdmin: async () => visible().map((r) => ({ ...r })),
        findByIdForUpdate: async (id) => {
          recorder.lockedIds.push(id);
          const row = byId(id);
          // CAMBIO (8.G): también el destino y las personas
          return row
            ? {
                id: row.id, status: row.status, travelDate: row.travelDate, paymentStatus: row.payment.status,
                destinationId: row.destination.id, people: row.people,
              }
            : null;
        },
        findDetailsById: async (id) => {
          const row = byId(id);
          return row ? { ...row } : null;
        },
        approveReservation: async (id) => {
          recorder.approvedIds.push(id);
          setStatus(id, 'Aprobada');
        },
        cancelReservation: async (id) => {
          recorder.cancelledIds.push(id);
          setStatus(id, 'Cancelada');
        },
        markDeleted: async (id) => {
          recorder.deletedIds.push(id);
          deleted.add(id);
        },
        // NUEVO (8.F): el pago más reciente está en la reserva (paymentId); los anteriores, aparte
        findPaymentForUpdate: async (paymentId) => {
          const latest = visible().find((r) => r.paymentId === paymentId);
          if (latest) {
            recorder.lockedIds.push(latest.id);
            return {
              paymentId, paymentStatus: latest.payment.status,
              reservationId: latest.id, reservationStatus: latest.status, isLatest: true,
            };
          }
          const old = oldPayments.find((p) => p.paymentId === paymentId);
          const owner = old ? byId(old.reservationId) : undefined;
          return old && owner
            ? { paymentId, paymentStatus: 'Rechazado', reservationId: owner.id, reservationStatus: owner.status, isLatest: false }
            : null;
        },
        updatePaymentStatus: async (paymentId, status) => {
          recorder.paymentUpdates.push({ paymentId, status });
          const row = rows.find((r) => r.paymentId === paymentId);
          if (row) row.payment.status = status;
        },
        // NUEVO (8.G): cambia la fecha y suma una reagenda, como la base
        updateTravelDate: async (id, travelDate) => {
          recorder.updatedDates.push({ id, travelDate });
          const row = rows.find((r) => r.id === id);
          if (row) {
            row.travelDate = travelDate;
            row.reschedules++;
          }
        },
      },
      // NUEVO (8.G)
      destinations: {
        findByIdForUpdate: async (id) => {
          recorder.lockedDestinationIds.push(id);
          return destinationsById.get(id) ?? null;
        },
        reservedPeopleOn: async (_date, ids) =>
          new Map(ids.includes(TORTUGUERO.id) ? [[TORTUGUERO.id, reservedInTortuguero]] : []),
      },
      adminActions: {
        record: async (data) => {
          recorder.actions.push(data);
        },
      },
    });
  };
  return { service: new AdminReservationService(runInTransaction), recorder };
}

// Comprueba que una promesa falla con un AppError de ese código HTTP y ese mensaje
async function assertAppError(promise: Promise<unknown>, status: number, message: string): Promise<void> {
  await assert.rejects(promise, (error: unknown) => {
    assert.ok(error instanceof AppError);
    assert.equal(error.status, status);
    assert.equal(error.message, message);
    return true;
  });
}

describe('AdminReservationService.list (CU-11)', () => {
  test('cada reserva con la forma del turista + id y reschedules (V17), en el orden de la base', async () => {
    const { service, recorder } = buildService({ stored: [ANA, CARLA] });
    const result = await service.list();

    assert.equal(result.length, 2);
    assert.deepEqual(result[0], {
      id: 1,
      code: 'VY-F57NXNW9',
      status: 'Pendiente',
      destination: { id: 4, name: 'Tortuguero', place: 'Tortuguero, Limón' },
      travelDate: '2026-12-10',
      customerName: 'Ana Mora',
      customerEmail: 'ana@correo.com',
      quote: { basePrice: '47500.00', people: 2, subtotal: '95000.00', iva: '12350.00', total: '107350.00' },
      // CAMBIO (8.F, V29): el pago del admin lleva su id
      payment: { id: 7, status: 'Aprobado', cardLastDigit: 2 },
      createdAt: CREATED_AT,
      reschedules: 2,
    });
    // V15: la cancelada también aparece, con su estado
    assert.equal(result[1]?.code, 'VY-N7WYTNPA');
    assert.equal(result[1]?.status, 'Cancelada');
    assert.equal(recorder.transactions, 1);
  });

  test('CU-11 muestra código, destino, fecha, personas, correo y estados de reserva y pago', async () => {
    const { service } = buildService({ stored: [ANA] });
    const [row] = await service.list();

    assert.ok(row);
    assert.equal(row.code, 'VY-F57NXNW9');
    assert.equal(row.destination.name, 'Tortuguero');
    assert.equal(row.travelDate, '2026-12-10');
    assert.equal(row.quote.people, 2);
    assert.equal(row.customerEmail, 'ana@correo.com');
    assert.equal(row.status, 'Pendiente');
    assert.equal(row.payment.status, 'Aprobado');
  });

  test('el id va primero y no se agregan campos de más (los planos people, basePrice... quedan en quote)', async () => {
    const { service } = buildService({ stored: [ANA] });
    const [row] = await service.list();

    assert.deepEqual(Object.keys(row ?? {}), [
      'id', 'code', 'status', 'destination', 'travelDate', 'customerName', 'customerEmail',
      'quote', 'payment', 'createdAt', 'reschedules',
    ]);
    // NUEVO (8.F, V29): el id del pago va primero dentro de "payment"; paymentId no sale suelto
    assert.deepEqual(Object.keys(row?.payment ?? {}), ['id', 'status', 'cardLastDigit']);
  });

  test('sin reservas (CU-11 4a) → lista vacía, no un error (V18)', async () => {
    const { service } = buildService();
    assert.deepEqual(await service.list(), []);
  });
});

// NUEVO (8.C-8.E)
describe('adminActionSchema (body de aprobar, cancelar y eliminar)', () => {
  test('sin body, vacío o con motivo → válido; el motivo sin espacios a los lados (V26)', () => {
    assert.deepEqual(adminActionSchema.parse(undefined), {});
    assert.deepEqual(adminActionSchema.parse({}), {});
    assert.deepEqual(adminActionSchema.parse({ reason: '  Cliente confirmó  ', extra: 1 }), {
      reason: 'Cliente confirmó',
    });
    assert.equal(adminActionSchema.parse({ reason: 'x'.repeat(500) }).reason?.length, 500);
  });

  test('motivo vacío, de solo espacios, de más de 500 o que no es texto → error en reason (V10)', () => {
    for (const reason of ['', '   ', 'x'.repeat(501), 12]) {
      const result = adminActionSchema.safeParse({ reason });
      assert.equal(result.success, false);
      assert.equal(result.error?.issues[0]?.path.join('.'), 'reason');
    }
  });

  test('body que no es un objeto (un arreglo o un texto) → error', () => {
    assert.equal(adminActionSchema.safeParse([]).success, false);
    assert.equal(adminActionSchema.safeParse('aprobar').success, false);
  });
});

describe('AdminReservationService.approve (CU-12)', () => {
  test('pendiente con pago aprobado → Aprobada, bloqueada y anotada en el historial', async () => {
    const { service, recorder } = buildService({ stored: [ANA] });
    const result = await service.approve(1, ADMIN_ID, {});

    assert.equal(result.status, 'Aprobada');
    assert.equal(result.id, 1);
    assert.equal(result.code, 'VY-F57NXNW9');
    assert.deepEqual(recorder.lockedIds, [1]);
    assert.deepEqual(recorder.approvedIds, [1]);
    assert.deepEqual(recorder.actions, [
      { reservationId: 1, adminId: ADMIN_ID, action: 'aprobar', reason: null, previousDate: null, newDate: null },
    ]);
  });

  test('con motivo → el motivo queda en el historial (V26)', async () => {
    const { service, recorder } = buildService({ stored: [ANA] });
    await service.approve(1, ADMIN_ID, { reason: 'Cliente confirmó por teléfono' });

    assert.equal(recorder.actions[0]?.reason, 'Cliente confirmó por teléfono');
  });

  test('ya aprobada o cancelada (CU-12 2a, V21) → 409 "ya fue procesada" y no cambia nada', async () => {
    for (const reservation of [LUIS, CARLA]) {
      const { service, recorder } = buildService({ stored: [reservation] });
      await assertAppError(service.approve(reservation.id, ADMIN_ID, {}), 409, 'La reserva ya fue procesada');
      assert.equal(recorder.approvedIds.length, 0);
      assert.equal(recorder.actions.length, 0);
    }
  });

  test('pago pendiente o rechazado (V22) → 409 "pago no aprobado" y no cambia nada', async () => {
    const rejected: AdminReservationDetails = { ...MARTA, payment: { status: 'Rechazado', cardLastDigit: 7 } };
    for (const reservation of [MARTA, rejected]) {
      const { service, recorder } = buildService({ stored: [reservation] });
      await assertAppError(
        service.approve(reservation.id, ADMIN_ID, {}),
        409,
        'El pago de la reserva no está aprobado',
      );
      assert.equal(recorder.approvedIds.length, 0);
      assert.equal(recorder.actions.length, 0);
    }
  });

  test('inexistente (CU-12 2a, V20) → 404', async () => {
    const { service } = buildService({ stored: [ANA] });
    await assertAppError(service.approve(99, ADMIN_ID, {}), 404, 'La reserva no existe');
  });
});

describe('AdminReservationService.cancel (CU-13)', () => {
  test('pendiente con más de 48 h → Cancelada, en el historial con su motivo; el pago no cambia', async () => {
    const { service, recorder } = buildService({ stored: [ANA] });
    const result = await service.cancel(1, ADMIN_ID, { reason: 'Pedido del cliente' }, NOW);

    assert.equal(result.status, 'Cancelada');
    // CAMBIO (8.F, V29): el pago del admin ahora trae su id
    assert.deepEqual(result.payment, { id: 7, status: 'Aprobado', cardLastDigit: 2 });
    assert.deepEqual(recorder.lockedIds, [1]);
    assert.deepEqual(recorder.cancelledIds, [1]);
    assert.deepEqual(recorder.actions, [
      { reservationId: 1, adminId: ADMIN_ID, action: 'cancelar', reason: 'Pedido del cliente', previousDate: null, newDate: null },
    ]);
  });

  test('aprobada → también se puede cancelar (V23)', async () => {
    const { service } = buildService({ stored: [LUIS] });
    const result = await service.cancel(3, ADMIN_ID, {}, NOW);
    assert.equal(result.status, 'Cancelada');
  });

  test('ya cancelada (CU-13 2a) → 409 y no cambia nada', async () => {
    const { service, recorder } = buildService({ stored: [CARLA] });
    await assertAppError(service.cancel(2, ADMIN_ID, {}, NOW), 409, 'La reserva ya está cancelada');
    assert.equal(recorder.cancelledIds.length, 0);
    assert.equal(recorder.actions.length, 0);
  });

  test('faltan 48 h o menos (RN-02, 8.2b = no) → 422 con el mismo mensaje del turista', async () => {
    const { service, recorder } = buildService({ stored: [PEDRO] });
    await assertAppError(
      service.cancel(4, ADMIN_ID, {}, NOW),
      422,
      'La reserva no se puede cancelar porque faltan 48 horas o menos para la fecha del viaje',
    );
    assert.equal(recorder.cancelledIds.length, 0);
    assert.equal(recorder.actions.length, 0);
  });

  test('inexistente (V20) → 404', async () => {
    const { service } = buildService();
    await assertAppError(service.cancel(1, ADMIN_ID, {}, NOW), 404, 'La reserva no existe');
  });
});

describe('AdminReservationService.remove (CU-14)', () => {
  test('cancelada → borrado lógico, en el historial, y ya no aparece en el listado ni se puede aprobar', async () => {
    const { service, recorder } = buildService({ stored: [ANA, CARLA] });
    const result = await service.remove(2, ADMIN_ID, {});

    assert.equal(result, undefined);
    assert.deepEqual(recorder.deletedIds, [2]);
    assert.deepEqual(recorder.actions, [
      { reservationId: 2, adminId: ADMIN_ID, action: 'eliminar', reason: null, previousDate: null, newDate: null },
    ]);
    // V15 y V20: una eliminada no se lista y, para el admin, ya "no existe"
    assert.deepEqual((await service.list()).map((r) => r.id), [1]);
    await assertAppError(service.approve(2, ADMIN_ID, {}), 404, 'La reserva no existe');
  });

  test('pendiente o aprobada (V24) → 409 "solo canceladas" y no se borra', async () => {
    for (const reservation of [ANA, LUIS]) {
      const { service, recorder } = buildService({ stored: [reservation] });
      await assertAppError(
        service.remove(reservation.id, ADMIN_ID, {}),
        409,
        'Solo se pueden eliminar reservas canceladas',
      );
      assert.equal(recorder.deletedIds.length, 0);
      assert.equal(recorder.actions.length, 0);
    }
  });

  test('inexistente (CU-14 2a, V20) → 404', async () => {
    const { service } = buildService();
    await assertAppError(service.remove(7, ADMIN_ID, {}), 404, 'La reserva no existe');
  });
});

// NUEVO (8.F)
describe('changePaymentStatusSchema (body de PATCH /admin/pagos/:id)', () => {
  test('los 3 estados de CU-15; el motivo sin espacios a los lados y los campos extra fuera', () => {
    assert.deepEqual(changePaymentStatusSchema.parse({ status: 'Aprobado' }), { status: 'Aprobado' });
    assert.deepEqual(changePaymentStatusSchema.parse({ status: 'Pendiente', extra: 1 }), { status: 'Pendiente' });
    assert.deepEqual(changePaymentStatusSchema.parse({ status: 'Rechazado', reason: '  No llegó el pago ' }), {
      status: 'Rechazado',
      reason: 'No llegó el pago',
    });
  });

  test('estado inválido, en minúsculas o faltante (CU-15 6a) → error en status', () => {
    for (const body of [{ status: 'aprobado' }, { status: 'Reembolsado' }, { status: 1 }, {}]) {
      const result = changePaymentStatusSchema.safeParse(body);
      assert.equal(result.success, false);
      assert.equal(result.error?.issues[0]?.path.join('.'), 'status');
    }
  });

  test('rechazar sin motivo o con motivo vacío (N-1, V31) → error en reason', () => {
    for (const body of [{ status: 'Rechazado' }, { status: 'Rechazado', reason: '   ' }]) {
      const result = changePaymentStatusSchema.safeParse(body);
      assert.equal(result.success, false);
      assert.equal(result.error?.issues[0]?.path.join('.'), 'reason');
    }
  });
});

describe('AdminReservationService.changePaymentStatus (CU-15 + N-1)', () => {
  test('Rechazado con motivo → pago Rechazado y reserva Cancelada, en el historial con su motivo', async () => {
    const { service, recorder } = buildService({ stored: [ANA] });
    const result = await service.changePaymentStatus(7, ADMIN_ID, { status: 'Rechazado', reason: 'No llegó el pago' });

    assert.equal(result.status, 'Cancelada');
    assert.deepEqual(result.payment, { id: 7, status: 'Rechazado', cardLastDigit: 2 });
    assert.deepEqual(recorder.lockedIds, [1]);
    assert.deepEqual(recorder.paymentUpdates, [{ paymentId: 7, status: 'Rechazado' }]);
    assert.deepEqual(recorder.cancelledIds, [1]);
    assert.deepEqual(recorder.actions, [
      { reservationId: 1, adminId: ADMIN_ID, action: 'pago_rechazado', reason: 'No llegó el pago', previousDate: null, newDate: null },
    ]);
  });

  test('Rechazado cancela aunque la reserva esté Aprobada o falten 48 h o menos (8.1 = A, V36)', async () => {
    for (const reservation of [LUIS, PEDRO]) {
      const { service, recorder } = buildService({ stored: [reservation] });
      const result = await service.changePaymentStatus(reservation.paymentId, ADMIN_ID, {
        status: 'Rechazado',
        reason: 'No llegó el pago',
      });
      assert.equal(result.status, 'Cancelada');
      assert.deepEqual(recorder.cancelledIds, [reservation.id]);
    }
  });

  test('Aprobado → Pendiente con la reserva Pendiente → solo cambia el pago (no cancela)', async () => {
    const { service, recorder } = buildService({ stored: [ANA] });
    const result = await service.changePaymentStatus(7, ADMIN_ID, { status: 'Pendiente' });

    assert.equal(result.status, 'Pendiente');
    assert.equal(result.payment.status, 'Pendiente');
    assert.equal(recorder.cancelledIds.length, 0);
    assert.equal(recorder.actions[0]?.action, 'pago_pendiente');
    assert.equal(recorder.actions[0]?.reason, null);
  });

  test('Pendiente → Aprobado → 200 y en el historial pago_aprobado', async () => {
    const { service, recorder } = buildService({ stored: [MARTA] });
    const result = await service.changePaymentStatus(11, ADMIN_ID, { status: 'Aprobado' });

    assert.equal(result.payment.status, 'Aprobado');
    assert.equal(recorder.actions[0]?.action, 'pago_aprobado');
  });

  test('el mismo estado que ya tiene (V34) → 409 y no cambia nada', async () => {
    const { service, recorder } = buildService({ stored: [ANA] });
    await assertAppError(service.changePaymentStatus(7, ADMIN_ID, { status: 'Aprobado' }), 409, 'El pago ya tiene ese estado');
    assert.equal(recorder.paymentUpdates.length, 0);
    assert.equal(recorder.actions.length, 0);
  });

  test('reserva cancelada (V33) → 409; y un rechazo no se deshace', async () => {
    const { service, recorder } = buildService({ stored: [CARLA, ANA] });
    await assertAppError(
      service.changePaymentStatus(8, ADMIN_ID, { status: 'Aprobado' }),
      409,
      'No se puede cambiar el pago de una reserva cancelada',
    );
    // Rechazar el de Ana y luego intentar volver a Aprobado
    await service.changePaymentStatus(7, ADMIN_ID, { status: 'Rechazado', reason: 'No llegó el pago' });
    await assertAppError(
      service.changePaymentStatus(7, ADMIN_ID, { status: 'Aprobado' }),
      409,
      'No se puede cambiar el pago de una reserva cancelada',
    );
    assert.deepEqual(recorder.paymentUpdates, [{ paymentId: 7, status: 'Rechazado' }]);
  });

  test('dejar Pendiente el pago de una reserva Aprobada (V35) → 409', async () => {
    const { service, recorder } = buildService({ stored: [LUIS] });
    await assertAppError(
      service.changePaymentStatus(9, ADMIN_ID, { status: 'Pendiente' }),
      409,
      'No se puede dejar pendiente el pago de una reserva aprobada',
    );
    assert.equal(recorder.paymentUpdates.length, 0);
  });

  test('un intento de pago ANTERIOR, no el más reciente (V32) → 409', async () => {
    const { service, recorder } = buildService({ stored: [ANA], oldPayments: [{ paymentId: 6, reservationId: 1 }] });
    await assertAppError(
      service.changePaymentStatus(6, ADMIN_ID, { status: 'Aprobado' }),
      409,
      'Solo se puede cambiar el pago más reciente de la reserva',
    );
    assert.equal(recorder.paymentUpdates.length, 0);
  });

  test('pago inexistente o de una reserva eliminada (CU-15 2a) → 404', async () => {
    const { service } = buildService({ stored: [CARLA] });
    await assertAppError(service.changePaymentStatus(99, ADMIN_ID, { status: 'Aprobado' }), 404, 'El pago no existe');
    await service.remove(2, ADMIN_ID, {});
    await assertAppError(service.changePaymentStatus(8, ADMIN_ID, { status: 'Aprobado' }), 404, 'El pago no existe');
  });
});

// NUEVO (8.G)
describe('adminRescheduleSchema (body de PATCH /admin/reservas/:id/fecha)', () => {
  test('fecha y motivo → válidos; el motivo sin espacios a los lados', () => {
    assert.deepEqual(adminRescheduleSchema.parse({ travelDate: '2026-12-12', reason: '  Derrumbe en la ruta ', x: 1 }), {
      travelDate: '2026-12-12',
      reason: 'Derrumbe en la ruta',
    });
  });

  test('sin motivo, motivo vacío o fecha inválida (N-2a, V39) → error en ese campo', () => {
    const cases: [unknown, string][] = [
      [{ travelDate: '2026-12-12' }, 'reason'],
      [{ travelDate: '2026-12-12', reason: '   ' }, 'reason'],
      [{ travelDate: '2026-02-30', reason: 'Derrumbe' }, 'travelDate'],
      [{ reason: 'Derrumbe' }, 'travelDate'],
    ];
    for (const [body, field] of cases) {
      const result = adminRescheduleSchema.safeParse(body);
      assert.equal(result.success, false);
      assert.equal(result.error?.issues[0]?.path.join('.'), field);
    }
  });
});

describe('AdminReservationService.reschedule (N-2a)', () => {
  const INPUT = { travelDate: '2026-12-12', reason: 'Derrumbe en la ruta' };

  test('cabe justo (18 + 2 = 20) → fecha nueva, monto igual, +1 reagenda y en el historial con las dos fechas', async () => {
    const { service, recorder } = buildService({ stored: [ANA], reservedInTortuguero: 18 });
    const result = await service.reschedule(1, ADMIN_ID, INPUT, NOW);

    assert.equal(result.travelDate, '2026-12-12');
    assert.equal(result.status, 'Pendiente');
    assert.equal(result.quote.total, '107350.00');
    assert.equal(result.reschedules, 3);
    assert.deepEqual(recorder.lockedIds, [1]);
    assert.deepEqual(recorder.lockedDestinationIds, [4]);
    assert.deepEqual(recorder.updatedDates, [{ id: 1, travelDate: '2026-12-12' }]);
    assert.deepEqual(recorder.actions, [
      { reservationId: 1, adminId: ADMIN_ID, action: 'reagendar', reason: 'Derrumbe en la ruta', previousDate: '2026-12-10', newDate: '2026-12-12' },
    ]);
  });

  test('faltan 48 h o menos → SÍ se puede (N-2a: el admin no pasa por RN-02); una aprobada sigue aprobada (V40)', async () => {
    const pedroApproved: AdminReservationDetails = { ...PEDRO, status: 'Aprobada' };
    const { service } = buildService({ stored: [pedroApproved] });
    const result = await service.reschedule(4, ADMIN_ID, INPUT, NOW);
    assert.equal(result.travelDate, '2026-12-12');
    assert.equal(result.status, 'Aprobada');
  });

  test('sin cupo en la fecha nueva (19 + 2 > 20, RN-01) → 409 con los cupos y no se guarda nada', async () => {
    const { service, recorder } = buildService({ stored: [ANA], reservedInTortuguero: 19 });
    await assertAppError(
      service.reschedule(1, ADMIN_ID, INPUT, NOW),
      409,
      'No hay cupo suficiente para esa fecha. Cupos disponibles: 1',
    );
    assert.equal(recorder.updatedDates.length, 0);
    assert.equal(recorder.actions.length, 0);
  });

  test('reserva cancelada (V40) → 409', async () => {
    const { service, recorder } = buildService({ stored: [CARLA] });
    await assertAppError(service.reschedule(2, ADMIN_ID, INPUT, NOW), 409, 'No se puede cambiar la fecha de una reserva cancelada');
    assert.equal(recorder.updatedDates.length, 0);
  });

  test('la misma fecha que ya tiene (V41) → 400 travelDate', async () => {
    const { service, recorder } = buildService({ stored: [ANA] });
    await assert.rejects(service.reschedule(1, ADMIN_ID, { ...INPUT, travelDate: '2026-12-10' }, NOW), (e: unknown) => {
      assert.ok(e instanceof AppError);
      assert.equal(e.status, 400);
      assert.equal(e.details?.[0]?.field, 'travelDate');
      return true;
    });
    assert.equal(recorder.updatedDates.length, 0);
  });

  test('destino desactivado (V42) → 409 con el mensaje del turista', async () => {
    const atIrazu: AdminReservationDetails = { ...ANA, destination: { id: 14, name: 'Volcán Irazú', place: 'Cartago' } };
    const { service, recorder } = buildService({ stored: [atIrazu] });
    await assertAppError(service.reschedule(1, ADMIN_ID, INPUT, NOW), 409, 'El destino ya no está disponible para cambiar la fecha');
    assert.equal(recorder.updatedDates.length, 0);
  });

  test('fecha nueva de hoy en Costa Rica → 400 sin abrir la transacción', async () => {
    const { service, recorder } = buildService({ stored: [ANA] });
    await assert.rejects(service.reschedule(1, ADMIN_ID, { ...INPUT, travelDate: '2026-11-08' }, NOW), AppError);
    assert.equal(recorder.transactions, 0);
  });

  test('inexistente (V20) → 404', async () => {
    const { service } = buildService();
    await assertAppError(service.reschedule(1, ADMIN_ID, INPUT, NOW), 404, 'La reserva no existe');
  });
});