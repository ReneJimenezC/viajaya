// Pruebas unitarias de AuthService: login y access tokens. No usan la base de datos:
// el repositorio se reemplaza por uno falso en memoria.

import { before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { argon2id, hash } from 'argon2';
import { SignJWT } from 'jose';
import { AppError } from '../errors/app-error';
import type { Admin } from '../models/admin.entity';
import type { AdminRepository } from '../repositories/admin.repository';
import { AuthService, JWT_AUDIENCE, JWT_ISSUER } from '../services/auth.service';

const SECRET = 'secreto-de-pruebas-con-mas-de-32-caracteres';
const EMAIL = 'admin@viajaya.test';
const PASSWORD = 'una frase larga y segura';

// Comprueba que la promesa falle con un AppError del código HTTP indicado
async function assertRejectsWith(promise: Promise<unknown>, status: number): Promise<void> {
  await assert.rejects(promise, (error: unknown) => {
    assert.ok(error instanceof AppError);
    assert.equal(error.status, status);
    return true;
  });
}

// Firma un token a mano, para simular tokens alterados o ajenos
function signToken(
  claims: Record<string, unknown>,
  options: { secret?: string; iss?: string; aud?: string; exp?: number; sub?: string } = {},
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT(claims)
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(options.sub ?? '3')
    .setIssuer(options.iss ?? JWT_ISSUER)
    .setAudience(options.aud ?? JWT_AUDIENCE)
    .setIssuedAt(now)
    .setExpirationTime(options.exp ?? now + 900)
    .sign(new TextEncoder().encode(options.secret ?? SECRET));
}

let service: AuthService;

before(async () => {
  const passwordHash = await hash(PASSWORD, { type: argon2id });
  // Repositorio falso: solo conoce al admin de pruebas (id 3)
  const fakeRepository = {
    findForLogin: async (email: string) =>
      email === EMAIL ? ({ id: 3, email, role: 'admin', passwordHash } as Admin) : null,
  } as unknown as AdminRepository;
  service = new AuthService(fakeRepository, SECRET);
});

describe('AuthService.authenticate (login)', () => {
  test('correo y contraseña correctos → devuelve id y rol', async () => {
    assert.deepEqual(await service.authenticate({ email: EMAIL, password: PASSWORD }), {
      id: 3,
      role: 'admin',
    });
  });

  test('contraseña incorrecta → 401', async () => {
    await assertRejectsWith(service.authenticate({ email: EMAIL, password: 'otra' }), 401);
  });

  test('correo inexistente → 401 con el mismo mensaje', async () => {
    const wrongPassword = service.authenticate({ email: EMAIL, password: 'otra' }).catch((e: Error) => e.message);
    const wrongEmail = service
      .authenticate({ email: 'nadie@viajaya.test', password: PASSWORD })
      .catch((e: Error) => e.message);
    assert.equal(await wrongEmail, await wrongPassword);
  });
});

describe('AuthService.issueAccessToken + verifyAccessToken', () => {
  test('un token recién emitido se verifica y devuelve el mismo admin', async () => {
    const { accessToken, tokenType, expiresIn } = await service.issueAccessToken({ id: 3, role: 'admin' });
    assert.equal(tokenType, 'Bearer');
    assert.equal(expiresIn, 900);
    assert.deepEqual(await service.verifyAccessToken(accessToken), { id: 3, role: 'admin' });
  });

  test('firma alterada → 401', async () => {
    const { accessToken } = await service.issueAccessToken({ id: 3, role: 'admin' });
    const tampered = accessToken.slice(0, -2) + (accessToken.endsWith('AA') ? 'BB' : 'AA');
    await assertRejectsWith(service.verifyAccessToken(tampered), 401);
  });

  test('firmado con otro secreto → 401', async () => {
    const token = await signToken({ role: 'admin' }, { secret: 'otro-secreto-de-mas-de-32-caracteres!!' });
    await assertRejectsWith(service.verifyAccessToken(token), 401);
  });

  test('vencido → 401', async () => {
    const token = await signToken({ role: 'admin' }, { exp: Math.floor(Date.now() / 1000) - 10 });
    await assertRejectsWith(service.verifyAccessToken(token), 401);
  });

  test('otro emisor (iss) → 401', async () => {
    await assertRejectsWith(service.verifyAccessToken(await signToken({ role: 'admin' }, { iss: 'otra-api' })), 401);
  });

  test('otro destinatario (aud) → 401', async () => {
    await assertRejectsWith(service.verifyAccessToken(await signToken({ role: 'admin' }, { aud: 'viajaya-client' })), 401);
  });

  test('algoritmo "none" (sin firma) → 401', async () => {
    const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
    const now = Math.floor(Date.now() / 1000);
    const unsigned = `${encode({ alg: 'none', typ: 'JWT' })}.${encode({
      sub: '3', role: 'admin', iss: JWT_ISSUER, aud: JWT_AUDIENCE, iat: now, exp: now + 900,
    })}.`;
    await assertRejectsWith(service.verifyAccessToken(unsigned), 401);
  });

  test('sin rol → 401', async () => {
    await assertRejectsWith(service.verifyAccessToken(await signToken({})), 401);
  });

  test('sub que no es un id → 401', async () => {
    await assertRejectsWith(service.verifyAccessToken(await signToken({ role: 'admin' }, { sub: 'abc' })), 401);
  });

  test('texto que no es un JWT → 401', async () => {
    await assertRejectsWith(service.verifyAccessToken('esto.no.sirve'), 401);
  });
});