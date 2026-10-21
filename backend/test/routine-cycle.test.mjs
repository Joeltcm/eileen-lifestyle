// Ciclo y cupo de clientes cuyo servicio son rutinas: el corte, no un saldo,
// decide el vencimiento. Se prueba por HTTP porque las fechas también deben
// sobrevivir la asignación real y no solo la función pura.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import postgres from 'postgres';
import { routineCycle } from '../dist/routine-cycle.js';
import { CREDENCIALES, SETUP_TOKEN, cliente, levantar } from './harness.mjs';

let server; let api; let db; let ownerId;
const exercise = name => ({ name, sets: 3, reps: '10' });
const panamaToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Panama', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

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
