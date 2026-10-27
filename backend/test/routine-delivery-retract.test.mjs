// Quitar un envío de rutina hecho por error: deja de estar asignado, el enlace se revoca, sale del historial y el cupo se libera.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import postgres from 'postgres';
import { CREDENCIALES, SETUP_TOKEN, cliente, levantar } from './harness.mjs';

let servidor; let api; let db;
before(async () => {
  servidor = await levantar(); api = cliente(servidor.base);
  db = postgres(servidor.databaseUrl, { onnotice: () => {} });
  const setup = await api.post('/api/auth/setup', CREDENCIALES, { 'x-setup-token': SETUP_TOKEN });
  api.usarToken(setup.datos.token);
}, { timeout: 90_000 });
after(async () => { await db?.end({ timeout: 1 }).catch(() => {}); await servidor?.parar(); });

let n = 0;
async function nueva(extra = {}) {
  n += 1;
  const clienteId = (await api.post('/api/clients', { fullName: `Cliente Retiro ${n}`, cutoffDay: 1 })).datos.id;
  const rutina = await api.post('/api/routines', { title: `Rutina ${n}`, description: 'x', sessionsPerWeek: 1, clientId: clienteId, exercises: [{ name: 'Sentadilla', sets: 3, reps: '10' }], ...extra });
  assert.equal(rutina.estado, 201, JSON.stringify(rutina.datos));
  const lista = (await api.get(`/api/clients/${clienteId}/routine-deliveries`)).datos;
  assert.equal(lista.length, 1);
  return { clienteId, rutinaId: rutina.datos.id, entrega: lista[0] };
}

test('RT1) quitar la asignación la retira, borra el envío y deja la rutina en la biblioteca', async () => {
  const { clienteId, rutinaId, entrega } = await nueva();
  const r = await api.post(`/api/routine-deliveries/${entrega.id}/retract`, {});
  assert.equal(r.estado, 200, JSON.stringify(r.datos));
  assert.equal((await api.get(`/api/clients/${clienteId}/routine-deliveries`)).datos.length, 0);
  const [{ n: asignaciones }] = await db`SELECT count(*)::int AS n FROM routine_assignments WHERE client_id = ${clienteId}`;
  assert.equal(asignaciones, 0);
  const [{ n: rutinas }] = await db`SELECT count(*)::int AS n FROM routines WHERE id = ${rutinaId} AND archived_at IS NULL`;
  assert.equal(rutinas, 1, 'la rutina sigue en la biblioteca');
  const [{ n: auditoria }] = await db`SELECT count(*)::int AS n FROM audit_log WHERE action = 'routine_delivery.retract' AND target_id = ${entrega.id}`;
  assert.equal(auditoria, 1);
});

test('RT2) con enlace del mismo día se quitan juntos y el enlace queda revocado', async () => {
  const { clienteId, rutinaId } = await nueva();
  const enlace = await api.post(`/api/routines/${rutinaId}/share-links`, { clientId: clienteId, hours: 48 });
  assert.equal(enlace.estado, 201, JSON.stringify(enlace.datos));
  const lista = (await api.get(`/api/clients/${clienteId}/routine-deliveries`)).datos;
  assert.equal(lista.length, 1, 'el historial junta asignación y enlace');
  const r = await api.post(`/api/routine-deliveries/${lista[0].id}/retract`, {});
  assert.equal(r.estado, 200); assert.equal(r.datos.removed, 2);
  const [{ n }] = await db`SELECT count(*)::int AS n FROM routine_share_links WHERE client_id = ${clienteId} AND revoked_at IS NULL`;
  assert.equal(n, 0, 'sin enlaces vigentes');
  assert.equal((await db`SELECT 1 FROM routine_deliveries WHERE client_id = ${clienteId}`).length, 0);
});

test('RT3) una rutina que el cliente ya cumplió no se puede quitar', async () => {
  const { clienteId, rutinaId, entrega } = await nueva();
  await db`INSERT INTO routine_completions (routine_id, client_id, completed_on, run_number, completion_percent, completed_at, elapsed_seconds, feeling) VALUES (${rutinaId}, ${clienteId}, now()::date, 1, 100, now(), 1200, 'bien')`;
  const r = await api.post(`/api/routine-deliveries/${entrega.id}/retract`, {});
  assert.equal(r.estado, 409); assert.match(r.datos.error, /ya fue cumplida/);
  assert.equal((await api.get(`/api/clients/${clienteId}/routine-deliveries`)).datos.length, 1);
});

test('RT4) un envío que no existe da 404 y se puede volver a enviar después de quitarlo', async () => {
  const falso = await api.post('/api/routine-deliveries/00000000-0000-4000-8000-000000000000/retract', {});
  assert.equal(falso.estado, 404);
  const { clienteId, rutinaId, entrega } = await nueva();
  assert.equal((await api.post(`/api/routine-deliveries/${entrega.id}/retract`, {})).estado, 200);
  assert.equal((await api.patch(`/api/routines/${rutinaId}`, { title: 'Rutina de nuevo', description: 'x', sessionsPerWeek: 1, clientId: clienteId, exercises: [{ name: 'Sentadilla', sets: 3, reps: '10' }] })).estado, 200);
  assert.equal((await api.get(`/api/clients/${clienteId}/routine-deliveries`)).datos.length, 1, 'al reasignar ya no avisa de repetido');
});

test('RT5) la asignación y el enlace de viaje del mismo momento salen como UN envío, y se quitan juntos', async () => {
  const { clienteId, rutinaId } = await nueva();
  const hoy = new Date(Date.now() - 5 * 3600_000).toISOString().slice(0, 10);
  const fin = new Date(Date.now() - 5 * 3600_000 + 9 * 86400_000).toISOString().slice(0, 10);
  const viaje = await api.post(`/api/clients/${clienteId}/travel`, { startsOn: hoy, endsOn: fin });
  assert.equal(viaje.estado, 201, JSON.stringify(viaje.datos));
  const enlace = await api.post(`/api/routines/${rutinaId}/share-links`, { clientId: clienteId, travelId: viaje.datos.id, hours: 48 });
  assert.equal(enlace.estado, 201, JSON.stringify(enlace.datos));
  assert.equal((await db`SELECT 1 FROM routine_deliveries WHERE client_id = ${clienteId}`).length, 2, 'dos registros internos');
  const lista = (await api.get(`/api/clients/${clienteId}/routine-deliveries`)).datos;
  assert.equal(lista.length, 1, 'una sola fila en el expediente');
  assert.equal(lista[0].kind, 'assignment_travel_link');
  assert.equal((await api.post(`/api/routine-deliveries/${lista[0].id}/retract`, {})).datos.removed, 2);
});
