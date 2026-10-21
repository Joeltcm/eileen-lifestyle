// Cotizador en la aplicación real, a 375 px y sin errores de JavaScript: armar y guardar una cotización, verla, compartirla, el enlace público y las cláusulas.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import postgres from 'postgres';
import { CREDENCIALES, SETUP_TOKEN, cliente, levantar } from './harness.mjs';
import { abrirPantalla, esperar } from './ui-harness.mjs';

process.env.TZ = 'America/Panama';

let servidor; let api; let db; let tokenStaff; let mariaId; let planId;
before(async () => {
  servidor = await levantar(); api = cliente(servidor.base); db = postgres(servidor.databaseUrl, { onnotice: () => {}, max: 2 });
  await api.post('/api/auth/setup', CREDENCIALES, { 'x-setup-token': SETUP_TOKEN });
  tokenStaff = (await api.post('/api/auth/login', { email: CREDENCIALES.email, password: CREDENCIALES.password })).datos.token; api.usarToken(tokenStaff);
  const [dueno] = await db`SELECT id FROM users LIMIT 1`;
  [{ id: planId }] = await db`INSERT INTO service_plans (owner_id, name, billing_model, price, sessions_included, service_type, active) VALUES (${dueno.id}, 'Mensualidad 8 clases', 'monthly', 160, 8, 'presencial', true) RETURNING id`;
  mariaId = (await api.post('/api/clients', { fullName: 'María González', cutoffDay: 1, email: 'maria.q@prueba.test', phone: '+507 6000-1111' })).datos.id;
}, { timeout: 120_000 });
after(async () => { await db?.end({ timeout: 1 }).catch(() => {}); await servidor?.parar(); });

const lista = async p => { await esperar(() => p.evaluar('typeof renderQuotesList === "function" && data && data.clients && data.clients.length > 0'), { mensaje: 'aplicación cargada' }); };

