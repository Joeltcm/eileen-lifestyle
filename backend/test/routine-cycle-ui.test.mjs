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

test('D) el portal del cliente muestra su ciclo con las mismas cifras, solo el suyo, a 375 px', async () => {
  const enlace = await api.post(`/api/clients/${clientId}/access-link`, {});
  const acceso = await api.post(`/api/auth/access-link/${String(enlace.datos.url).split('acceso=')[1]}`, { password: 'clave-del-portal-larga' });
  const tokenPortal = acceso.datos.token; const portal = cliente(servidor.base); portal.usarToken(tokenPortal);
  // API: el cliente ve su ciclo; Eileen y un cliente de otro plan no usan esta ruta
  const mio = await portal.get('/api/portal/routine-cycle');
  assert.equal(mio.estado, 200, JSON.stringify(mio.datos));
  assert.deepEqual([mio.datos.metrics.sent, mio.datos.metrics.done, mio.datos.metrics.repeats], [2, 3, 1]);
  assert.equal((await api.get('/api/portal/routine-cycle')).estado, 403, 'la entrenadora no usa la ruta del portal');
  const [otroPlan] = await db`INSERT INTO service_plans (owner_id, name, billing_model, price, sessions_included, service_type, active) SELECT owner_id, 'Presencial UI', 'monthly', 0, 8, 'presencial', true FROM service_plans LIMIT 1 RETURNING id`;
  const otro = (await api.post('/api/clients', { fullName: 'Pedro Presencial', cutoffDay: 1, email: 'pedro.ui@prueba.test', planId: otroPlan.id })).datos.id;
  const enlaceOtro = await api.post(`/api/clients/${otro}/access-link`, {});
  const accesoOtro = await api.post(`/api/auth/access-link/${String(enlaceOtro.datos.url).split('acceso=')[1]}`, { password: 'clave-del-portal-larga' });
  const portalOtro = cliente(servidor.base); portalOtro.usarToken(accesoOtro.datos.token);
  assert.equal((await portalOtro.get('/api/portal/routine-cycle')).estado, 409, 'un plan que no es de rutinas no tiene ciclo de rutinas');
  // pantalla
  const p = await abrirPantalla({ baseApi: servidor.base, token: tokenPortal, hash: '#portal-routines', ancho: 375 });
  try {
    const seccion = await esperar(() => p.q('#portal-routine-cycle .cycle-metrics') && p.q('#portal-routine-cycle'), { mensaje: 'ciclo en el portal' });
    const texto = seccion.textContent;
    assert.match(texto, /MI CICLO DE RUTINAS/); assert.match(texto, /Enviadas\s*2 de 3/); assert.match(texto, /Hechas\s*3/); assert.match(texto, /repetición n\.º 2/);
    assert.match(texto, /Tu próximo ciclo empieza el \d{2}-\d{2}-\d{4}/);
    assert.doesNotMatch(texto, /faltan por enviar/, 'el aviso de envío es solo para Eileen');
    // ciclo anterior: sin rutinas, mensaje amable
    p.clic(p.q('[data-cycle-step="-1"]', seccion));
    await esperar(() => /Ciclo cerrado/.test(p.q('#portal-routine-cycle').textContent), { mensaje: 'ciclo anterior del portal' });
    assert.deepEqual(p.errores, [], 'errores de JavaScript en el portal');
  } finally { await p.cerrar(); }
});

test('D2) ciclo nuevo sin rutinas enviadas: el cliente ve un mensaje claro y nada del ciclo anterior (decisión 11)', async () => {
  const p = await abrirPantalla({ baseApi: servidor.base, token: tokenStaff, ancho: 375 });
  try {
    await esperar(() => p.evaluar('typeof routineCycleMarkup === "function"'), { mensaje: 'función de la bitácora' });
    const informe = { state: 'no_routines_yet', today: '2030-03-01', cycle: { start: '2030-03-01', end: '2030-03-31', nextStart: '2030-04-01', offset: 0, isCurrent: true, closed: false },
      metrics: { quota: 3, sent: 0, done: 0, distinctDone: 0, repeats: 0, pending: 0, expired: 0, compliancePercent: 0, quality: { averagePercent: null, complete: 0, partial: 0, totalSeconds: 0, averageSeconds: null, feelings: {}, difficulties: {} } },
      timeline: [], days: [], next: { start: '2030-04-01', end: '2030-04-30', sent: 0, quota: 3 } };
    const cliente = p.evaluar(`routineCycleMarkup(${JSON.stringify(informe)}, 'client')`);
    assert.match(cliente, /Tu ciclo empezó el 01-03-2030 y Eileen aún no te ha enviado rutinas/);
    assert.doesNotMatch(cliente, /Repetir|cycle-event/);
    const eileen = p.evaluar(`routineCycleMarkup(${JSON.stringify(informe)}, 'trainer')`);
    assert.match(eileen, /Aún no hay rutinas enviadas para este ciclo/); assert.match(eileen, /faltan por enviar/);
    assert.deepEqual(p.errores, []);
  } finally { await p.cerrar(); }
});

test('el editor del cliente de rutinas llama "Rutinas esperadas por ciclo" a su cupo; el de otros planes no cambia', async () => {
  const p = await abrirPantalla({ baseApi: servidor.base, token: tokenStaff, ancho: 375 });
  try {
    await esperar(() => p.evaluar('typeof editClient === "function" && data && data.clients && data.clients.length > 0'), { mensaje: 'clientes cargados' });
    p.evaluar(`editClient(data.clients.find(c => c.id === '${clientId}'))`);
    const form = await esperar(() => p.q('#edit-client-form'), { mensaje: 'editor' });
    assert.match(form.textContent, /Rutinas esperadas por ciclo/); assert.match(form.textContent, /cupo contra el que se mide su cumplimiento/);
    assert.doesNotMatch(form.textContent, /Sesiones esperadas al mes/);
    assert.deepEqual(p.errores, []);
  } finally { await p.cerrar(); }
});
