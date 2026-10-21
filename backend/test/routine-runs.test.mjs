// A2: una rutina de plan puede repetirse en un día sin mezclar su cronómetro,
// checklist, cierre ni aviso con las ejecuciones anteriores.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import postgres from 'postgres';
import { CREDENCIALES, SETUP_TOKEN, cliente, levantar } from './harness.mjs';

let server; let api; let db; let ownerId; let sequence = 0;
const panamaToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Panama', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const exercise = name => ({ name, sets: 2, reps: '10' });

async function routineClient(label, routinesPerMonth = 1, serviceType = 'rutinas') {
  sequence += 1;
  const [plan] = await db`INSERT INTO service_plans (owner_id, name, billing_model, price, sessions_included, service_type, routines_per_month, active) VALUES (${ownerId}, ${`Rutinas ejecución ${label} ${sequence}`}, 'monthly', 0, NULL, ${serviceType}, ${routinesPerMonth}, true) RETURNING id`;
  const client = await api.post('/api/clients', { fullName: `Cliente ejecución ${label} ${sequence}`, email: `ejecucion-${label}-${sequence}@prueba.test`, cutoffDay: 1, planId: plan.id });
  assert.equal(client.estado, 201, JSON.stringify(client.datos));
  return client.datos.id;
}

async function portalFor(clientId) {
  const access = await api.post(`/api/clients/${clientId}/access-link`, {});
  const token = String(access.datos.url).split('acceso=')[1];
  const login = await api.post(`/api/auth/access-link/${token}`, { password: 'clave-del-portal-larga' });
  assert.equal(login.estado, 200, JSON.stringify(login.datos));
  const portal = cliente(server.base); portal.usarToken(login.datos.token);
  return portal;
}

async function createRoutine(label, routinesPerMonth = 1, serviceType = 'rutinas') {
  const clientId = await routineClient(label, routinesPerMonth, serviceType);
  const routine = await api.post('/api/routines', { title: `Rutina ${label}`, sessionsPerWeek: 2, clientId, startsOn: panamaToday(), exercises: [exercise('Sentadilla'), exercise('Remo')] });
  assert.equal(routine.estado, 201, JSON.stringify(routine.datos));
  return { clientId, routine: routine.datos, portal: await portalFor(clientId) };
}

async function closeRun(portal, routineId, runNumber) {
  const day = panamaToday();
  const started = await portal.post('/api/portal/routine-activity', { routineId, runNumber, completedOn: day, kind: 'started', elapsedSeconds: 0 });
  assert.equal(started.estado, 201, JSON.stringify(started.datos));
  assert.equal(started.datos.runNumber, runNumber);
  const firstExercise = await portal.post('/api/portal/routine-exercise-completions', { routineId, runNumber, completedOn: day, exerciseIndex: 0, completed: true, elapsedSeconds: 6 });
  assert.equal(firstExercise.estado, 201, JSON.stringify(firstExercise.datos));
  assert.equal(firstExercise.datos.routineCompleted, false);
  const completed = await portal.post('/api/portal/routine-exercise-completions', { routineId, runNumber, completedOn: day, exerciseIndex: 1, completed: true, elapsedSeconds: 12 });
  assert.equal(completed.estado, 201, JSON.stringify(completed.datos));
  assert.equal(completed.datos.runNumber, runNumber);
  assert.equal(completed.datos.routineCompleted, true);
}

before(async () => {
  server = await levantar(); api = cliente(server.base); db = postgres(server.databaseUrl, { onnotice: () => {} });
  const setup = await api.post('/api/auth/setup', CREDENCIALES, { 'x-setup-token': SETUP_TOKEN });
  api.usarToken(setup.datos.token);
  ownerId = (await db`SELECT id FROM users WHERE email = ${CREDENCIALES.email}`)[0].id;
}, { timeout: 90_000 });
after(async () => { await db?.end({ timeout: 1 }).catch(() => {}); await server?.parar(); });