test('QU1) armar una cotización paso a paso: cliente, tarifa, descuento, cláusulas y mensaje; se guarda, se ve y se comparte', async () => {
  const p = await abrirPantalla({ baseApi: servidor.base, token: tokenStaff, ancho: 375 });
  try {
    await lista(p);
    assert.ok(p.q('.nav-link[data-view="quotes"]'), 'Cotizaciones está en el menú');
    assert.ok(p.q('#quotes-top-button'), 'y hay un botón en la barra superior para el teléfono');
    p.evaluar("navigate('quotes')");
    await esperar(() => p.q('#quotes-root .qt-empty'), { mensaje: 'estado vacío' });
    assert.match(p.q('#quotes-root').textContent, /Aún no tienes cotizaciones/);
    p.clic(p.q('[data-quote-new]'));
    await esperar(() => p.q('#qe-client'), { mensaje: 'editor' });
    assert.equal(p.qa('#qe-clauses .qt-pick').length, 14); assert.equal(p.qa('#qe-clauses .qt-pick.on').length, 5, 'las cláusulas por defecto vienen marcadas');
    // paso 1: para quién (el saludo sigue al nombre)
    p.cambiar(p.q('#qe-client'), mariaId);
    assert.match(p.q('#qe-intro').value, /^Hola María,/);
    p.cambiar(p.q('#qe-title'), 'Plan para María');
    p.clic(p.q('[data-valid-days="30"]'));
    // paso 2: tarifa + línea libre + descuento
    p.clic(p.q(`[data-qe-plan="${planId}"]`));
    p.clic(p.q('#qe-add-line'));
    const filas = p.qa('.qt-edit-line');
    p.cambiar(p.q('[data-f="description"]', filas[1]), 'Evaluación inicial'); p.cambiar(p.q('[data-f="unitAmount"]', filas[1]), '40');
    p.clic(p.q('#qe-discount-add'));
    p.cambiar(p.q('#qe-dvalue'), '10');
    assert.match(p.q('#qe-totals').textContent, /Subtotal\s*\$200\.00/); assert.match(p.q('#qe-totals').textContent, /Descuento \(10 %\)\s*− \$20\.00/); assert.match(p.q('#qe-totals').textContent, /Total\s*\$180\.00/);
    assert.match(p.q('#qe-sticky-total').textContent, /\$180\.00/);
    // paso 3: cláusulas (quitar una, agregar otra, escribir una propia)
    p.clic(p.q('[data-clause]:checked', p.q('#qe-clauses')));
    p.clic(p.qa('#qe-clauses [data-clause]').find(input => !input.checked));
    assert.equal(p.qa('#qe-clauses .qt-pick.on').length, 5);
    p.clic(p.q('#qe-add-custom'));
    const form = await esperar(() => p.q('#qe-custom-form'), { mensaje: 'cláusula propia' });
    p.cambiar(form.elements.title, 'Clase de prueba'); p.cambiar(form.elements.body, 'Tu primera clase es de cortesía, {{cliente}}.');
    form.dispatchEvent(new p.window.Event('submit', { bubbles: true, cancelable: true }));
    await esperar(() => p.q('#qe-custom .qt-pick.custom'), { mensaje: 'cláusula propia agregada' });
    assert.equal(p.qa('#qe-custom .qt-pick').length, 1);
    // vista previa
    p.clic(p.q('#qe-preview'));
    const previa = await esperar(() => p.q('.qt-preview .qt-doc'), { mensaje: 'vista previa' });
    assert.match(previa.textContent, /Plan para María/); assert.match(previa.textContent, /Evaluación inicial/); assert.match(previa.textContent, /\$180\.00/);
    assert.match(previa.textContent, /de cortesía, María\./, 'la variable se resuelve en la vista previa'); assert.match(previa.textContent, /COT-••••/);
    p.clic(p.q('#qe-preview-close'));
    // guardar y compartir
    p.clic(p.q('#qe-share'));
    const compartir = await esperar(() => p.q('#quote-link'), { mensaje: 'diálogo de compartir' });
    assert.match(compartir.value, /#cotizacion=[A-Za-z0-9_-]{30,}$/);
    assert.match(p.q('.qt-share.wa').getAttribute('href'), /^https:\/\/wa\.me\/50760001111\?text=/, 'WhatsApp al número del cliente');
    const guardada = (await api.get('/api/quotes')).datos.items[0];
    assert.deepEqual([guardada.code, guardada.status, guardada.total, guardada.recipient.name, guardada.clauses.length], ['COT-0001', 'sent', 180, 'María González', 6]);
    p.clic(p.q('#quote-done'));
    await esperar(() => p.q('.qt-card'), { mensaje: 'tarjeta en la lista' });
    assert.match(p.q('.qt-card').textContent, /María González/); assert.match(p.q('.qt-card').textContent, /\$180\.00/); assert.match(p.q('.qt-card').textContent, /Enviada/);
    assert.deepEqual(p.errores, [], 'errores de JavaScript en la pantalla');
  } finally { await p.cerrar(); }
});

test('QU2) validaciones amables, persona nueva, menú de acciones y crear expediente desde una cotización', async () => {
  const p = await abrirPantalla({ baseApi: servidor.base, token: tokenStaff, ancho: 375 });
  try {
    await lista(p); p.evaluar("navigate('quotes')");
    await esperar(() => p.q('[data-quote-new]'), { mensaje: 'lista' });
    p.clic(p.q('[data-quote-new]')); await esperar(() => p.q('#qe-save'), { mensaje: 'editor' });
    const toasts = () => p.evaluar("[...document.querySelectorAll('.toast, #toast, [role=status]')].map(e => e.textContent).join(' | ')");
    p.clic(p.q('#qe-save'));
    await esperar(async () => /Elige a quién va dirigida/.test(await toasts()), { mensaje: 'aviso: falta destinatario' });
    p.clic(p.q('[data-qe-mode="prospect"]'));
    await esperar(() => p.q('#qe-pname'), { mensaje: 'persona nueva' });
    p.cambiar(p.q('#qe-pname'), 'Luis Prospecto'); p.cambiar(p.q('#qe-pphone'), '+507 6222-3333'); p.cambiar(p.q('#qe-pemail'), 'luis@correo.com');
    p.clic(p.q('#qe-save'));
    await esperar(async () => /al menos una línea/.test(await toasts()), { mensaje: 'aviso: faltan líneas' });
    p.clic(p.q('#qe-add-line')); const fila = p.q('.qt-edit-line');
    p.clic(p.q('#qe-save'));
    await esperar(async () => /necesita un concepto/.test(await toasts()), { mensaje: 'aviso: línea sin concepto' });
    p.cambiar(p.q('[data-f="description"]', fila), 'Clase suelta'); p.cambiar(p.q('[data-f="unitAmount"]', fila), '30');
    p.clic(p.q('#qe-save'));
    await esperar(() => p.q('.qt-card'), { mensaje: 'guardada como borrador' });
    const luis = p.qa('.qt-card').find(card => /Luis Prospecto/.test(card.textContent));
    assert.ok(luis); assert.match(luis.textContent, /Borrador/); assert.match(luis.textContent, /nuevo/);
    // menú: crear expediente con los datos de la persona
    p.clic(p.q('[data-quote-menu]', luis));
    await esperar(() => p.q('.qt-menu'), { mensaje: 'menú' });
    assert.ok(p.q('[data-quote-act="client"]'), 'solo una persona nueva ofrece crear expediente');
    p.clic(p.q('[data-quote-act="client"]'));
    const nuevo = await esperar(() => p.q('#client-form'), { mensaje: 'formulario de cliente' });
    assert.equal(nuevo.elements.name.value, 'Luis Prospecto'); assert.equal(nuevo.elements.email.value, 'luis@correo.com'); assert.equal(nuevo.elements.phone.value, '+507 6222-3333');
    p.evaluar('modal.close()');
    assert.deepEqual(p.errores, [], 'errores de JavaScript en la pantalla');
  } finally { await p.cerrar(); }
});

test('QU3) Mis cláusulas: crear, editar y ocultar; la nueva aparece al armar una cotización; el expediente ofrece cotizar', async () => {
  const p = await abrirPantalla({ baseApi: servidor.base, token: tokenStaff, ancho: 375 });
  try {
    await lista(p); p.evaluar("navigate('quotes')");
    await esperar(() => p.q('[data-quote-clauses]'), { mensaje: 'lista' });
    p.clic(p.q('[data-quote-clauses]'));
    await esperar(() => p.q('.qt-clause-manager .qt-clause-row'), { mensaje: 'administrador' });
    assert.equal(p.qa('.qt-clause-row').length, 14); assert.match(p.q('.qt-clause-manager').textContent, /\{\{vigencia\}\}/);
    p.clic(p.q('#qc-new'));
    const form = await esperar(() => p.q('#qc-form'), { mensaje: 'formulario de cláusula' });
    p.cambiar(form.elements.title, 'Política de lluvia'); p.cambiar(form.elements.body, 'Si llueve, la clase al aire libre se mueve de horario.');
    p.clic(p.q('[data-emoji="🌧️"]'));
    form.elements.defaultOn.checked = true;
    form.dispatchEvent(new p.window.Event('submit', { bubbles: true, cancelable: true }));
    await esperar(() => p.qa('.qt-clause-row').length === 15, { mensaje: 'cláusula creada' });
    const nueva = (await api.get('/api/quote-clauses')).datos.find(c => c.title === 'Política de lluvia');
    assert.deepEqual([nueva.icon, nueva.defaultOn, nueva.category], ['🌧️', true, 'general']);
    // ocultarla: ya no se ofrece
    await api.patch(`/api/quote-clauses/${nueva.id}`, { active: false });
    p.clic(p.q('#qc-close'));
    p.evaluar("openQuoteEditor(null)");
    await esperar(() => p.q('#qe-clauses .qt-pick'), { mensaje: 'editor' });
    assert.equal(p.qa('#qe-clauses .qt-pick').length, 14, 'una cláusula oculta no se ofrece');
    // expediente: sección de cotizaciones del cliente
    p.evaluar(`clientDetail('${mariaId}')`);
    const seccion = await esperar(() => { const s = p.q('#client-quotes'); return s && s.querySelector('#client-new-quote') && s; }, { mensaje: 'cotizaciones del expediente' });
    assert.match(seccion.textContent, /Cotizar a María/);
    assert.deepEqual(p.errores, [], 'errores de JavaScript en la pantalla');
  } finally { await p.cerrar(); }
});

test('QU4) la página pública se ve como la recibe el cliente: saludo, líneas, total, cláusulas y botones', async () => {
  const q = (await api.post('/api/quotes', { clientId: mariaId, title: 'Para el enlace', intro: 'Hola María, aquí va.', items: [{ description: 'Mensualidad', quantity: 1, unitAmount: 120, detail: 'Cuatro semanas' }], discount: { kind: 'percent', value: 25 },
    clauses: [{ title: 'Vigencia', body: 'Vale hasta el {{vigencia}}.', icon: '⏳' }], notes: 'Con gusto.' })).datos;
  const token = (await api.post(`/api/quotes/${q.id}/share`, {})).datos.share.url.split('#cotizacion=')[1];
  const p = await abrirPantalla({ baseApi: servidor.base, hash: `#cotizacion=${token}`, ancho: 375 });
  try {
    const raiz = await esperar(() => { const r = p.q('#public-quote'); return r && !r.hidden && r.querySelector('.qt-doc') && r; }, { mensaje: 'página pública' });
    assert.match(raiz.textContent, /Hola, María/); assert.match(raiz.textContent, /Para María González/); assert.match(raiz.textContent, /Mensualidad/); assert.match(raiz.textContent, /Cuatro semanas/);
    assert.match(raiz.textContent, /Descuento \(25 %\)/); assert.match(raiz.textContent, /\$90\.00/); assert.match(raiz.textContent, /Vale hasta el \d{2}-\d{2}-\d{4}\./); assert.match(raiz.textContent, /Con gusto\./);
    assert.match(raiz.textContent, /no es una factura ni un contrato/);
    assert.ok(p.q('#qt-public-pdf')); assert.match(p.q('.qt-wa')?.getAttribute('href') || '', /^https:\/\/wa\.me\/\d+\?text=/);
    assert.ok(p.q('#app-shell').hidden && p.q('#auth-screen').hidden, 'no se ve nada de la aplicación');
    assert.deepEqual(p.errores, [], 'errores de JavaScript en la página pública');
    assert.equal((await api.get(`/api/quotes/${q.id}`)).datos.share.viewCount, 1, 'abrir el enlace cuenta como una vista');
  } finally { await p.cerrar(); }
  const malo = await abrirPantalla({ baseApi: servidor.base, hash: '#cotizacion=token-que-no-existe-000000000000000000', ancho: 375 });
  try {
    await esperar(() => /No se puede abrir/.test(malo.q('#public-quote').textContent), { mensaje: 'enlace inválido' });
    assert.deepEqual(malo.errores, []);
  } finally { await malo.cerrar(); }
});
