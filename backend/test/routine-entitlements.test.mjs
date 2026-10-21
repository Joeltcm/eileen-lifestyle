// Rutinas sueltas: Eileen vende 1 o un grupo de rutinas con una ventana desde-hasta, como una venta puntual (como la clase suelta).
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import postgres from 'postgres';
import { CREDENCIALES, SETUP_TOKEN, cliente, levantar } from './harness.mjs';

let server; let api; let db; let ownerId; let rutinasPlanId;
const panamaToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Panama', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const sumar = (valor, dias) => { const d = new Date(`${valor}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + dias); return d.toISOString().slice(0, 10); };
const hoy = panamaToday();

before(async () => {
  server = await levantar(); api = cliente(server.base); db = postgres(server.databaseUrl, { onnotice: () => {} });
  const setup = await api.post('/api/auth/setup', CREDENCIALES, { 'x-setup-token': SETUP_TOKEN });
  api.usarToken(setup.datos.token);
  ownerId = (await db`SELECT id FROM users WHERE email = ${CREDENCIALES.email}`)[0].id;
  [{ id: rutinasPlanId }] = await db`INSERT INTO service_plans (owner_id, name, billing_model, price, sessions_included, service_type, routines_per_month, active) VALUES (${ownerId}, 'Rutinas', 'monthly', 0, NULL, 'rutinas', 1, true) RETURNING id`;
}, { timeout: 90_000 });
after(async () => { await db?.end({ timeout: 1 }).catch(() => {}); await server?.parar(); });

let contador = 0;
const nuevoCliente = async (nombre, extra = {}) => {
  contador += 1;
  const alta = await api.post('/api/clients', { fullName: nombre, email: `suelta${contador}@prueba.test`, cutoffDay: 1, ...extra });
  assert.equal(alta.estado, 201, JSON.stringify(alta.datos));
  return alta.datos.id;
};
const venta = (clientId, extra = {}) => api.post(`/api/clients/${clientId}/routine-entitlements`, { quantity: 3, unitAmount: 15, availableFrom: hoy, availableUntil: sumar(hoy, 30), ...extra });
const asignar = (clientId, title, extra = {}) => api.post('/api/routines', { title, sessionsPerWeek: 2, clientId, exercises: [{ name: title, sets: 3, reps: '10' }], ...extra });
const portalDe = async clientId => {
  const enlace = await api.post(`/api/clients/${clientId}/access-link`, {});
  const acceso = await api.post(`/api/auth/access-link/${String(enlace.datos.url).split('acceso=')[1]}`, { password: 'clave-del-portal-larga' });
  const portal = cliente(server.base); portal.usarToken(acceso.datos.token); return portal;
};