test('A2-1) dos ejecuciones del mismo día conservan checklist, cronómetro, cierre y aviso separados', async () => {
  const { clientId, routine, portal } = await createRoutine('doble');
  await closeRun(portal, routine.id, 1);
  await closeRun(portal, routine.id, 2);
  const day = panamaToday();
  const completions = await db`SELECT run_number, completion_percent, assignment_id, completed_at FROM routine_completions WHERE client_id = ${clientId} AND routine_id = ${routine.id} AND completed_on = ${day}::date ORDER BY run_number`;
  assert.deepEqual(completions.map(row => [Number(row.run_number), Number(row.completion_percent), Boolean(row.assignment_id), Boolean(row.completed_at)]), [[1, 100, true, true], [2, 100, true, true]]);
  const exercises = await db`SELECT run_number, exercise_index, completed FROM routine_exercise_completions WHERE client_id = ${clientId} AND routine_id = ${routine.id} AND completed_on = ${day}::date ORDER BY run_number, exercise_index`;
  assert.deepEqual(exercises.map(row => [Number(row.run_number), Number(row.exercise_index), Boolean(row.completed)]), [[1, 0, true], [1, 1, true], [2, 0, true], [2, 1, true]]);
  const timers = await db`SELECT run_number, active, completed_at FROM routine_timer_sessions WHERE client_id = ${clientId} AND routine_id = ${routine.id} AND completed_on = ${day}::date ORDER BY run_number`;
  assert.deepEqual(timers.map(row => [Number(row.run_number), Boolean(row.active), Boolean(row.completed_at)]), [[1, false, true], [2, false, true]]);
  const notices = await db`SELECT run_number, kind, title FROM routine_activity_notifications WHERE client_id = ${clientId} AND routine_id = ${routine.id} AND completed_on = ${day}::date ORDER BY run_number, kind`;
  assert.equal(notices.filter(row => row.kind === 'completed').length, 2);
  assert.ok(notices.filter(row => Number(row.run_number) === 2).every(row => /repetición n.º 2/i.test(row.title)));
});

test('A2-2) cinco ejecuciones usan una sola asignación y no consumen cupo ni disparan el aviso de entrega repetida', async () => {
  const { clientId, routine, portal } = await createRoutine('cinco', 1);
  for (let runNumber = 1; runNumber <= 5; runNumber += 1) await closeRun(portal, routine.id, runNumber);
  const day = panamaToday();
  const [state] = await db`SELECT
    (SELECT count(*)::int FROM routine_assignments WHERE client_id = ${clientId} AND active) AS assignments,
    (SELECT count(*)::int FROM routine_deliveries WHERE client_id = ${clientId}) AS deliveries,
    (SELECT count(*)::int FROM routine_completions WHERE client_id = ${clientId} AND routine_id = ${routine.id} AND completed_on = ${day}::date AND completion_percent > 0) AS completed`;
  assert.deepEqual([Number(state.assignments), Number(state.deliveries), Number(state.completed)], [1, 1, 5]);
});

test('A2-3) el bloqueo transaccional deja una sola ejecución nueva si dos inicios llegan a la vez', async () => {
  const { clientId, routine, portal } = await createRoutine('concurrencia');
  await closeRun(portal, routine.id, 1);
  const day = panamaToday();
  const results = await Promise.all([
    portal.post('/api/portal/routine-activity', { routineId: routine.id, completedOn: day, kind: 'started', elapsedSeconds: 0 }),
    portal.post('/api/portal/routine-activity', { routineId: routine.id, completedOn: day, kind: 'started', elapsedSeconds: 0 })
  ]);
  assert.ok(results.every(result => result.estado === 201), JSON.stringify(results));
  assert.deepEqual(results.map(result => result.datos.runNumber), [2, 2]);
  const timers = await db`SELECT run_number FROM routine_timer_sessions WHERE client_id = ${clientId} AND routine_id = ${routine.id} AND completed_on = ${day}::date ORDER BY run_number`;
  assert.deepEqual(timers.map(row => Number(row.run_number)), [1, 2]);
});

