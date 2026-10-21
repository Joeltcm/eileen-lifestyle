// Informes de cumplimiento de rutinas (PDF y CSV): las mismas cifras que la bitácora del ciclo (enviadas ≠ hechas, parciales y repeticiones cuentan).
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import postgres from 'postgres';
import { CREDENCIALES, SETUP_TOKEN, cliente, levantar } from './harness.mjs';

let server; let api; let db; let ownerId; let planId; let ritaId; let portalRita; let hoy; let ciclo;
const panamaToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Panama' }).format(new Date());
const dmy = valor => `${valor.slice(8, 10)}-${valor.slice(5, 7)}-${valor.slice(0, 4)}`;
const sumar = (valor, dias) => { const d = new Date(`${valor}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + dias); return d.toISOString().slice(0, 10); };
const crudo = async (ruta, token) => { const r = await fetch(server.base + ruta, { headers: { Authorization: `Bearer ${token}` } }); return { estado: r.status, tipo: r.headers.get('content-type'), disposicion: r.headers.get('content-disposition'), cuerpo: Buffer.from(await r.arrayBuffer()) }; };
const filas = texto => texto.replace(/^﻿/, '').trim().split('\n').map(l => l.split('","').map(c => c.replace(/^"|"$/g, '')));

before(async () => {
  server = await levantar(); api = cliente(server.base); db = postgres(server.databaseUrl, { onnotice: () => {} });
  const setup = await api.post('/api/auth/setup', CREDENCIALES, { 'x-setup-token': SETUP_TOKEN });
  api.usarToken(setup.datos.token);
  ownerId = (await db`SELECT id FROM users WHERE email = ${CREDENCIALES.email}`)[0].id;
  hoy = panamaToday();
  [{ id: planId }] = await db`INSERT INTO service_plans (owner_id, name, billing_model, price, sessions_included, service_type, routines_per_month, active) VALUES (${ownerId}, 'Rutinas informe', 'monthly', 0, NULL, 'rutinas', 4, true) RETURNING id`;
  const alta = await api.post('/api/clients', { fullName: 'Rita Rutinas', email: 'rita.inf@prueba.test', cutoffDay: 1, planId });
  ritaId = alta.datos.id;
  const crear = async title => (await api.post('/api/routines', { title, sessionsPerWeek: 2, clientId: ritaId, confirmQuota: true, exercises: [{ name: title, sets: 3, reps: '10' }] })).datos.id;
  const a = await crear('Fuerza A'); const b = await crear('Movilidad B');
  await db`INSERT INTO routine_completions (routine_id, client_id, completed_on, run_number, completion_percent, completed_at, elapsed_seconds, feeling) VALUES (${a}, ${ritaId}, ${hoy}::date, 1, 100, ${`${hoy}T07:15:00-05:00`}, 1380, 'bien'), (${a}, ${ritaId}, ${hoy}::date, 2, 100, ${`${hoy}T18:30:00-05:00`}, 900, 'excelente')`;
  await db`INSERT INTO routine_completions (routine_id, client_id, completed_on, run_number, completion_percent, elapsed_seconds, difficulty) VALUES (${b}, ${ritaId}, ${hoy}::date, 1, 60, 600, 'dificil')`;
  ciclo = (await api.get(`/api/clients/${ritaId}/routine-cycle`)).datos.cycle;
  // ciclo anterior: una rutina enviada y vencida sin hacer
  const previo = (await api.get(`/api/clients/${ritaId}/routine-cycle?offset=-1`)).datos.cycle;
  const vieja = (await api.post('/api/routines', { title: 'Rutina vieja', sessionsPerWeek: 1, exercises: [{ name: 'Remo', sets: 3, reps: '10' }] })).datos.id;
  await db`INSERT INTO routine_assignments (routine_id, client_id, starts_on, due_on, active) VALUES (${vieja}, ${ritaId}, ${sumar(previo.start, 3)}::date, NULL, true)`;
  const enlace = await api.post(`/api/clients/${ritaId}/access-link`, {});
  const acceso = await api.post(`/api/auth/access-link/${String(enlace.datos.url).split('acceso=')[1]}`, { password: 'clave-del-portal-larga' });
  portalRita = acceso.datos.token;
  // otros clientes que NO deben salir en el resumen de todos: demo, inactivo y uno sin plan de rutinas
  await api.post('/api/clients', { fullName: 'Dani Demo', email: 'dani.inf@prueba.test', demo: true, cutoffDay: 1 });
  const inactivo = await api.post('/api/clients', { fullName: 'Ines Inactiva', email: 'ines.inf@prueba.test', cutoffDay: 1, planId });
  await db`UPDATE clients SET status = 'inactive' WHERE id = ${inactivo.datos.id}`;
  await api.post('/api/clients', { fullName: 'Nora Nueva', email: 'nora.inf@prueba.test', cutoffDay: 1, planId });   // plan de rutinas sin nada enviado todavía
  await api.post('/api/clients', { fullName: 'Pablo Presencial', email: 'pablo.inf@prueba.test', cutoffDay: 1 });
}, { timeout: 90_000 });
after(async () => { await db?.end({ timeout: 1 }).catch(() => {}); await server?.parar(); });

test('I1) CSV por ciclo: enviadas ≠ hechas, repeticiones y parciales cuentan, el vencido sin hacer sale en su ciclo', async () => {
  const res = await crudo(`/api/reports/routine-compliance.csv?clientId=${ritaId}&cycles=2`, (await api.post('/api/auth/login', { email: CREDENCIALES.email, password: CREDENCIALES.password })).datos.token);
  assert.equal(res.estado, 200); assert.match(res.tipo, /text\/csv/); assert.match(res.disposicion, /rutinas-rita-rutinas\.csv/);
  const [cabecera, previo, actual] = filas(res.cuerpo.toString('utf8'));
  assert.deepEqual(cabecera.slice(0, 6), ['Cliente', 'Inicio del ciclo', 'Fin del ciclo', 'Cupo', 'Enviadas', 'Hechas']);
  // ciclo anterior: 1 enviada, 0 hechas, 1 vencida
  assert.deepEqual([previo[4], previo[5], previo[9], previo[10]], ['1', '0', '1', '0']);
  // ciclo actual: cupo 4, 2 enviadas, 3 hechas (2 distintas, 1 repetida), cumplimiento 75 %, promedio 87 %, 2 completas, 1 parcial, 48 min
  assert.equal(actual[1], dmy(ciclo.start)); assert.equal(actual[2], dmy(ciclo.end));
  assert.deepEqual(actual.slice(3), ['4', '2', '3', '2', '1', '0', '0', '75', '87', '2', '1', '48']);
});

test('I2) CSV de detalle: fecha, hora real (sin inventar), evento, repetición, parcial y vencida', async () => {
  const token = (await api.post('/api/auth/login', { email: CREDENCIALES.email, password: CREDENCIALES.password })).datos.token;
  const res = await crudo(`/api/reports/routine-compliance.csv?clientId=${ritaId}&cycles=2&detail=1`, token);
  assert.equal(res.estado, 200);
  const todas = filas(res.cuerpo.toString('utf8')).slice(1);
  const hechas = todas.filter(f => f[4] === 'Hecha');
  assert.equal(hechas.length, 3); assert.equal(todas.filter(f => f[4] === 'Enviada').length, 3); assert.equal(todas.filter(f => f[4] === 'Vencida').length, 1);
  assert.deepEqual([hechas[0][3], hechas[0][5]], ['07:15', 'Fuerza A']); assert.match(hechas[0][6], /completa · 23 min · Bien/);
  assert.equal(hechas[1][3], '18:30'); assert.match(hechas[1][6], /repetición n\.º 2/);
  const parcial = hechas.find(f => /parcial \(60 %\)/.test(f[6]));
  assert.equal(parcial[3], '', 'una ejecución sin hora real no inventa una'); assert.match(parcial[6], /10 min · dificultad: Difícil/);
});

test('I3) resumen de todos: solo clientes con plan de rutinas activos y no demo, en su ciclo actual', async () => {
  const token = (await api.post('/api/auth/login', { email: CREDENCIALES.email, password: CREDENCIALES.password })).datos.token;
  const res = await crudo('/api/reports/routine-compliance.csv', token);
  const todas = filas(res.cuerpo.toString('utf8')).slice(1);
  assert.deepEqual(todas.map(f => f[0]), ['Nora Nueva', 'Rita Rutinas']);
  assert.deepEqual(todas[0].slice(3), ['4', '0', '0', '0', '0', '', ''], 'sin rutinas enviadas: sin % de cumplimiento (no es incumplimiento del cliente)');
  assert.deepEqual(todas[1].slice(3), ['4', '2', '3', '1', '0', '75', '87']);
});

test('I4) los PDF salen (entrenadora y cliente), el cliente solo ve el suyo y los rangos se validan', async () => {
  const token = (await api.post('/api/auth/login', { email: CREDENCIALES.email, password: CREDENCIALES.password })).datos.token;
  for (const ruta of [`/api/reports/routine-compliance.pdf?clientId=${ritaId}&cycles=3`, '/api/reports/routine-compliance.pdf']) {
    const pdf = await crudo(ruta, token);
    assert.equal(pdf.estado, 200, ruta); assert.match(pdf.tipo, /application\/pdf/); assert.equal(pdf.cuerpo.subarray(0, 5).toString(), '%PDF-');
    assert.ok(pdf.cuerpo.length > 1500, 'el documento trae contenido');
  }
  assert.match((await crudo(`/api/reports/routine-compliance.pdf?clientId=${ritaId}`, token)).disposicion, /rutinas-rita-rutinas\.pdf/);
  const mio = await crudo('/api/portal/reports/routine-compliance.pdf?cycles=3', portalRita);
  assert.equal(mio.estado, 200); assert.equal(mio.cuerpo.subarray(0, 5).toString(), '%PDF-'); assert.match(mio.disposicion, /mis-rutinas-rita-rutinas\.pdf/);
  assert.equal((await crudo('/api/portal/reports/routine-compliance.pdf', token)).estado, 403, 'la entrenadora no usa la ruta del portal');
  assert.equal((await crudo('/api/portal/reports/routine-compliance.pdf', 'token-invalido')).estado, 401);
  assert.equal((await crudo('/api/reports/routine-compliance.pdf?clientId=00000000-0000-0000-0000-000000000000', token)).estado, 404);
  assert.equal((await crudo(`/api/reports/routine-compliance.pdf?clientId=${ritaId}&cycles=0`, token)).estado, 400);
  assert.equal((await crudo(`/api/reports/routine-compliance.pdf?clientId=${ritaId}&cycles=13`, token)).estado, 400);
  assert.equal((await crudo('/api/reports/routine-compliance.pdf', '')).estado, 401);
});
