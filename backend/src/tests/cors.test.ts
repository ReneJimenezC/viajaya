// Pruebas del CORS (SAD 6): una app Express mínima con corsPolicy y una ruta,
// escuchando en un puerto libre de esta máquina. No usa base de datos.

import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { corsPolicy } from '../middlewares/cors';

const FRONTEND = 'http://localhost:5173';

describe('corsPolicy (SAD 6)', () => {
  let server: Server;
  let baseUrl: string;

  before(async () => {
    const app = express();
    app.use(corsPolicy(FRONTEND));
    app.get('/ping', (_req, res) => {
      res.json({ ok: true });
    });
    // Puerto 0 = el sistema elige uno libre
    server = app.listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => server.once('listening', () => resolve()));
    const { port } = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  after(() => {
    server.close();
  });

  test('el origen del frontend recibe permiso y credenciales', async () => {
    const res = await fetch(`${baseUrl}/ping`, { headers: { Origin: FRONTEND } });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('access-control-allow-origin'), FRONTEND);
    assert.equal(res.headers.get('access-control-allow-credentials'), 'true');
    assert.match(res.headers.get('vary') ?? '', /Origin/);
  });

  test('otro origen no recibe la cabecera de permiso (V54)', async () => {
    const res = await fetch(`${baseUrl}/ping`, { headers: { Origin: 'https://evil.example' } });
    // La API responde igual; es el navegador el que bloquea la lectura
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('access-control-allow-origin'), null);
  });

  test('un origen parecido tampoco pasa (otro puerto o barra final)', async () => {
    for (const origin of ['http://localhost:5174', `${FRONTEND}/`, 'https://localhost:5173']) {
      const res = await fetch(`${baseUrl}/ping`, { headers: { Origin: origin } });
      assert.equal(res.headers.get('access-control-allow-origin'), null, origin);
    }
  });

  test('sin cabecera Origin (REST Client, curl) la petición funciona igual', async () => {
    const res = await fetch(`${baseUrl}/ping`);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true });
  });

  test('preflight del frontend: 204 con métodos, cabeceras y tiempo de caché (V53)', async () => {
    const res = await fetch(`${baseUrl}/ping`, {
      method: 'OPTIONS',
      headers: {
        Origin: FRONTEND,
        'Access-Control-Request-Method': 'PATCH',
        'Access-Control-Request-Headers': 'content-type, authorization',
      },
    });
    assert.equal(res.status, 204);
    assert.equal(res.headers.get('access-control-allow-origin'), FRONTEND);
    assert.equal(res.headers.get('access-control-allow-credentials'), 'true');
    assert.equal(res.headers.get('access-control-allow-methods'), 'GET,POST,PATCH,DELETE');
    assert.equal(res.headers.get('access-control-allow-headers'), 'Content-Type,Authorization');
    assert.equal(res.headers.get('access-control-max-age'), '600');
  });

  test('preflight de otro origen: sin cabecera de permiso', async () => {
    const res = await fetch(`${baseUrl}/ping`, {
      method: 'OPTIONS',
      headers: { Origin: 'https://evil.example', 'Access-Control-Request-Method': 'DELETE' },
    });
    assert.equal(res.headers.get('access-control-allow-origin'), null);
  });
});