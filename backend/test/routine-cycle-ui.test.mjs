// Pantalla de la bitácora del ciclo (Entregas B y D) en la aplicación real, a 375 px y sin errores de JavaScript.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import postgres from 'postgres';
import { CREDENCIALES, SETUP_TOKEN, cliente, levantar } from './harness.mjs';
import { abrirPantalla, esperar } from './ui-harness.mjs';

process.env.TZ = 'America/Panama';

let servidor; let api; let db; let tokenStaff; let clientId; let routineA; let routineB;
const panama = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Panama', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

before(async () => {
  servidor = await levantar(); api = cliente(servidor.base); db = postgres(servidor.databaseUrl, { onnotice: () => {}, max: 2 });
  await api.post('/api/auth/setup', CREDENCIALES, { 'x-setup-token': SETUP_TOKEN });
  tokenStaff = (await api.post('/api/auth/login', { email: CREDENCIALES.email, password: CREDENCIALES.password })).datos.token; api.usarToken(tokenStaff);
  const [dueno] = await db`SELECT id FROM users LIMIT 1`;
  const [plan] = await db`INSERT INTO service_plans (owner_id, name, billing_model, price, sessions_included, service_type, routines_per_month, active) VALUES (${dueno.id}, 'Rutinas UI', 'monthly', 0, NULL, 'rutinas', 3, true) RETURNING id`;
  clientId = (await api.post('/api/clients', { fullName: 'Rita Rutinas', cutoffDay: 1, email: 'rita.ui@prueba.test', planId: plan.id })).datos.id;
  const crear = async title => (await api.post('/api/routines', { title, sessionsPerWeek: 2, clientId, confirmQuota: true, exercises: [{ name: title, sets: 3, reps: '10' }] })).datos.id;
  routineA = await crear('Fuerza A'); routineB = await crear('Movilidad B');
  const hoy = panama();
  await db`INSERT INTO routine_completions (routine_id, client_id, completed_on, run_number, completion_percent, completed_at, elapsed_seconds, feeling) VALUES (${routineA}, ${clientId}, ${hoy}::date, 1, 100, now(), 1500, 'bien'), (${routineA}, ${clientId}, ${hoy}::date, 2, 100, now() + interval '1 minute', 900, 'excelente')`;
  await db`INSERT INTO routine_completions (routine_id, client_id, completed_on, run_number, completion_percent, elapsed_seconds) VALUES (${routineB}, ${clientId}, ${hoy}::date, 1, 60, 600)`;
}, { timeout: 120_000 });
after(async () => { await db?.end({ timeout: 1 }).catch(() => {}); await servidor?.parar(); });

test('el expediente de un cliente de rutinas muestra enviadas, hechas, repeticiones y parciales a 375 px', async () => {
  const p = await abrirPantalla({ baseApi: servidor.base, token: tokenStaff, ancho: 375 });
  try {
    await esperar(() => p.evaluar('typeof clientDetail === "function" && data && data.clients && data.clients.length > 0'), { mensaje: 'clientes cargados' });
    p.evaluar(`clientDetail('${clientId}')`);
    const seccion = await esperar(() => p.q('#client-routine-cycle .cycle-metrics') && p.q('#client-routine-cycle'), { mensaje: 'bitácora del ciclo' });
    const texto = seccion.textContent;
    assert.match(texto, /Enviadas\s*2 de 3/, 'enviadas contra el cupo');
    assert.match(texto, /Hechas\s*3/, 'hechas cuenta repeticiones y parciales');
    assert.match(texto, /2 distintas · 1 repetida/);
    assert.match(texto, /Cumplimiento\s*100 %/);
    assert.match(texto, /1 completa|2 completas/); assert.match(texto, /1 parcial/);
    assert.match(texto, /repetición n\.º 2/); assert.match(texto, /parcial \(60 %\)/);
    assert.match(texto, /\d{2}-\d{2}-\d{4}/, 'fechas dd-mm-aaaa');
    assert.match(texto, /Próximo ciclo desde .* 0 de 3 rutinas asignadas \(faltan por enviar\)/);
    // el ciclo anterior se abre y no hay errores
    p.clic(p.q('[data-cycle-step="-1"]', seccion));
    await esperar(() => /Ciclo cerrado/.test(p.q('#client-routine-cycle').textContent), { mensaje: 'ciclo anterior' });
    assert.match(p.q('#client-routine-cycle').textContent, /Aún no hay rutinas enviadas|Enviadas\s*0/);
    assert.deepEqual(p.errores, [], 'errores de JavaScript en la pantalla');
  } finally { await p.cerrar(); }
});
