// Botones de los informes de rutinas en la aplicación real (expediente, informe general y portal), a 375 px y sin errores de JavaScript.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import postgres from 'postgres';
import { CREDENCIALES, SETUP_TOKEN, cliente, levantar } from './harness.mjs';
import { abrirPantalla, esperar } from './ui-harness.mjs';

process.env.TZ = 'America/Panama';

let servidor; let api; let db; let tokenStaff; let ritaId; let pedroId; let tokenRita; let tokenPedro;
const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Panama' }).format(new Date());

// Las descargas se anotan en vez de navegar (jsdom no implementa la navegación) y se anota cada petición.
const espiar = async p => {
  await p.evaluar("window.__descargas = []; window.__peticiones = []; window.downloadBlob = (blob, nombre) => { window.__descargas.push([nombre, blob.size]); }; const original = window.fetch; window.fetch = (u, o) => { window.__peticiones.push(String(u)); return original(u, o); };");
  // JSON: los arreglos de la ventana de jsdom son de otro "mundo" y deepEqual no los daría por iguales
  return { descargas: () => JSON.parse(p.evaluar('JSON.stringify(window.__descargas)')), peticiones: () => JSON.parse(p.evaluar('JSON.stringify(window.__peticiones)')) };
};
const portalToken = async clientId => {
  const enlace = await api.post(`/api/clients/${clientId}/access-link`, {});
  return (await api.post(`/api/auth/access-link/${String(enlace.datos.url).split('acceso=')[1]}`, { password: 'clave-del-portal-larga' })).datos.token;
};

before(async () => {
  servidor = await levantar(); api = cliente(servidor.base); db = postgres(servidor.databaseUrl, { onnotice: () => {}, max: 2 });
  await api.post('/api/auth/setup', CREDENCIALES, { 'x-setup-token': SETUP_TOKEN });
  tokenStaff = (await api.post('/api/auth/login', { email: CREDENCIALES.email, password: CREDENCIALES.password })).datos.token; api.usarToken(tokenStaff);
  const [dueno] = await db`SELECT id FROM users LIMIT 1`;
  const [plan] = await db`INSERT INTO service_plans (owner_id, name, billing_model, price, sessions_included, service_type, routines_per_month, active) VALUES (${dueno.id}, 'Rutinas UI informes', 'monthly', 0, NULL, 'rutinas', 3, true) RETURNING id`;
  ritaId = (await api.post('/api/clients', { fullName: 'Rita Informes', cutoffDay: 1, email: 'rita.rep@prueba.test', planId: plan.id })).datos.id;
  pedroId = (await api.post('/api/clients', { fullName: 'Pedro Presencial', cutoffDay: 1, email: 'pedro.rep@prueba.test' })).datos.id;
  const rutina = (await api.post('/api/routines', { title: 'Informe uno', sessionsPerWeek: 2, clientId: ritaId, exercises: [{ name: 'Plancha', sets: 3, reps: '10' }] })).datos.id;
  await db`INSERT INTO routine_completions (routine_id, client_id, completed_on, run_number, completion_percent, completed_at, elapsed_seconds) VALUES (${rutina}, ${ritaId}, ${hoy}::date, 1, 100, now(), 900)`;
  tokenRita = await portalToken(ritaId); tokenPedro = await portalToken(pedroId);
}, { timeout: 120_000 });
after(async () => { await db?.end({ timeout: 1 }).catch(() => {}); await servidor?.parar(); });

