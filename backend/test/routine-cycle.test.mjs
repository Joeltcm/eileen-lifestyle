// Ciclo y cupo de clientes cuyo servicio son rutinas: el corte, no un saldo,
// decide el vencimiento. Se prueba por HTTP porque las fechas también deben
// sobrevivir la asignación real y no solo la función pura.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import postgres from 'postgres';
import { routineCutoffPeriodOffset, routineCycle } from '../dist/routine-cycle.js';
import { CREDENCIALES, SETUP_TOKEN, cliente, levantar } from './harness.mjs';

let server; let api; let db; let ownerId;
const exercise = name => ({ name, sets: 3, reps: '10' });
const panamaToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Panama', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const shiftDay = (day, offset) => {
  const value = new Date(`${day}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + offset);
  return value.toISOString().slice(0, 10);
};
let sequence = 0;

async function routineClient(label, cutoffDay = 1, routinesPerMonth = 8) {
  sequence += 1;
  const [plan] = await db`INSERT INTO service_plans (owner_id, name, billing_model, price, sessions_included, service_type, routines_per_month, active) VALUES (${ownerId}, ${`Rutinas ${label} ${sequence}`}, 'monthly', 0, NULL, 'rutinas', ${routinesPerMonth}, true) RETURNING id`;
  const result = await api.post('/api/clients', { fullName: `Cliente ${label} ${sequence}`, email: `rutinas-${label}-${sequence}@prueba.test`, cutoffDay, planId: plan.id });
  assert.equal(result.estado, 201, JSON.stringify(result.datos));
  return result.datos.id;
}

async function clientPortal(clientId) {
  const access = await api.post(`/api/clients/${clientId}/access-link`, {});
  const token = String(access.datos.url).split('acceso=')[1];
  const login = await api.post(`/api/auth/access-link/${token}`, { password: 'clave-del-portal-larga' });
  assert.equal(login.estado, 200, JSON.stringify(login.datos));
  const portal = cliente(server.base); portal.usarToken(login.datos.token);
  return portal;
}

const linkToken = url => String(url).split('#rutina=')[1];

before(async () => {
  server = await levantar(); api = cliente(server.base); db = postgres(server.databaseUrl, { onnotice: () => {} });
  const setup = await api.post('/api/auth/setup', CREDENCIALES, { 'x-setup-token': SETUP_TOKEN });
  api.usarToken(setup.datos.token);
  ownerId = (await db`SELECT id FROM users WHERE email = ${CREDENCIALES.email}`)[0].id;
}, { timeout: 90_000 });
after(async () => { await db?.end({ timeout: 1 }).catch(() => {}); await server?.parar(); });

test('A1) el ciclo respeta cortes 28/30/31 y febrero', () => {
  assert.deepEqual(routineCycle({ cutoffDay: 31, planRoutinesPerMonth: 2 }, '2030-02-28'), {
    cycleStart: '2030-02-28', cycleEnd: '2030-03-30', nextCycleStart: '2030-03-31', quota: 2
  });
  assert.deepEqual(routineCycle({ cutoffDay: 30, planRoutinesPerMonth: 3 }, '2030-02-28'), {
    cycleStart: '2030-02-28', cycleEnd: '2030-03-29', nextCycleStart: '2030-03-30', quota: 3
  });
  assert.deepEqual(routineCycle({ cutoffDay: 28, monthlyTarget: 1 }, '2030-02-28'), {
    cycleStart: '2030-02-28', cycleEnd: '2030-03-27', nextCycleStart: '2030-03-28', quota: 1
  });
});

test('A2) asignar ajusta la fecha al cierre, bloquea por cupo y permite confirmar el excedente', async () => {
  const [plan] = await db`INSERT INTO service_plans (owner_id, name, billing_model, price, sessions_included, service_type, routines_per_month, active) VALUES (${ownerId}, 'Rutinas de prueba', 'monthly', 0, 1, 'rutinas', 1, true) RETURNING id`;
  const alta = await api.post('/api/clients', { fullName: 'Cliente de rutinas', email: 'ciclo-rutinas@prueba.test', cutoffDay: 31, planId: plan.id });
  assert.equal(alta.estado, 201, JSON.stringify(alta.datos));
  const clientId = alta.datos.id;
  const first = await api.post('/api/routines', { title: 'Primera', sessionsPerWeek: 2, clientId, startsOn: '2030-02-28', dueOn: '2030-12-31', exercises: [exercise('Plancha')] });
  assert.equal(first.estado, 201, JSON.stringify(first.datos));
  assert.equal(first.datos.assignment_due_on_adjusted, true);
  const [assignment] = await db`SELECT starts_on::text, due_on::text FROM routine_assignments WHERE routine_id = ${first.datos.id}`;
  assert.deepEqual([assignment.starts_on, assignment.due_on], ['2030-02-28', '2030-03-30']);
  const blocked = await api.post('/api/routines', { title: 'Segunda', sessionsPerWeek: 2, clientId, startsOn: '2030-02-28', exercises: [exercise('Remo')] });
  assert.equal(blocked.estado, 409, JSON.stringify(blocked.datos));
  assert.equal(blocked.datos.code, 'quota_reached');
  const confirmed = await api.post('/api/routines', { title: 'Segunda', sessionsPerWeek: 2, clientId, startsOn: '2030-02-28', confirmQuota: true, exercises: [exercise('Remo')] });
  assert.equal(confirmed.estado, 201, JSON.stringify(confirmed.datos));
});

test('A3) una rutina futura de un cliente de rutinas no aparece en su portal', async () => {
  const [plan] = await db`INSERT INTO service_plans (owner_id, name, billing_model, price, sessions_included, service_type, routines_per_month, active) VALUES (${ownerId}, 'Rutinas futuras', 'monthly', 0, 1, 'rutinas', 2, true) RETURNING id`;
  const alta = await api.post('/api/clients', { fullName: 'Portal futuro', email: 'portal-futuro@prueba.test', cutoffDay: 1, planId: plan.id });
  assert.equal(alta.estado, 201, JSON.stringify(alta.datos));
  const clientId = alta.datos.id;
  const today = panamaToday();
  const tomorrow = new Date(`${today}T12:00:00Z`); tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const startsOn = tomorrow.toISOString().slice(0, 10);
  const routine = await api.post('/api/routines', { title: 'Disponible mañana', sessionsPerWeek: 1, clientId, startsOn, exercises: [exercise('Movilidad')] });
  assert.equal(routine.estado, 201, JSON.stringify(routine.datos));
  const access = await api.post(`/api/clients/${clientId}/access-link`, {});
  const token = String(access.datos.url).split('acceso=')[1];
  const login = await api.post(`/api/auth/access-link/${token}`, { password: 'clave-del-portal-larga' });
  const portal = cliente(server.base); portal.usarToken(login.datos.token);
  const summary = await portal.get('/api/portal/summary');
  assert.equal(summary.estado, 200, JSON.stringify(summary.datos));
  assert.equal(summary.datos.routines.length, 0, 'la rutina futura no se puede abrir antes de su inicio');
});

test('A4) vencimiento efectivo: una rutina vencida no está en portal ni se puede completar; el enlace dice expirado', async () => {
  const today = panamaToday();
  const clientId = await routineClient('vencida');
  const routine = await api.post('/api/routines', { title: 'Ya vencida', sessionsPerWeek: 1, clientId, startsOn: shiftDay(today, -3), dueOn: shiftDay(today, -1), exercises: [exercise('Puente')] });
  assert.equal(routine.estado, 201, JSON.stringify(routine.datos));
  const portal = await clientPortal(clientId);
  const summary = await portal.get('/api/portal/summary');
  assert.equal(summary.estado, 200); assert.equal(summary.datos.routines.some(item => item.id === routine.datos.id), false);
  const completion = await portal.post('/api/portal/routine-completions', { routineId: routine.datos.id, completedOn: today, completionPercent: 100, durationSeconds: 60 });
  assert.equal(completion.estado, 404, JSON.stringify(completion.datos));
  const activity = await portal.post('/api/portal/routine-activity', { routineId: routine.datos.id, completedOn: today, kind: 'started', elapsedSeconds: 0 });
  assert.equal(activity.estado, 404, JSON.stringify(activity.datos));
  const exerciseCompletion = await portal.post('/api/portal/routine-exercise-completions', { routineId: routine.datos.id, completedOn: today, exerciseIndex: 0, completed: false, elapsedSeconds: 0 });
  assert.equal(exerciseCompletion.estado, 404, JSON.stringify(exerciseCompletion.datos));
  const shared = await api.post(`/api/routines/${routine.datos.id}/share-links`, { clientId, hours: 24 });
  assert.equal(shared.estado, 201, JSON.stringify(shared.datos));
  const publicLink = await cliente(server.base).get(`/api/public/routine/${linkToken(shared.datos.url)}`);
  assert.equal(publicLink.estado, 410); assert.match(publicLink.datos.error, /venció/i);
});

test('A5) las asignaciones heredadas con due_on nulo o más allá del ciclo se cierran al final del ciclo', async () => {
  const today = panamaToday();
  const clientId = await routineClient('heredada', 1);
  const oldStart = shiftDay(today, -45);
  const legacy = await api.post('/api/routines', { title: 'Legado sin fecha', sessionsPerWeek: 1, clientId, startsOn: oldStart, exercises: [exercise('Movilidad')] });
  assert.equal(legacy.estado, 201, JSON.stringify(legacy.datos));
  await db`UPDATE routine_assignments SET due_on = NULL WHERE routine_id = ${legacy.datos.id}`;
  const far = await api.post('/api/routines', { title: 'Legado con fecha lejana', sessionsPerWeek: 1, clientId, startsOn: oldStart, exercises: [exercise('Remo')] });
  assert.equal(far.estado, 201, JSON.stringify(far.datos));
  await db`UPDATE routine_assignments SET due_on = ${shiftDay(today, 90)}::date WHERE routine_id = ${far.datos.id}`;
  const portal = await clientPortal(clientId);
  const summary = await portal.get('/api/portal/summary');
  assert.equal(summary.estado, 200);
  assert.equal(summary.datos.routines.some(item => [legacy.datos.id, far.datos.id].includes(item.id)), false, 'ni NULL ni una fecha más allá del ciclo dejan la rutina disponible');
  const shared = await api.post(`/api/routines/${far.datos.id}/share-links`, { clientId, hours: 24 });
  assert.equal(shared.estado, 201, JSON.stringify(shared.datos));
  const publicLink = await cliente(server.base).get(`/api/public/routine/${linkToken(shared.datos.url)}`);
  assert.equal(publicLink.estado, 410); assert.match(publicLink.datos.error, /venció/i);
});

test('A6) al cerrar un ciclo de rutinas sin completar no se cobra, no abre saldo ni cambia facturas', async () => {
  const today = panamaToday();
  const clientId = await routineClient('sin-cobro');
  const routine = await api.post('/api/routines', { title: 'No completada', sessionsPerWeek: 1, clientId, startsOn: shiftDay(today, -4), dueOn: shiftDay(today, -1), exercises: [exercise('Respiración')] });
  assert.equal(routine.estado, 201, JSON.stringify(routine.datos));
  const before = await db`SELECT
    (SELECT count(*)::int FROM session_packages WHERE client_id = ${clientId}) AS packages,
    (SELECT count(*)::int FROM billing_invoices WHERE payer_client_id = ${clientId}) AS invoices,
    (SELECT count(*)::int FROM sessions WHERE client_id = ${clientId} AND credit_charge) AS charges`;
  const maintenance = await api.post('/api/maintenance/vencer-ofertas-rutina', {});
  assert.ok(maintenance.estado < 300, JSON.stringify(maintenance.datos));
  const after = await db`SELECT
    (SELECT count(*)::int FROM session_packages WHERE client_id = ${clientId}) AS packages,
    (SELECT count(*)::int FROM billing_invoices WHERE payer_client_id = ${clientId}) AS invoices,
    (SELECT count(*)::int FROM sessions WHERE client_id = ${clientId} AND credit_charge) AS charges`;
  assert.deepEqual(after, before, 'una rutina no completada no es una sesión ni toca facturación');
});

test('A7) PATCH y una versión nueva conservan la fecha límite dentro del ciclo', async () => {
  const today = panamaToday();
  const clientId = await routineClient('edicion', 1);
  const routine = await api.post('/api/routines', { title: 'Editable', sessionsPerWeek: 1, clientId, startsOn: today, dueOn: shiftDay(today, 90), exercises: [exercise('Plancha')] });
  assert.equal(routine.estado, 201, JSON.stringify(routine.datos));
  const start = shiftDay(today, 35);
  const expectedAfterPatch = routineCycle({ cutoffDay: 1, planRoutinesPerMonth: 8 }, start).cycleEnd;
  const patched = await api.patch(`/api/routines/${routine.datos.id}`, { title: 'Editable', sessionsPerWeek: 1, startsOn: start, dueOn: shiftDay(today, 180), exercises: routine.datos.exercises });
  assert.equal(patched.estado, 200, JSON.stringify(patched.datos));
  assert.equal((await db`SELECT due_on::text AS due FROM routine_assignments WHERE routine_id = ${routine.datos.id} AND active`)[0].due, expectedAfterPatch);
  const versioned = await api.patch(`/api/routines/${routine.datos.id}`, { title: 'Editable', sessionsPerWeek: 1, dueOn: shiftDay(today, 240), confirmVersion: true, exercises: [exercise('Plancha'), exercise('Remo')] });
  assert.equal(versioned.estado, 200, JSON.stringify(versioned.datos));
  assert.equal((await db`SELECT due_on::text AS due FROM routine_assignments WHERE routine_id = ${versioned.datos.id} AND active`)[0].due, expectedAfterPatch);
});

test('A8) el enlace distingue una asignación retirada de una rutina cuyo inicio es futuro', async () => {
  const today = panamaToday();
  const clientId = await routineClient('enlaces');
  const routine = await api.post('/api/routines', { title: 'Retirada', sessionsPerWeek: 1, clientId, exercises: [exercise('Bisagra')] });
  const shared = await api.post(`/api/routines/${routine.datos.id}/share-links`, { clientId, hours: 24 });
  await db`UPDATE routine_assignments SET active = false WHERE routine_id = ${routine.datos.id}`;
  const removed = await cliente(server.base).get(`/api/public/routine/${linkToken(shared.datos.url)}`);
  assert.equal(removed.estado, 410); assert.equal(removed.datos.error, 'Esta rutina ya no está asignada.');
  const future = await api.post('/api/routines', { title: 'Mañana', sessionsPerWeek: 1, clientId, startsOn: shiftDay(today, 1), exercises: [exercise('Estiramiento')] });
  const futureLink = await api.post(`/api/routines/${future.datos.id}/share-links`, { clientId, hours: 24 });
  const pending = await cliente(server.base).get(`/api/public/routine/${linkToken(futureLink.datos.url)}`);
  assert.equal(pending.estado, 410); assert.match(pending.datos.error, /todavía no está disponible/i);
});

test('A9) el historial normal conserva sus períodos por corte, incluido febrero para corte 31', async () => {
  assert.deepEqual(routineCutoffPeriodOffset('2030-02-28', 15, 0), { inicio: '2030-02-15', vence: '2030-03-15' });
  assert.deepEqual(routineCutoffPeriodOffset('2030-02-28', 31, 0), { inicio: '2030-02-28', vence: '2030-03-31' });
  for (const cutoffDay of [15, 31]) {
    const created = await api.post('/api/clients', { fullName: `Mensual normal ${cutoffDay}`, email: `historial-${cutoffDay}@prueba.test`, cutoffDay });
    const history = await api.get(`/api/clients/${created.datos.id}/routine-history?cutOffset=0`);
    assert.equal(history.estado, 200, JSON.stringify(history.datos));
    assert.deepEqual([history.datos.period.from, history.datos.period.to], Object.values(routineCutoffPeriodOffset(new Date(), cutoffDay, 0)));
  }
});
