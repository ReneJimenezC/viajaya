// Pruebas unitarias de la gestión de reservas del admin (RF-08, CU-11 a CU-14): la plantilla
// del body y el servicio AdminReservationService. No usan base de datos: la transacción y los
// repositorios se reemplazan por versiones falsas en memoria (mismo patrón que reservation.test.ts).

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { AppError } from '../errors/app-error';
import { adminActionSchema } from '../models/admin-reservation.schema';
import type { NewAdminAction } from '../repositories/admin-action.repository';
import type { AdminReservationDetails } from '../repositories/reservation.repository';
import { AdminReservationService, type AdminRunInTransaction } from '../services/admin-reservation.service';

const CREATED_AT = new Date('2026-11-04T03:00:01Z');
// NUEVO (8.C-8.E): 12:00 del 08/11/2026 en Costa Rica (18:00 UTC)
const NOW = new Date('2026-11-08T18:00:00Z');
// Admin que hace las acciones (como req.admin.id)
const ADMIN_ID = 3;

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
  reschedules: 0,
};
// NUEVO (8.C-8.E): Luis ya aprobada; Pedro viaja en 36 h (RN-02); Marta con el pago pendiente
const LUIS: AdminReservationDetails = { ...ANA, id: 3, code: 'VY-LUIS2345', status: 'Aprobada', customerName: 'Luis Pérez' };
const PEDRO: AdminReservationDetails = { ...ANA, id: 4, code: 'VY-PEDR2345', travelDate: '2026-11-10', customerName: 'Pedro Solís' };
const MARTA: AdminReservationDetails = {
  ...ANA,
  id: 5,
  code: 'VY-MART2345',
  customerName: 'Marta Vega',
  payment: { status: 'Pendiente', cardLastDigit: 2 },
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
}

// Arma un AdminReservationService con piezas falsas.
// - stored: reservas guardadas, ya en el orden de la base (V16). Se COPIAN: así una prueba no
//   cambia los datos de otra. Las "eliminadas" (markDeleted) dejan de aparecer, como en la base.
function buildService(options: { stored?: AdminReservationDetails[] } = {}) {
  const { stored = [] } = options;
  const recorder: Recorder = {
    transactions: 0, lockedIds: [], approvedIds: [], cancelledIds: [], deletedIds: [], actions: [],
  };
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
          return row
            ? { id: row.id, status: row.status, travelDate: row.travelDate, paymentStatus: row.payment.status }
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
      payment: { status: 'Aprobado', cardLastDigit: 2 },
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
    assert.deepEqual(result.payment, { status: 'Aprobado', cardLastDigit: 2 });
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