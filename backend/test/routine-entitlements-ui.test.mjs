// Rutinas sueltas en la aplicación real, a 375 px y sin errores de JavaScript: venta, asignación con cargo al bono, anulación y portal.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import postgres from 'postgres';
import { CREDENCIALES, SETUP_TOKEN, cliente, levantar } from './harness.mjs';
import { abrirPantalla, esperar } from './ui-harness.mjs';

process.env.TZ = 'America/Panama';

let servidor; let api; let db; let tokenStaff; let clientId; let bonoId; let rutinaId;
const panama = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Panama' }).format(new Date());
const sumar = (valor, dias) => { const d = new Date(`${valor}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + dias); return d.toISOString().slice(0, 10); };
const hoy = panama();

before(async () => {
  servidor = await levantar(); api = cliente(servidor.base); db = postgres(servidor.databaseUrl, { onnotice: () => {}, max: 2 });
  await api.post('/api/auth/setup', CREDENCIALES, { 'x-setup-token': SETUP_TOKEN });
  tokenStaff = (await api.post('/api/auth/login', { email: CREDENCIALES.email, password: CREDENCIALES.password })).datos.token; api.usarToken(tokenStaff);
  clientId = (await api.post('/api/clients', { fullName: 'Sofía Suelta', cutoffDay: 1, email: 'sofia.suelta@prueba.test' })).datos.id;
  await api.post('/api/clients', { fullName: 'Pedro Sin Bonos', cutoffDay: 1, email: 'pedro.nobonos@prueba.test' });
  await api.post(`/api/clients/${clientId}/routine-entitlements`, { quantity: 3, unitAmount: 15, availableFrom: hoy, availableUntil: sumar(hoy, 30) });
  bonoId = (await api.get(`/api/clients/${clientId}/routine-entitlements`)).datos[0].id;
  rutinaId = (await api.post('/api/routines', { title: 'Suelta uno', sessionsPerWeek: 2, clientId, entitlementId: bonoId, exercises: [{ name: 'Plancha', sets: 3, reps: '10' }] })).datos.id;
}, { timeout: 120_000 });
after(async () => { await db?.end({ timeout: 1 }).catch(() => {}); await servidor?.parar(); });

test('U1) el expediente muestra el bono, vende uno nuevo con su total y lo anula', async () => {
  const p = await abrirPantalla({ baseApi: servidor.base, token: tokenStaff, ancho: 375 });
  try {
    await esperar(() => p.evaluar('typeof clientDetail === "function" && data && data.clients && data.clients.length > 1'), { mensaje: 'clientes cargados' });
    p.evaluar(`clientDetail('${clientId}')`);
    const seccion = await esperar(() => { const s = p.q('#client-routine-entitlements'); return s && s.querySelector('.entitlement-card') && s; }, { mensaje: 'rutinas sueltas del expediente' });
    assert.match(seccion.textContent, /3 rutinas sueltas/); assert.match(seccion.textContent, /Vigente/);
    assert.match(seccion.textContent, /Enviadas 1 de 3/); assert.match(seccion.textContent, /Por enviar 2/);
    assert.match(seccion.textContent, /FAC-\d{4} · \$45\.00/); assert.match(seccion.textContent, /\d{2}-\d{2}-\d{4}/);
    assert.ok(p.q('#sell-routines', seccion));
    // vender: 2 rutinas a $10 → total $20
    p.clic(p.q('#sell-routines', seccion));
    const form = await esperar(() => p.q('#entitlement-form'), { mensaje: 'formulario de venta' });
    p.cambiar(form.elements.quantity, '2'); p.cambiar(form.elements.unitAmount, '10');
    assert.match(p.q('#entitlement-total').textContent, /Total: \$20\.00/);
    form.dispatchEvent(new p.window.Event('submit', { bubbles: true, cancelable: true }));
    await esperar(async () => (await api.get(`/api/clients/${clientId}/routine-entitlements`)).datos.length === 2, { mensaje: 'venta registrada' });
    const nueva = (await api.get(`/api/clients/${clientId}/routine-entitlements`)).datos.find(item => item.quantity === 2);
    assert.equal(nueva.invoice.total, 20);
    // el expediente vuelve a abrirse con las dos ventas y se puede anular una
    const seccion2 = await esperar(() => { const s = p.q('#client-routine-entitlements'); return s && s.querySelectorAll('.entitlement-card').length === 2 && s; }, { mensaje: 'dos ventas en el expediente' });
    p.clic(p.q(`[data-entitlement-cancel="${nueva.id}"]`, seccion2));
    await esperar(async () => (await api.get(`/api/clients/${clientId}/routine-entitlements`)).datos.find(item => item.id === nueva.id).status === 'cancelled', { mensaje: 'venta anulada' });
    assert.deepEqual(p.errores, [], 'errores de JavaScript en la pantalla');
  } finally { await p.cerrar(); }
});

test('U2) "Asignar rutina" abre el editor con el cliente y la venta ya elegidos y la ventana puesta', async () => {
  const p = await abrirPantalla({ baseApi: servidor.base, token: tokenStaff, ancho: 375 });
  try {
    await esperar(() => p.evaluar('typeof clientDetail === "function" && data && data.clients && data.clients.length > 1'), { mensaje: 'clientes cargados' });
    p.evaluar(`clientDetail('${clientId}')`);
    const seccion = await esperar(() => { const s = p.q('#client-routine-entitlements'); return s && s.querySelector('[data-entitlement-assign]') && s; }, { mensaje: 'tarjeta con acción' });
    p.clic(p.q(`[data-entitlement-assign="${bonoId}"]`, seccion));
    const selector = await esperar(() => { const s = p.q('#routine-entitlement'); return s && s.value === bonoId && s; }, { mensaje: 'bono preseleccionado en el editor' });
    assert.equal(p.q('#routine-client').value, clientId);
    assert.equal(p.q('#routine-entitlement-wrap').hidden, false);
    assert.equal(p.q('#routine-starts').value, hoy); assert.equal(p.q('#routine-due').value, sumar(hoy, 30));
    assert.match(p.q('#routine-entitlement-help').textContent, /Disponible del \d{2}-\d{2}-\d{4} al \d{2}-\d{2}-\d{4}.*Quedan 2 de 3/);
    // un cliente sin ventas no ve el selector
    p.cambiar(p.q('#routine-client'), data_clientIdSinBonos(p));
    await esperar(() => p.q('#routine-entitlement-wrap').hidden === true, { mensaje: 'selector oculto sin ventas' });
    assert.deepEqual(p.errores, [], 'errores de JavaScript en la pantalla');
  } finally { await p.cerrar(); }
});
const data_clientIdSinBonos = p => p.evaluar("data.clients.find(c => c.name === 'Pedro Sin Bonos').id");

test('U3) el portal del cliente muestra sus rutinas sueltas sin importes; quien no tiene no ve la sección', async () => {
  const enlace = await api.post(`/api/clients/${clientId}/access-link`, {});
  const acceso = await api.post(`/api/auth/access-link/${String(enlace.datos.url).split('acceso=')[1]}`, { password: 'clave-del-portal-larga' });
  const p = await abrirPantalla({ baseApi: servidor.base, token: acceso.datos.token, hash: '#portal-routines', ancho: 375 });
  try {
    const seccion = await esperar(() => p.q('#portal-routine-entitlements .entitlement-card') && p.q('#portal-routine-entitlements'), { mensaje: 'sección en el portal' });
    assert.match(seccion.textContent, /MIS RUTINAS SUELTAS/); assert.match(seccion.textContent, /3 rutinas sueltas/); assert.match(seccion.textContent, /Enviadas 1 de 3/);
    assert.doesNotMatch(seccion.textContent, /\$|FAC-|Anular|Cambiar ventana/, 'el cliente no ve importes ni acciones de Eileen');
    assert.deepEqual(p.errores, [], 'errores de JavaScript en el portal');
  } finally { await p.cerrar(); }
  const otro = (await api.get('/api/clients')).datos.find(c => c.full_name === 'Pedro Sin Bonos' || c.name === 'Pedro Sin Bonos');
  const enlace2 = await api.post(`/api/clients/${otro.id}/access-link`, {});
  const acceso2 = await api.post(`/api/auth/access-link/${String(enlace2.datos.url).split('acceso=')[1]}`, { password: 'clave-del-portal-larga' });
  const p2 = await abrirPantalla({ baseApi: servidor.base, token: acceso2.datos.token, hash: '#portal-routines', ancho: 375 });
  try {
    await esperar(() => p2.q('#portal-routines-list'), { mensaje: 'portal sin ventas' });
    await p2.quieta(800);
    assert.equal(p2.q('#portal-routine-entitlements'), null);
    assert.deepEqual(p2.errores, []);
  } finally { await p2.cerrar(); }
});