test('S1) la venta crea el bono y su factura puntual "rutina_suelta"; cortesía sin factura; demo y ventanas vencidas se rechazan', async () => {
  const clientId = await nuevoCliente('Cliente sin plan');
  const res = await venta(clientId, { notes: 'Prueba' });
  assert.equal(res.estado, 201, JSON.stringify(res.datos));
  assert.equal(res.datos.invoice.total, 45); assert.match(res.datos.invoice.code, /^FAC-\d{4}$/);
  const [factura] = await db`SELECT kind, total::float AS total, origin, cycle_start::text AS cycle_start, cycle_end::text AS cycle_end FROM billing_invoices WHERE id = ${res.datos.invoice.id}`;
  assert.deepEqual([factura.kind, factura.total, factura.origin, factura.cycle_start, factura.cycle_end], ['rutina_suelta', 45, 'manual', hoy, hoy]);
  const [linea] = await db`SELECT description, quantity::float AS quantity, unit_amount::float AS unit_amount, amount::float AS amount FROM billing_invoice_lines WHERE invoice_id = ${res.datos.invoice.id}`;
  assert.match(linea.description, /^Rutinas sueltas · 3 · del \d{2}-\d{2}-\d{4} al \d{2}-\d{2}-\d{4}$/);
  assert.deepEqual([linea.quantity, linea.unit_amount, linea.amount], [3, 15, 45]);
  const lista = (await api.get(`/api/clients/${clientId}/routine-entitlements`)).datos;
  assert.equal(lista.length, 1);
  assert.deepEqual([lista[0].status, lista[0].quantity, lista[0].sent, lista[0].remaining, lista[0].done], ['active', 3, 0, 3, 0]);
  assert.equal(lista[0].invoice.code, res.datos.invoice.code);
  // dos ventas el mismo día no chocan (factura puntual)
  assert.equal((await venta(clientId, { quantity: 1 })).estado, 201);
  // cortesía: sin importe no hay factura
  const gratis = await venta(clientId, { unitAmount: 0 });
  assert.equal(gratis.estado, 201); assert.equal(gratis.datos.invoice, null);
  // sin facturar aunque haya precio
  assert.equal((await venta(clientId, { invoice: false })).datos.invoice, null);
  // ventana vencida o invertida
  assert.equal((await venta(clientId, { availableFrom: sumar(hoy, -10), availableUntil: sumar(hoy, -1) })).estado, 400);
  assert.equal((await venta(clientId, { availableFrom: hoy, availableUntil: sumar(hoy, -1) })).estado, 400);
  assert.equal((await venta(clientId, { availableUntil: sumar(hoy, 800) })).estado, 400);
  // demo: no admite ventas
  const demo = await api.post('/api/clients', { fullName: 'Cliente demo', email: 'demo.suelta@prueba.test', demo: true, cutoffDay: 1 });
  assert.equal(demo.estado, 201, JSON.stringify(demo.datos));
  assert.equal((await venta(demo.datos.id)).estado, 409);
  assert.equal((await api.get('/api/clients/00000000-0000-0000-0000-000000000000/routine-entitlements')).estado, 404);
});

test('S2) asignar "con cargo al bono": la ventana manda, el cupo es lo vendido y se confirma el exceso', async () => {
  const clientId = await nuevoCliente('Cliente ventana');
  const futuro = sumar(hoy, 3); const hasta = sumar(hoy, 20);
  const bono = (await venta(clientId, { quantity: 2, availableFrom: futuro, availableUntil: hasta })).datos;
  const lista = (await api.get(`/api/clients/${clientId}/routine-entitlements`)).datos;
  assert.equal(lista[0].status, 'upcoming');
  const e = lista[0].id;
  const primera = await asignar(clientId, 'Suelta A', { entitlementId: e, dueOn: sumar(hoy, 60) });
  assert.equal(primera.estado, 201, JSON.stringify(primera.datos));
  assert.equal(primera.datos.assignment_due_on_adjusted, true, 'una fecha más allá de la ventana se ajusta');
  const [a1] = await db`SELECT starts_on::text AS starts_on, due_on::text AS due_on, entitlement_id::text AS entitlement_id FROM routine_assignments WHERE routine_id = ${primera.datos.id}`;
  assert.deepEqual([a1.starts_on, a1.due_on, a1.entitlement_id], [futuro, hasta, e], 'empieza cuando abre la ventana y termina cuando cierra');
  assert.equal((await asignar(clientId, 'Suelta B', { entitlementId: e })).estado, 201);
  const tercera = await asignar(clientId, 'Suelta C', { entitlementId: e });
  assert.equal(tercera.estado, 409); assert.equal(tercera.datos.code, 'quota_reached'); assert.equal(tercera.datos.quota, 2); assert.equal(tercera.datos.assigned, 2);
  assert.equal((await asignar(clientId, 'Suelta C', { entitlementId: e, confirmQuota: true })).estado, 201);
  // no se puede dejar el bono con menos de lo ya enviado
  const menos = await api.patch(`/api/routine-entitlements/${e}`, { quantity: 2 });
  assert.equal(menos.estado, 409, JSON.stringify(menos.datos));
  // ampliar la ventana alcanza las rutinas ya enviadas
  const nueva = sumar(hoy, 40);
  const ampliado = await api.patch(`/api/routine-entitlements/${e}`, { availableUntil: nueva, quantity: 5 });
  assert.equal(ampliado.estado, 200, JSON.stringify(ampliado.datos));
  assert.deepEqual([ampliado.datos.availableUntil, ampliado.datos.quantity, ampliado.datos.sent], [nueva, 5, 3]);
  assert.equal((await db`SELECT count(*)::int AS n FROM routine_assignments WHERE entitlement_id = ${e} AND due_on = ${nueva}::date`)[0].n, 3);
  // bono ajeno o inexistente
  const otro = await nuevoCliente('Otro cliente');
  assert.equal((await asignar(otro, 'Robada', { entitlementId: e })).estado, 409);
  assert.equal((await asignar(clientId, 'Inexistente', { entitlementId: '00000000-0000-0000-0000-000000000000' })).estado, 409);
});

