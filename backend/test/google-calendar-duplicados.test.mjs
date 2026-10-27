// Google Calendar: una sesión de la aplicación = UN evento. Un Google simulado reproduce las carreras que creaban duplicados
// (envío inmediato + sincronización periódica a la vez, respuesta perdida tras crear) y comprueba que los duplicados viejos se retiran.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import postgres from 'postgres';
import { createCipheriv, createHash, randomBytes, randomUUID } from 'node:crypto';
import { cliente, levantar, CREDENCIALES, SETUP_TOKEN } from './harness.mjs';

const JWT_SECRET = 'secreto-de-pruebas-con-mas-de-treinta-y-dos-caracteres';
const originalFetch = globalThis.fetch;
const dormir = ms => new Promise(resolve => setTimeout(resolve, ms));
let servidor; let api; let db; let ownerId; let google;
const eventos = new Map();   // el calendario simulado: id → evento
const comportamiento = { perderRespuestaTrasCrear: 0 };

const json = (estado, cuerpo) => new Response(estado === 204 ? null : JSON.stringify(cuerpo ?? {}), { status: estado, headers: { 'content-type': 'application/json' } });
function googleSimulado() {
  return async (entrada, opciones = {}) => {
    const url = new URL(String(entrada)); const metodo = (opciones.method || 'GET').toUpperCase();
    if (url.hostname === 'oauth2.googleapis.com') return json(200, { access_token: 'token-simulado', expires_in: 3600 });
    if (url.hostname !== 'www.googleapis.com') return originalFetch(entrada, opciones);
    const cuerpo = opciones.body ? JSON.parse(String(opciones.body)) : {};
    const ruta = url.pathname.replace('/calendar/v3/calendars/primary/events', '');
    if (metodo === 'POST' && ruta === '') {
      await dormir(40);   // da tiempo a que otras llamadas lleguen antes de que este evento exista
      if (cuerpo.id && eventos.has(cuerpo.id)) return json(409, { error: { message: 'The requested identifier already exists.', errors: [{ reason: 'duplicate' }] } });
      const id = cuerpo.id || `g${randomUUID().replace(/-/g, '').slice(0, 20)}`;
      const evento = { ...cuerpo, id, status: 'confirmed', etag: `"${randomUUID()}"`, updated: new Date().toISOString(), htmlLink: `https://calendar.test/${id}` };
      eventos.set(id, evento);
      if (comportamiento.perderRespuestaTrasCrear > 0) { comportamiento.perderRespuestaTrasCrear -= 1; return json(500, { error: { message: 'Error interno de Google' } }); }
      return json(200, evento);
    }
    const id = decodeURIComponent(ruta.slice(1));
    if (metodo === 'GET' && ruta === '') return json(200, { items: [...eventos.values()].filter(e => e.extendedProperties?.private?.source === 'eileen-lifestyle') });
    if (metodo === 'PATCH') {
      const actual = eventos.get(id);
      if (!actual) return json(404, { error: { message: 'Not Found' } });
      if (actual.status === 'cancelled' && cuerpo.status !== 'confirmed') return json(410, { error: { message: 'Resource has been deleted' } });
      Object.assign(actual, cuerpo, { updated: new Date(Date.now() + 1).toISOString(), etag: `"${randomUUID()}"` });
      return json(200, actual);
    }
    if (metodo === 'DELETE') { const actual = eventos.get(id); if (!actual) return json(404, {}); actual.status = 'cancelled'; return json(204); }
    return json(404, { error: { message: `ruta no simulada ${metodo} ${ruta}` } });
  };
}
const vivosDe = sessionId => [...eventos.values()].filter(e => e.status !== 'cancelled' && e.extendedProperties?.private?.eileenSessionId === sessionId);
const cifrar = valor => { const iv = randomBytes(12); const cifra = createCipheriv('aes-256-gcm', createHash('sha256').update(JWT_SECRET).digest(), iv); const datos = Buffer.concat([cifra.update(valor, 'utf8'), cifra.final()]); return [iv, cifra.getAuthTag(), datos].map(p => p.toString('base64url')).join('.'); };

before(async () => {
  servidor = await levantar(); api = cliente(servidor.base);
  const setup = await api.post('/api/auth/setup', CREDENCIALES, { 'x-setup-token': SETUP_TOKEN });
  api.usarToken(setup.datos.token);
  Object.assign(process.env, { DATABASE_URL: servidor.databaseUrl, JWT_SECRET, SETUP_TOKEN, NODE_ENV: 'test', GOOGLE_CLIENT_ID: 'id-simulado', GOOGLE_CLIENT_SECRET: 'secreto-simulado' });
  google = await import('../dist/google-calendar.js');
  db = postgres(servidor.databaseUrl, { connection: { TimeZone: 'America/Panama' } });
  [{ id: ownerId }] = await db`SELECT id::text AS id FROM users LIMIT 1`;
  await db`INSERT INTO integration_connections (owner_id, provider, encrypted_refresh_token, organization_id, organization_name, accounts_url, api_base_url, status, sync_enabled)
    VALUES (${ownerId}, 'google_calendar', ${cifrar('refresco-simulado')}, 'primary', 'Principal', 'https://accounts.google.com', 'https://www.googleapis.com', 'ready', true)`;
  globalThis.fetch = googleSimulado();
}, { timeout: 90_000 });
after(async () => { globalThis.fetch = originalFetch; await db?.end({ timeout: 1 }).catch(() => {}); await servidor?.parar(); });

