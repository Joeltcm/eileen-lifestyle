// Rutinas hechas en el calendario general: endpoint del rango y marcas en las vistas de día, semana y mes (375 px).
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import postgres from 'postgres';
import { CREDENCIALES, SETUP_TOKEN, cliente, levantar } from './harness.mjs';
import { abrirPantalla, esperar } from './ui-harness.mjs';

process.env.TZ = 'America/Panama';

let servidor; let api; let db; let tokenStaff; let clientId; let rutinaA; let rutinaB; let dia;
const panama = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Panama', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const sumar = (valor, dias) => { const d = new Date(`${valor}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + dias); return d.toISOString().slice(0, 10); };

before(async () => {
  servidor = await levantar(); api = cliente(servidor.base); db = postgres(servidor.databaseUrl, { onnotice: () => {}, max: 2 });
  await api.post('/api/auth/setup', CREDENCIALES, { 'x-setup-token': SETUP_TOKEN });
  tokenStaff = (await api.post('/api/auth/login', { email: CREDENCIALES.email, password: CREDENCIALES.password })).datos.token; api.usarToken(tokenStaff);
  const [dueno] = await db`SELECT id FROM users LIMIT 1`;
  const [plan] = await db`INSERT INTO service_plans (owner_id, name, billing_model, price, sessions_included, service_type, routines_per_month, active) VALUES (${dueno.id}, 'Rutinas calendario', 'monthly', 0, NULL, 'rutinas', 4, true) RETURNING id`;
  clientId = (await api.post('/api/clients', { fullName: 'Rita Rutinas', cutoffDay: 1, email: 'rita.cal@prueba.test', planId: plan.id })).datos.id;
  const crear = async title => (await api.post('/api/routines', { title, sessionsPerWeek: 2, clientId, confirmQuota: true, exercises: [{ name: title, sets: 3, reps: '10' }] })).datos.id;
  rutinaA = await crear('Fuerza A'); rutinaB = await crear('Movilidad B');
  dia = panama();
  await db`INSERT INTO routine_completions (routine_id, client_id, completed_on, run_number, completion_percent, completed_at, elapsed_seconds) VALUES (${rutinaA}, ${clientId}, ${dia}::date, 1, 100, ${`${dia}T07:15:00-05:00`}, 1380), (${rutinaA}, ${clientId}, ${dia}::date, 2, 100, ${`${dia}T18:30:00-05:00`}, 900)`;
  await db`INSERT INTO routine_completions (routine_id, client_id, completed_on, run_number, completion_percent, elapsed_seconds) VALUES (${rutinaB}, ${clientId}, ${dia}::date, 1, 60, 600)`;
  await db`INSERT INTO routine_completions (routine_id, client_id, completed_on, run_number, completion_percent) VALUES (${rutinaB}, ${clientId}, ${sumar(dia, -1)}::date, 1, 0)`;
  await db`INSERT INTO routine_completions (routine_id, client_id, completed_on, run_number, completion_percent, completed_at) VALUES (${rutinaB}, ${clientId}, ${sumar(dia, -40)}::date, 1, 100, now())`;
}, { timeout: 120_000 });
after(async () => { await db?.end({ timeout: 1 }).catch(() => {}); await servidor?.parar(); });

test('R1) el rango devuelve solo ejecuciones con más de 0 %, con fecha y hora de Panamá, y exige sesión y un rango razonable', async () => {
  const res = await api.get(`/api/routine-runs?from=${sumar(dia, -3)}&to=${dia}`);
  assert.equal(res.estado, 200, JSON.stringify(res.datos));
  assert.equal(res.datos.length, 3, 'las tres de hoy; no la de 0 % ni la de hace 40 días');
  const [primera, segunda, parcial] = res.datos;
  assert.deepEqual([primera.clientName, primera.routineTitle, primera.date, primera.runNumber, primera.percent], ['Rita Rutinas', 'Fuerza A', dia, 1, 100]);
  assert.equal(new Date(primera.at).toISOString(), new Date(`${dia}T07:15:00-05:00`).toISOString());
  assert.deepEqual([segunda.runNumber, segunda.percent], [2, 100]);
  assert.deepEqual([parcial.percent, parcial.at], [60, null], 'sin hora real no se inventa una');
  assert.equal(parcial.seconds, 600);
  assert.equal((await api.get(`/api/routine-runs?from=${sumar(dia, -100)}&to=${dia}`)).estado, 400, 'rango de más de 62 días');
  assert.equal((await api.get(`/api/routine-runs?from=${dia}&to=${sumar(dia, -1)}`)).estado, 400, 'rango invertido');
  assert.equal((await cliente(servidor.base).get(`/api/routine-runs?from=${dia}&to=${dia}`)).estado, 401);
});

test('R2) el calendario marca las rutinas hechas en día, semana, mes y en la lista del día', async () => {
  const p = await abrirPantalla({ baseApi: servidor.base, token: tokenStaff, hash: '#calendar', ancho: 375 });
  try {
    await esperar(() => p.evaluar('typeof renderCalendar === "function" && data && data.clients && data.clients.length > 0'), { mensaje: 'aplicación cargada' });
    p.evaluar(`calendarCursor = new Date('${dia}T12:00:00'); calendarMode = 'week'; renderCalendar()`);
    const chips = await esperar(() => { const c = p.qa('.session-chip.rutina-hecha'); return c.length === 3 && c; }, { mensaje: 'marcas de la semana' });
    assert.match(chips[0].textContent, /07:15.*✓ Rita/); assert.match(chips[1].textContent, /18:30/);
    assert.match(chips[2].textContent, /✓ Rita/); assert.doesNotMatch(chips[2].textContent, /\d{2}:\d{2}/, 'la parcial sin hora no inventa una');
    assert.match(chips[2].getAttribute('title'), /parcial \(60 %\)/); assert.match(chips[1].getAttribute('title'), /repetición n\.º 2/);
    // lista del día (la que usa Eileen para marcar asistencia)
    const lista = await esperar(() => p.q('#session-list .routine-runs-day'), { mensaje: 'lista del día' });
    assert.match(lista.textContent, /RUTINAS HECHAS ESTE DÍA/); assert.match(lista.textContent, /Fuerza A/); assert.match(lista.textContent, /Movilidad B/);
    assert.match(p.q('#session-control-copy').textContent, /3 rutinas hechas/);
    // día
    p.evaluar("calendarMode = 'day'; renderCalendar()");
    const lineas = p.qa('.day-timeline .day-session.rutina-hecha');
    assert.equal(lineas.length, 3); assert.match(lineas[0].textContent, /07:15.*Rita Rutinas.*Fuerza A.*Rutina hecha · completa/);
    assert.match(lineas[2].textContent, /✓.*parcial \(60 %\)/);
    // mes
    p.evaluar("calendarMode = 'month'; renderCalendar()");
    assert.match(p.q('.month-routine').textContent, /✓ 3 rutinas/);
    assert.deepEqual(p.errores, [], 'errores de JavaScript en la pantalla');
  } finally { await p.cerrar(); }
});