test('S3) el cliente ve las rutinas solo dentro de la ventana y puede repetirlas; lo contado queda en el bono', async () => {
  const clientId = await nuevoCliente('Cliente portal');
  const bono = (await venta(clientId, { quantity: 2 })).datos;
  const e = (await api.get(`/api/clients/${clientId}/routine-entitlements`)).datos[0].id;
  const suelta = (await asignar(clientId, 'Portal suelta', { entitlementId: e })).datos.id;
  const normal = (await asignar(clientId, 'Portal normal sin bono')).datos.id;
  const portal = await portalDe(clientId);
  let resumen = (await portal.get('/api/portal/summary')).datos;
  assert.deepEqual(resumen.routines.map(r => r.title).sort(), ['Portal normal sin bono', 'Portal suelta']);
  // hacerla dos veces el mismo día: la repetición está permitida dentro de la ventana
  const hecha = await portal.post('/api/portal/routine-completions', { routineId: suelta, completedOn: hoy, completionPercent: 100 });
  assert.equal(hecha.estado, 201, JSON.stringify(hecha.datos));
  const repetida = await portal.post('/api/portal/routine-completions', { routineId: suelta, completedOn: hoy, completionPercent: 60 });
  assert.equal(repetida.estado, 201, JSON.stringify(repetida.datos));
  const runs = await db`SELECT run_number, completion_percent, assignment_id::text AS assignment_id FROM routine_completions WHERE routine_id = ${suelta} ORDER BY run_number`;
  assert.deepEqual(runs.map(r => [r.run_number, r.completion_percent]), [[1, 100], [2, 60]]);
  assert.ok(runs.every(r => r.assignment_id), 'cada ejecución queda ligada a su asignación con cargo al bono');
  // la rutina normal de un cliente sin plan de rutinas sigue como antes: una ejecución al día
  await portal.post('/api/portal/routine-completions', { routineId: normal, completedOn: hoy, completionPercent: 100 });
  await portal.post('/api/portal/routine-completions', { routineId: normal, completedOn: hoy, completionPercent: 50 });
  assert.equal((await db`SELECT count(*)::int AS n FROM routine_completions WHERE routine_id = ${normal}`)[0].n, 1);
  const stats = (await api.get(`/api/clients/${clientId}/routine-entitlements`)).datos[0];
  assert.deepEqual([stats.sent, stats.done, stats.distinctDone, stats.repeats, stats.remaining], [1, 2, 1, 1, 1]);
  // lo que ve el cliente de su bono: ventana y cuenta, sin importes
  const suyos = await portal.get('/api/portal/routine-entitlements');
  assert.equal(suyos.estado, 200);
  assert.deepEqual(Object.keys(suyos.datos[0]).includes('invoice') || Object.keys(suyos.datos[0]).includes('unitAmount'), false);
  assert.deepEqual([suyos.datos[0].quantity, suyos.datos[0].done, suyos.datos[0].status], [2, 2, 'active']);
  assert.equal((await api.get('/api/portal/routine-entitlements')).estado, 403);
  // terminó la ventana: ya no se ve ni se puede hacer; la normal sigue ahí
  await db`UPDATE routine_entitlements SET available_from = ${sumar(hoy, -10)}::date, available_until = ${sumar(hoy, -1)}::date WHERE id = ${e}`;
  await db`UPDATE routine_assignments SET due_on = ${sumar(hoy, -1)}::date, starts_on = ${sumar(hoy, -10)}::date WHERE entitlement_id = ${e}`;
  resumen = (await portal.get('/api/portal/summary')).datos;
  assert.deepEqual(resumen.routines.map(r => r.title), ['Portal normal sin bono']);
  const tarde = await portal.post('/api/portal/routine-completions', { routineId: suelta, completedOn: hoy, completionPercent: 100 });
  assert.equal(tarde.estado, 404, 'vencida: no se puede completar');
  assert.equal((await api.get(`/api/clients/${clientId}/routine-entitlements`)).datos[0].status, 'expired');
});

