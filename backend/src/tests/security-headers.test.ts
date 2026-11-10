// Pruebas de las cabeceras de seguridad (V56): una app Express mínima con el mismo orden
// de app.ts (CORS y después helmet), escuchando en un puerto libre. No usa base de datos.

import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { corsPolicy } from '../middlewares/cors';
import { securityHeaders } from '../middlewares/security-headers';

const FRONTEND = 'http://localhost:5173';

describe('securityHeaders (V56)', () => {
  let server: Server;
  let baseUrl: string;

  before(async () => {
    const app = express();
    app.use(corsPolicy(FRONTEND));
    app.use(securityHeaders());
    app.get('/ping', (_req, res) => {
      res.json({ ok: true });
    });
    // Un error también debe salir con las cabeceras (helmet las pone antes de la ruta)
    app.get('/fail', (_req, res) => {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'x' } });
    });
    server = app.listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => server.once('listening', () => resolve()));
    const { port } = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  after(() => {
    server.close();
  });

  test('pone las cabeceras principales con valores para una API JSON', async () => {
    const res = await fetch(`${baseUrl}/ping`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(res.headers.get('content-security-policy'), "default-src 'none';frame-ancestors 'none'");
    assert.equal(res.headers.get('x-frame-options'), 'DENY');
    assert.equal(res.headers.get('referrer-policy'), 'no-referrer');
    assert.equal(res.headers.get('strict-transport-security'), 'max-age=31536000; includeSubDomains');
  });

  test('no revela la tecnología del servidor', async () => {
    const res = await fetch(`${baseUrl}/ping`);
    assert.equal(res.headers.get('x-powered-by'), null);
  });

  test('los errores también llevan las cabeceras', async () => {
    const res = await fetch(`${baseUrl}/fail`);
    assert.equal(res.status, 404);
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  });

  test('no rompe el CORS: el frontend sigue recibiendo permiso y credenciales', async () => {
    const res = await fetch(`${baseUrl}/ping`, { headers: { Origin: FRONTEND } });
    assert.equal(res.headers.get('access-control-allow-origin'), FRONTEND);
    assert.equal(res.headers.get('access-control-allow-credentials'), 'true');
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  });
});