test('A2-4) una ejecución parcial cerrada permite una nueva ejecución, sin mezclar su porcentaje', async () => {
  const { clientId, routine, portal } = await createRoutine('parcial');
  const day = panamaToday();
  const partial = await portal.post('/api/portal/routine-completions', { routineId: routine.id, completedOn: day, completionPercent: 40, durationSeconds: 30 });
  assert.equal(partial.estado, 201, JSON.stringify(partial.datos));
  const next = await portal.post('/api/portal/routine-activity', { routineId: routine.id, completedOn: day, kind: 'started', elapsedSeconds: 0 });
  assert.equal(next.estado, 201, JSON.stringify(next.datos));
  assert.equal(next.datos.runNumber, 2);
  const rows = await db`SELECT run_number, completion_percent, completed_at FROM routine_completions WHERE client_id = ${clientId} AND routine_id = ${routine.id} AND completed_on = ${day}::date ORDER BY run_number`;
  assert.deepEqual(rows.map(row => [Number(row.run_number), Number(row.completion_percent), Boolean(row.completed_at)]), [[1, 40, true]]);
});

test('A2-5) un enlace vigente de una rutina permite su repetición, pero no cuando la asignación dejó de estar vigente', async () => {
  const { clientId, routine } = await createRoutine('enlace');
  const shared = await api.post(`/api/routines/${routine.id}/share-links`, { clientId, hours: 24 });
  assert.equal(shared.estado, 201, JSON.stringify(shared.datos));
  const token = String(shared.datos.url).split('#rutina=')[1];
  const publicApi = cliente(server.base);
  const first = await publicApi.post(`/api/public/routine/${token}/complete`, { completionPercent: 100, runNumber: 1 });
  const second = await publicApi.post(`/api/public/routine/${token}/complete`, { completionPercent: 100, runNumber: 2 });
  assert.deepEqual([first.estado, first.datos.runNumber, second.estado, second.datos.runNumber], [200, 1, 200, 2]);
  await db`UPDATE routine_assignments SET ends_on = ${panamaToday()}::date - 1 WHERE routine_id = ${routine.id} AND client_id = ${clientId}`;
  const closed = await publicApi.get(`/api/public/routine/${token}`);
  assert.equal(closed.estado, 410);
  assert.match(closed.datos.error, /venció/i);
});

test('A2-6) la reversa 073 se niega a fusionar ejecuciones reales sin una orden expresa', async () => {
  const archivo = new URL('../migrations-down/073_routine_runs.down.sql', import.meta.url).pathname;
  await assert.rejects(
    promisify(execFile)('psql', ['-v', 'ON_ERROR_STOP=1', '-q', server.databaseUrl, '-f', archivo]),
    /billing\.allow_destructive_down|orden expresa/i
  );
});

test('A2-7) un cliente mensual conserva una única ejecución por rutina y día, aunque envíe runNumber', async () => {
  const { clientId, routine, portal } = await createRoutine('mensual', 1, 'presencial');
  const day = panamaToday();
  const first = await portal.post('/api/portal/routine-completions', { routineId: routine.id, completedOn: day, runNumber: 1, completionPercent: 40, durationSeconds: 20 });
  const second = await portal.post('/api/portal/routine-completions', { routineId: routine.id, completedOn: day, runNumber: 2, completionPercent: 100, durationSeconds: 40 });
  assert.equal(first.estado, 201, JSON.stringify(first.datos));
  assert.equal(second.estado, 201, JSON.stringify(second.datos));
  const rows = await db`SELECT run_number, completion_percent FROM routine_completions WHERE client_id = ${clientId} AND routine_id = ${routine.id} AND completed_on = ${day}::date ORDER BY run_number`;
  assert.deepEqual(rows.map(row => [Number(row.run_number), Number(row.completion_percent)]), [[1, 100]]);
  const feedback = await portal.post('/api/portal/routine-feedback', { routineId: routine.id, completedOn: day, feedback: 'Una sola ejecución' });
  assert.equal(feedback.estado, 200, JSON.stringify(feedback.datos));
  assert.equal(Number(feedback.datos.run_number), 1);
});