test('S4) el enlace público de una rutina suelta respeta la ventana y permite repetir', async () => {
  const clientId = await nuevoCliente('Cliente enlace');
  await venta(clientId, { quantity: 1 });
  const e = (await api.get(`/api/clients/${clientId}/routine-entitlements`)).datos[0].id;
  const rutina = (await asignar(clientId, 'Enlace suelta', { entitlementId: e })).datos.id;
  const enlace = await api.post(`/api/routines/${rutina}/share-links`, { clientId, hours: 48, confirmRepeat: true });
  assert.equal(enlace.estado, 201, JSON.stringify(enlace.datos));
  const token = String(enlace.datos.url).split('#rutina=')[1];
  const publico = cliente(server.base);
  const vista = await publico.get(`/api/public/routine/${token}`);
  assert.equal(vista.estado, 200, JSON.stringify(vista.datos)); assert.equal(vista.datos.repeatable, true);
  assert.equal((await publico.post(`/api/public/routine/${token}/complete`, { completionPercent: 100 })).estado, 200);
  assert.equal((await publico.post(`/api/public/routine/${token}/complete`, { completionPercent: 100 })).estado, 200);
  assert.equal((await db`SELECT count(*)::int AS n FROM routine_completions WHERE routine_id = ${rutina} AND via_link`)[0].n, 2, 'dos ejecuciones por enlace');
  await db`UPDATE routine_entitlements SET available_until = ${sumar(hoy, -1)}::date, available_from = ${sumar(hoy, -5)}::date WHERE id = ${e}`;
  await db`UPDATE routine_assignments SET due_on = ${sumar(hoy, -1)}::date, starts_on = ${sumar(hoy, -5)}::date WHERE entitlement_id = ${e}`;
  const vencido = await publico.get(`/api/public/routine/${token}`);
  assert.equal(vencido.estado, 410, 'enlace de una ventana terminada');
});