test('V1) en el expediente de un cliente de rutinas: ciclos, PDF, CSV por ciclo y CSV con detalle', async () => {
  const p = await abrirPantalla({ baseApi: servidor.base, token: tokenStaff, ancho: 375 });
  try {
    await esperar(() => p.evaluar('typeof clientDetail === "function" && data && data.clients && data.clients.length > 1'), { mensaje: 'clientes cargados' });
    p.evaluar(`clientDetail('${ritaId}')`);
    const seccion = await esperar(() => { const s = p.q('#client-routine-cycle .routine-report-actions'); return s && s.closest('#client-routine-cycle'); }, { mensaje: 'botones del informe' });
    const espia = await espiar(p);
    assert.deepEqual(p.qa('[data-routine-report]', seccion).map(b => b.dataset.routineReport), ['pdf', 'csv', 'detail']);
    p.cambiar(p.q('[data-routine-report-cycles]', seccion), '12');
    p.clic(p.q('[data-routine-report="pdf"]', seccion));
    await esperar(async () => (await espia.descargas()).length === 1, { mensaje: 'PDF descargado' });
    p.clic(p.q('[data-routine-report="csv"]', seccion));
    await esperar(async () => (await espia.descargas()).length === 2, { mensaje: 'CSV descargado' });
    p.clic(p.q('[data-routine-report="detail"]', seccion));
    await esperar(async () => (await espia.descargas()).length === 3, { mensaje: 'CSV con detalle descargado' });
    assert.deepEqual((await espia.descargas()).map(d => d[0]), ['informe-rutinas.pdf', 'informe-rutinas.csv', 'informe-rutinas-detalle.csv']);
    assert.ok((await espia.descargas()).every(d => d[1] > 100), 'los archivos traen contenido');
    const urls = (await espia.peticiones()).filter(u => u.includes('/api/reports/routine-compliance'));
    assert.ok(urls[0].includes(`.pdf?clientId=${ritaId}&cycles=12`), urls[0]); assert.ok(urls[2].includes('&detail=1'), urls[2]);
    assert.deepEqual(p.errores, [], 'errores de JavaScript en la pantalla');
  } finally { await p.cerrar(); }
});

test('V2) el informe general ofrece el resumen de todos los clientes de rutinas; un cliente sin plan de rutinas no lo ofrece', async () => {
  const p = await abrirPantalla({ baseApi: servidor.base, token: tokenStaff, ancho: 375 });
  try {
    await esperar(() => p.evaluar('typeof complianceReport === "function" && data && data.clients && data.clients.length > 1'), { mensaje: 'clientes cargados' });
    p.evaluar('complianceReport()');
    const bloque = await esperar(() => p.q('.routine-report-all'), { mensaje: 'bloque de rutinas en el informe general' });
    assert.deepEqual(p.qa('[data-routine-report]', bloque).map(b => b.dataset.routineReport), ['pdf', 'csv']);
    assert.equal(p.q('[data-routine-report-cycles]', bloque), null, 'el resumen de todos es del ciclo actual');
    const espia = await espiar(p);
    p.clic(p.q('[data-routine-report="csv"]', bloque));
    await esperar(async () => (await espia.descargas()).length === 1, { mensaje: 'CSV de todos descargado' });
    assert.ok((await espia.peticiones()).some(u => u.endsWith('/api/reports/routine-compliance.csv')), 'sin clientId ni ciclos');
    p.evaluar('modal.close()');
    p.evaluar(`complianceReport(data.clients.find(c => c.id === '${pedroId}'))`);
    await esperar(() => p.q('#report-run'), { mensaje: 'informe de un cliente' });
    assert.equal(p.q('.routine-report-all'), null, 'un cliente sin plan de rutinas no tiene informe de rutinas');
    assert.deepEqual(p.errores, [], 'errores de JavaScript en la pantalla');
  } finally { await p.cerrar(); }
});

test('V3) en "Mis informes" del portal: solo el cliente con plan de rutinas ve su informe, y baja el suyo', async () => {
  const p = await abrirPantalla({ baseApi: servidor.base, token: tokenRita, hash: '#portal-reports', ancho: 375 });
  try {
    const bloque = await esperar(() => p.q('#portal-routine-report'), { mensaje: 'informe de rutinas en el portal' });
    assert.deepEqual(p.qa('[data-routine-report]', bloque).map(b => b.dataset.routineReport), ['pdf']);
    const espia = await espiar(p);
    p.clic(p.q('[data-routine-report="pdf"]', bloque));
    await esperar(async () => (await espia.descargas()).length === 1, { mensaje: 'PDF del portal descargado' });
    assert.ok((await espia.peticiones()).some(u => u.includes('/api/portal/reports/routine-compliance.pdf?cycles=6')));
    assert.deepEqual(p.errores, [], 'errores de JavaScript en el portal');
  } finally { await p.cerrar(); }
  const q = await abrirPantalla({ baseApi: servidor.base, token: tokenPedro, hash: '#portal-reports', ancho: 375 });
  try {
    await esperar(() => q.q('#portal-reports-list'), { mensaje: 'portal sin plan de rutinas' });
    await q.quieta(600);
    assert.equal(q.q('#portal-routine-report'), null);
    assert.deepEqual(q.errores, []);
  } finally { await q.cerrar(); }
});
