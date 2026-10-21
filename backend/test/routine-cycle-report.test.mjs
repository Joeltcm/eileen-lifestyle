// Bitácora del ciclo (Entrega B): enviadas vs hechas, repeticiones, calidad y línea de tiempo.
// Decisión 9 de Joel: una ejecución parcial cuenta como hecha; el cumplimiento puede pasar de 100 %.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import postgres from 'postgres';
import { CREDENCIALES, SETUP_TOKEN, cliente, levantar } from './harness.mjs';

let server; let api; let db; let ownerId; let planId;
const exercise = name => ({ name, sets: 3, reps: '10' });
const panamaToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Panama', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const addDays = (value, days) => { const d = new Date(`${value}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); };

before(async () => {
  server = await levantar(); api = cliente(server.base); db = postgres(server.databaseUrl, { onnotice: () => {} });
  const setup = await api.post('/api/auth/setup', CREDENCIALES, { 'x-setup-token': SETUP_TOKEN });
  api.usarToken(setup.datos.token);
  ownerId = (await db`SELECT id FROM users WHERE email = ${CREDENCIALES.email}`)[0].id;
  [{ id: planId }] = await db`INSERT INTO service_plans (owner_id, name, billing_model, price, sessions_included, service_type, routines_per_month, active) VALUES (${ownerId}, 'Rutinas bitácora', 'monthly', 0, NULL, 'rutinas', 3, true) RETURNING id`;
}, { timeout: 90_000 });
after(async () => { await db?.end({ timeout: 1 }).catch(() => {}); await server?.parar(); });

const nuevoCliente = async (nombre, correo) => {
  const alta = await api.post('/api/clients', { fullName: nombre, email: correo, cutoffDay: 1, planId });
  assert.equal(alta.estado, 201, JSON.stringify(alta.datos));
  return alta.datos.id;
};
const asignar = async (clientId, title) => {
  const r = await api.post('/api/routines', { title, sessionsPerWeek: 2, clientId, confirmQuota: true, exercises: [exercise(title)] });
  assert.equal(r.estado, 201, JSON.stringify(r.datos));
  return r.datos.id;
};

test('B1) enviadas y hechas son números distintos: parciales y repeticiones cuentan, el cumplimiento pasa de 100 %', async () => {
  const clientId = await nuevoCliente('Cliente bitácora', 'bitacora@prueba.test');
  const a = await asignar(clientId, 'Rutina A'); const b = await asignar(clientId, 'Rutina B');
  const today = panamaToday();
  await db`INSERT INTO routine_completions (routine_id, client_id, completed_on, run_number, completion_percent, completed_at, elapsed_seconds, feeling) VALUES (${a}, ${clientId}, ${today}::date, 1, 100, now(), 1200, 'bien')`;
  await db`INSERT INTO routine_completions (routine_id, client_id, completed_on, run_number, completion_percent, completed_at, elapsed_seconds, difficulty) VALUES (${a}, ${clientId}, ${today}::date, 2, 100, now(), 900, 'facil')`;
  await db`INSERT INTO routine_completions (routine_id, client_id, completed_on, run_number, completion_percent, elapsed_seconds) VALUES (${b}, ${clientId}, ${today}::date, 1, 60, 600)`;
  const res = await api.get(`/api/clients/${clientId}/routine-cycle`);
  assert.equal(res.estado, 200, JSON.stringify(res.datos));
  const m = res.datos.metrics;
  assert.equal(m.quota, 3);
  assert.equal(m.sent, 2, 'enviadas = rutinas distintas asignadas');
  assert.equal(m.done, 3, 'hechas = ejecuciones, incluidas repetición y parcial');
  assert.equal(m.distinctDone, 2); assert.equal(m.repeats, 1);
  assert.equal(m.pending, 0); assert.equal(m.expired, 0);
  assert.equal(m.compliancePercent, 100);
  assert.deepEqual([m.quality.complete, m.quality.partial, m.quality.averagePercent], [2, 1, 87]);
  assert.equal(m.quality.totalSeconds, 2700); assert.equal(m.quality.averageSeconds, 900);
  assert.deepEqual([m.quality.feelings.bien, m.quality.difficulties.facil], [1, 1]);
  // más ejecuciones que el cupo: el exceso se muestra tal cual
  await db`INSERT INTO routine_completions (routine_id, client_id, completed_on, run_number, completion_percent, completed_at) VALUES (${a}, ${clientId}, ${today}::date, 3, 100, now()), (${b}, ${clientId}, ${today}::date, 2, 100, now())`;
  const exceso = (await api.get(`/api/clients/${clientId}/routine-cycle`)).datos.metrics;
  assert.deepEqual([exceso.done, exceso.compliancePercent, exceso.repeats], [5, 167, 3]);
  // línea de tiempo: envíos con hora real; la ejecución parcial sin completed_at no inventa hora
  const { timeline, days } = (await api.get(`/api/clients/${clientId}/routine-cycle`)).datos;
  assert.equal(timeline.filter(e => e.type === 'sent').length, 2);
  assert.ok(timeline.filter(e => e.type === 'sent').every(e => e.at), 'el envío real trae su hora');
  const parcial = timeline.find(e => e.type === 'done' && e.partial);
  assert.equal(parcial.at, null, 'sin hora real no se inventa una');
  assert.equal(timeline.filter(e => e.type === 'done' && e.repetition > 1).length, 3);
  assert.deepEqual(days, [{ date: today, count: 5 }]);
});

test('B2) un ciclo cerrado sin hacer queda vencido; uno sin rutinas enviadas se marca como "sin rutinas todavía"', async () => {
  const clientId = await nuevoCliente('Cliente vencido', 'vencido@prueba.test');
  const vacio = (await api.get(`/api/clients/${clientId}/routine-cycle`)).datos;
  assert.equal(vacio.state, 'no_routines_yet');
  assert.deepEqual([vacio.metrics.sent, vacio.metrics.done, vacio.metrics.compliancePercent], [0, 0, 0]);
  const today = panamaToday();
  const previo = (await api.get(`/api/clients/${clientId}/routine-cycle?offset=-1`)).datos;
  assert.equal(previo.cycle.closed, true);
  const midPrevio = addDays(previo.cycle.start, 3);
  assert.ok(midPrevio <= previo.cycle.end && midPrevio < today);
  const r = await api.post('/api/routines', { title: 'Vieja', sessionsPerWeek: 1, exercises: [exercise('Remo')] });
  await db`INSERT INTO routine_assignments (routine_id, client_id, starts_on, due_on, active) VALUES (${r.datos.id}, ${clientId}, ${midPrevio}::date, NULL, true)`;
  const cerrado = (await api.get(`/api/clients/${clientId}/routine-cycle?offset=-1`)).datos;
  assert.equal(cerrado.metrics.sent, 1); assert.equal(cerrado.metrics.expired, 1); assert.equal(cerrado.metrics.pending, 0);
  assert.equal(cerrado.timeline.at(-1).type, 'expired');
  // lo vencido del ciclo anterior no suma al ciclo actual
  const actual = (await api.get(`/api/clients/${clientId}/routine-cycle`)).datos;
  assert.equal(actual.metrics.sent, 0);
  // otro dueño o cliente inexistente: 404
  assert.equal((await api.get('/api/clients/00000000-0000-0000-0000-000000000000/routine-cycle')).estado, 404);
});