test('S5) anular el bono, o anular su factura, quita las rutinas; un bono no toca el cupo ni la bitácora del ciclo de un plan de rutinas', async () => {
  const a = await nuevoCliente('Cliente anula');
  const ventaA = (await venta(a)).datos;
  const ea = (await api.get(`/api/clients/${a}/routine-entitlements`)).datos[0].id;
  await asignar(a, 'Anulable', { entitlementId: ea });
  const cancel = await api.post(`/api/routine-entitlements/${ea}/cancel`, {});
  assert.equal(cancel.estado, 200, JSON.stringify(cancel.datos)); assert.equal(cancel.datos.invoice.code, ventaA.invoice.code);
  assert.equal((await db`SELECT count(*)::int AS n FROM routine_assignments WHERE entitlement_id = ${ea} AND active`)[0].n, 0);
  assert.equal((await api.post(`/api/routine-entitlements/${ea}/cancel`, {})).estado, 409);
  assert.equal((await asignar(a, 'Tarde', { entitlementId: ea })).estado, 409, 'un bono anulado no recibe rutinas');
  // anular la factura anula el bono
  const b = await nuevoCliente('Cliente anula factura');
  const ventaB = (await venta(b)).datos; const eb = (await api.get(`/api/clients/${b}/routine-entitlements`)).datos[0].id;
  await asignar(b, 'Con factura', { entitlementId: eb });
  const anulada = await api.post(`/api/billing/invoices/${ventaB.invoice.id}/void`, { reason: 'Cobrada por error' });
  assert.equal(anulada.estado, 200, JSON.stringify(anulada.datos));
  assert.equal((await db`SELECT status FROM routine_entitlements WHERE id = ${eb}`)[0].status, 'cancelled');
  assert.equal((await db`SELECT count(*)::int AS n FROM routine_assignments WHERE entitlement_id = ${eb} AND active`)[0].n, 0);
  // un plan de rutinas con cupo 1 por ciclo: el bono no cuenta contra su cupo ni aparece en su bitácora
  const r = await nuevoCliente('Cliente de rutinas', { planId: rutinasPlanId });
  await venta(r, { quantity: 2 });
  const er = (await api.get(`/api/clients/${r}/routine-entitlements`)).datos[0].id;
  assert.equal((await asignar(r, 'Del plan 1')).estado, 201);
  assert.equal((await asignar(r, 'Con cargo al bono', { entitlementId: er })).estado, 201, 'el cupo del ciclo (1) ya está lleno, pero el bono vive aparte');
  assert.equal((await asignar(r, 'Del plan 2')).estado, 409, 'el cupo del ciclo sigue contando solo lo del plan');
  const ciclo = (await api.get(`/api/clients/${r}/routine-cycle`)).datos;
  assert.equal(ciclo.metrics.sent, 1, 'la bitácora del ciclo no cuenta lo del bono');
});

test('S6) la migración 075 se revierte con orden expresa (sus facturas pasan a "manual") y se vuelve a aplicar', async () => {
  const down = await readFile(new URL('../migrations-down/075_routine_entitlements.down.sql', import.meta.url), 'utf8');
  const up = await readFile(new URL('../migrations/075_routine_entitlements.sql', import.meta.url), 'utf8');
  const definicion = async () => (await db`SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conname = 'billing_invoices_kind_check'`)[0].def;
  assert.match(await definicion(), /rutina_suelta/);
  const antes = (await db`SELECT count(*)::int AS n FROM billing_invoices WHERE kind = 'rutina_suelta'`)[0].n;
  assert.ok(antes > 0);
  const conexion = await db.reserve();   // las reversas llevan su propio BEGIN/COMMIT: necesitan una conexión reservada
  try {
    await assert.rejects(() => conexion.unsafe(down), /exige orden expresa/);
    await conexion.unsafe('ROLLBACK');
    await conexion.unsafe(`SET billing.allow_destructive_down = 'on'`);
    await conexion.unsafe(down);
    await conexion.unsafe('RESET billing.allow_destructive_down');
  } finally { conexion.release(); }
  assert.equal((await db`SELECT to_regclass('routine_entitlements') AS t`)[0].t, null);
  assert.doesNotMatch(await definicion(), /rutina_suelta/);
  assert.equal((await db`SELECT count(*)::int AS n FROM billing_invoices WHERE kind = 'rutina_suelta'`)[0].n, 0);
  assert.equal((await db`SELECT count(*)::int AS n FROM billing_invoices WHERE kind = 'manual'`)[0].n, antes, 'las facturas no se pierden: pasan a "manual"');
  await db.unsafe(up);
  assert.ok((await db`SELECT to_regclass('routine_entitlements') AS t`)[0].t);
  assert.match(await definicion(), /rutina_suelta/);
});