let numero = 0;
async function nuevaSesion() {
  numero += 1;
  const cli = await api.post('/api/clients', { fullName: `Cliente Google ${numero}`, billingModel: 'single', standardPrice: 25, cutoffDay: 15 });
  const sesion = await api.post('/api/sessions', { clientId: cli.datos.id, startsAt: new Date(Date.now() + (24 + numero) * 3600_000).toISOString(), durationMinutes: 60, mode: 'Presencial' });
  assert.equal(sesion.estado, 201, JSON.stringify(sesion.datos));
  return sesion.datos.id;
}

test('G1) envío inmediato y sincronización periódica a la vez: un solo evento por sesión', async () => {
  const id = await nuevaSesion();
  await Promise.allSettled([google.syncSessionToGoogle(ownerId, id), google.syncSessionToGoogle(ownerId, id), google.syncFutureSessions(ownerId)]);
  assert.equal(vivosDe(id).length, 1, `eventos vivos para la sesión: ${vivosDe(id).length}`);
  const [fila] = await db`SELECT google_event_id FROM sessions WHERE id = ${id}`;
  assert.equal(fila.google_event_id, vivosDe(id)[0].id, 'la sesión apunta al evento que existe');
});

test('G2) si Google creó el evento pero la respuesta se perdió, el reintento no crea otro', async () => {
  const id = await nuevaSesion();
  comportamiento.perderRespuestaTrasCrear = 1;
  await assert.rejects(google.syncSessionToGoogle(ownerId, id));
  assert.equal(vivosDe(id).length, 1, 'Google sí lo creó');
  await google.syncSessionToGoogle(ownerId, id);
  assert.equal(vivosDe(id).length, 1, 'el reintento reutiliza el mismo evento');
});

test('G3) cambiar la sesión actualiza el mismo evento (no crea otro)', async () => {
  const id = await nuevaSesion();
  await google.syncSessionToGoogle(ownerId, id);
  const [antes] = vivosDe(id);
  await db`UPDATE sessions SET duration_minutes = 90, updated_at = now() WHERE id = ${id}`;
  await google.syncSessionToGoogle(ownerId, id);
  assert.equal(vivosDe(id).length, 1); assert.equal(vivosDe(id)[0].id, antes.id);
  assert.equal(new Date(vivosDe(id)[0].end.dateTime) - new Date(vivosDe(id)[0].start.dateTime), 90 * 60_000);
});

test('G4) un evento borrado a mano en Google se recrea una sola vez', async () => {
  const id = await nuevaSesion();
  await google.syncSessionToGoogle(ownerId, id);
  eventos.get(vivosDe(id)[0].id).status = 'cancelled';
  await db`UPDATE sessions SET google_sync_error = 'El evento fue eliminado en Google', updated_at = now() WHERE id = ${id}`;
  await Promise.allSettled([google.syncSessionToGoogle(ownerId, id), google.syncFutureSessions(ownerId)]);
  assert.equal(vivosDe(id).length, 1, `eventos vivos: ${vivosDe(id).length}`);
});

test('G5) los duplicados que ya existen en el calendario se retiran solos, quedándose con el que la sesión tiene guardado', async () => {
  const id = await nuevaSesion();
  await google.syncSessionToGoogle(ownerId, id);
  const [bueno] = vivosDe(id);
  for (const extra of ['dupl1', 'dupl2']) eventos.set(extra, { ...bueno, id: extra, etag: `"${extra}"`, updated: new Date().toISOString() });
  assert.equal(vivosDe(id).length, 3);
  await google.syncFutureSessions(ownerId);
  assert.equal(vivosDe(id).length, 1, 'quedó uno');
  assert.equal(vivosDe(id)[0].id, bueno.id, 'el que la sesión tenía guardado');
  const [fila] = await db`SELECT google_event_id FROM sessions WHERE id = ${id}`; assert.equal(fila.google_event_id, bueno.id);
});

test('G6) con duplicados, se respeta el evento al que la sesión ya apuntaba', async () => {
  const id = await nuevaSesion();
  const base = { summary: 'Entrenamiento · x', start: { dateTime: new Date(Date.now() + 5 * 3600_000).toISOString() }, end: { dateTime: new Date(Date.now() + 6 * 3600_000).toISOString() },
    status: 'confirmed', extendedProperties: { private: { eileenSessionId: id, source: 'eileen-lifestyle' } }, updated: new Date().toISOString() };
  eventos.set('viejoA', { ...base, id: 'viejoA', etag: '"a"', created: '2026-10-01T10:00:00Z' }); eventos.set('viejoB', { ...base, id: 'viejoB', etag: '"b"', created: '2026-10-02T10:00:00Z' });
  await db`UPDATE sessions SET google_event_id = 'viejoB' WHERE id = ${id}`;
  await google.syncFutureSessions(ownerId);
  assert.equal(vivosDe(id).length, 1); assert.equal(vivosDe(id)[0].id, 'viejoB', 'se respeta el que la sesión ya apuntaba');
});
