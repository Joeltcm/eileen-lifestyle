// Entrega C: aviso previo al corte de un cliente de rutinas (2 días, 1 día y el día del corte sin rutinas).
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import postgres from 'postgres';
import { CREDENCIALES, SETUP_TOKEN, cliente, levantar } from './harness.mjs';
import { routinePrepReference } from '../dist/routine-cycle.js';

let server; let api; let db; let ownerId; let planId;
const panamaToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Panama', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const addDays = (value, days) => { const d = new Date(`${value}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); };

before(async () => {
  server = await levantar(); api = cliente(server.base); db = postgres(server.databaseUrl, { onnotice: () => {} });
  const setup = await api.post('/api/auth/setup', CREDENCIALES, { 'x-setup-token': SETUP_TOKEN });
  api.usarToken(setup.datos.token);
  ownerId = (await db`SELECT id FROM users WHERE email = ${CREDENCIALES.email}`)[0].id;
  [{ id: planId }] = await db`INSERT INTO service_plans (owner_id, name, billing_model, price, sessions_included, service_type, routines_per_month, active) VALUES (${ownerId}, 'Rutinas aviso', 'monthly', 0, NULL, 'rutinas', 3, true) RETURNING id`;
}, { timeout: 90_000 });
after(async () => { await db?.end({ timeout: 1 }).catch(() => {}); await server?.parar(); });

const candidatas = async hoy => (await api.get(`/api/maintenance/rutinas-por-enviar?hoy=${hoy}`)).datos.candidatas;

test('C1) 2 días antes, 1 día antes y el día del corte; se apaga cuando el ciclo nuevo ya tiene sus rutinas', async () => {
  const today = panamaToday(); const cut = addDays(today, 2);
  const alta = await api.post('/api/clients', { fullName: 'Aviso Corte', email: 'aviso@prueba.test', cutoffDay: Number(cut.slice(8, 10)), planId });
  assert.equal(alta.estado, 201, JSON.stringify(alta.datos));
  const clientId = alta.datos.id;
  const t2 = (await candidatas(today)).filter(c => c.cliente === 'Aviso Corte');
  assert.deepEqual(t2.map(c => [c.etapa, c.corte, c.asignadas, c.cupo]), [['T2', cut, 0, 3]]);
  const t1 = (await candidatas(addDays(today, 1))).filter(c => c.cliente === 'Aviso Corte');
  assert.deepEqual(t1.map(c => [c.etapa, c.corte]), [['T1', cut]]);
  assert.equal((await candidatas(addDays(today, -5))).filter(c => c.cliente === 'Aviso Corte').length, 0, 'fuera de la ventana no avisa');
  // el día del corte, sin rutinas: aviso aparte
  const dia0 = (await candidatas(cut)).filter(c => c.cliente === 'Aviso Corte');
  assert.deepEqual(dia0.map(c => [c.etapa, c.corte, c.asignadas]), [['DAY0', cut, 0]]);
  // asignar 2 de 3 para el ciclo nuevo (inicio = día del corte): T2 sigue avisando con 2 de 3, DAY0 ya no
  const asignar = async title => {
    const r = await api.post('/api/routines', { title, sessionsPerWeek: 2, clientId, startsOn: cut, confirmQuota: true, exercises: [{ name: title, sets: 3, reps: '10' }] });
    assert.equal(r.estado, 201, JSON.stringify(r.datos));
  };
  await asignar('Nueva 1'); await asignar('Nueva 2');
  assert.deepEqual((await candidatas(today)).filter(c => c.cliente === 'Aviso Corte').map(c => [c.etapa, c.asignadas]), [['T2', 2]]);
  assert.equal((await candidatas(cut)).filter(c => c.cliente === 'Aviso Corte').length, 0, 'el día del corte con rutinas asignadas no avisa');
  // campanita: aparece mientras falten rutinas por enviar
  const campanita = (await api.get('/api/notifications')).datos.filter(n => n.type === 'routine_prep');
  assert.equal(campanita.length, 1);
  assert.match(campanita[0].body, /2 de 3 rutinas asignadas/); assert.match(campanita[0].body, /\d{2}-\d{2}-\d{4}/);
  await asignar('Nueva 3');
  assert.equal((await candidatas(today)).filter(c => c.cliente === 'Aviso Corte').length, 0, 'completo: no avisa');
  assert.equal((await api.get('/api/notifications')).datos.filter(n => n.type === 'routine_prep').length, 0);
  // inactivo: no se avisa
  await db`UPDATE clients SET status = 'inactive' WHERE id = ${clientId}`;
  await db`DELETE FROM routine_assignments WHERE client_id = ${clientId}`;
  assert.equal((await candidatas(today)).filter(c => c.cliente === 'Aviso Corte').length, 0, 'inactivo: no se avisa');
});

test('C2) la clave de idempotencia es estable por cliente, corte y etapa; la restricción de notification_deliveries admite el tipo nuevo', async () => {
  const cid = '11111111-1111-1111-1111-111111111111';
  assert.equal(routinePrepReference(cid, '2030-03-01', 'T2'), routinePrepReference(cid, '2030-03-01', 'T2'));
  assert.notEqual(routinePrepReference(cid, '2030-03-01', 'T2'), routinePrepReference(cid, '2030-03-01', 'T1'));
  assert.notEqual(routinePrepReference(cid, '2030-03-01', 'T2'), routinePrepReference(cid, '2030-04-01', 'T2'));
  assert.match(routinePrepReference(cid, '2030-03-01', 'DAY0'), /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  const ref = routinePrepReference(cid, '2030-03-01', 'T2');
  await db`INSERT INTO notification_deliveries (user_id, kind, reference_id) VALUES (${ownerId}, 'routine_cycle_prep', ${ref}::uuid)`;
  const dup = await db`INSERT INTO notification_deliveries (user_id, kind, reference_id) VALUES (${ownerId}, 'routine_cycle_prep', ${ref}::uuid) ON CONFLICT DO NOTHING RETURNING user_id`;
  assert.equal(dup.length, 0, 'un segundo aviso igual no se reserva');
});

test('C3) la reversa de 074 quita el tipo y las marcas, y la migración se puede volver a aplicar', async () => {
  const { readFile } = await import('node:fs/promises');
  const down = await readFile(new URL('../migrations-down/074_routine_cycle_prep_notifications.down.sql', import.meta.url), 'utf8');
  const up = await readFile(new URL('../migrations/074_routine_cycle_prep_notifications.sql', import.meta.url), 'utf8');
  await db.unsafe(down);
  assert.equal((await db`SELECT count(*)::int AS n FROM notification_deliveries WHERE kind = 'routine_cycle_prep'`)[0].n, 0);
  await assert.rejects(() => db`INSERT INTO notification_deliveries (user_id, kind, reference_id) VALUES (${ownerId}, 'routine_cycle_prep', gen_random_uuid())`);
  await db`INSERT INTO notification_deliveries (user_id, kind, reference_id) VALUES (${ownerId}, 'pause', gen_random_uuid())`;
  await db.unsafe(up);
  await db`INSERT INTO notification_deliveries (user_id, kind, reference_id) VALUES (${ownerId}, 'routine_cycle_prep', gen_random_uuid())`;
});
