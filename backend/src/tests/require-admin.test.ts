// Pruebas unitarias del middleware requireAdmin. No levantan Express: usan una
// petición y una respuesta falsas con lo mínimo que el middleware necesita.

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../errors/app-error';
import type { AdminRepository } from '../repositories/admin.repository';
import { requireAdmin } from '../middlewares/require-admin';
import { AuthService } from '../services/auth.service';

const service = new AuthService({} as AdminRepository, 'secreto-de-pruebas-con-mas-de-32-caracteres');
const middleware = requireAdmin(service);

// Resultado de ejecutar el middleware una vez
interface RunResult {
  error?: unknown;
  nextCalled: boolean;
  headers: Record<string, string>;
  req: Request;
}

// Ejecuta el middleware con la cabecera Authorization indicada
async function run(authorization?: string): Promise<RunResult> {
  const headers: Record<string, string> = {};
  const req = {
    headers: authorization === undefined ? {} : { authorization },
    log: { warn: () => {} },
  } as unknown as Request;
  const res = {
    set: (name: string, value: string) => {
      headers[name] = value;
    },
  } as unknown as Response;
  let nextCalled = false;
  const next: NextFunction = () => {
    nextCalled = true;
  };
  try {
    await middleware(req, res, next);
    return { nextCalled, headers, req };
  } catch (error) {
    return { error, nextCalled, headers, req };
  }
}

// Comprueba que el resultado sea un AppError con el código HTTP indicado
function assertStatus(result: RunResult, status: number): void {
  assert.ok(result.error instanceof AppError);
  assert.equal(result.error.status, status);
  assert.equal(result.nextCalled, false);
}

describe('requireAdmin', () => {
  test('token válido de admin → deja pasar y llena req.admin', async () => {
    const { accessToken } = await service.issueAccessToken({ id: 3, role: 'admin' });
    const result = await run(`Bearer ${accessToken}`);
    assert.equal(result.error, undefined);
    assert.equal(result.nextCalled, true);
    assert.deepEqual(result.req.admin, { id: 3, role: 'admin' });
  });

  test('"bearer" en minúsculas también se acepta', async () => {
    const { accessToken } = await service.issueAccessToken({ id: 3, role: 'admin' });
    assert.equal((await run(`bearer ${accessToken}`)).nextCalled, true);
  });

  test('sin cabecera Authorization → 401 con WWW-Authenticate: Bearer', async () => {
    const result = await run();
    assertStatus(result, 401);
    assert.equal(result.headers['WWW-Authenticate'], 'Bearer');
  });

  test('otro esquema (Basic) → 401', async () => {
    assertStatus(await run('Basic YWRtaW46YWRtaW4='), 401);
  });

  test('token inválido → 401 con error="invalid_token"', async () => {
    const result = await run('Bearer aaa.bbb.ccc');
    assertStatus(result, 401);
    assert.equal(result.headers['WWW-Authenticate'], 'Bearer error="invalid_token"');
  });

  test('token válido con otro rol → 403', async () => {
    const { accessToken } = await service.issueAccessToken({ id: 7, role: 'cliente' });
    const result = await run(`Bearer ${accessToken}`);
    assertStatus(result, 403);
    assert.equal(result.req.admin, undefined);
  });
});