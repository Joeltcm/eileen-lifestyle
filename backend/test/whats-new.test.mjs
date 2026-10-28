// Aviso de novedades: la lista está bien armada, sale UNA vez por usuaria (no por aparato), nunca retrocede, solo para el personal,
// y se puede volver a ver desde el menú de la cuenta.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import postgres from 'postgres';
import { CREDENCIALES, SETUP_TOKEN, cliente, levantar } from './harness.mjs';
import { abrirPantalla, esperar } from './ui-harness.mjs';

process.env.TZ = 'America/Panama';

let servidor; let api; let db; let tokenStaff; let tokenCliente;
before(async () => {
  servidor = await levantar(); api = cliente(servidor.base); db = postgres(servidor.databaseUrl, { onnotice: () => {}, max: 2 });
  await api.post('/api/auth/setup', CREDENCIALES, { 'x-setup-token': SETUP_TOKEN });
  tokenStaff = (await api.post('/api/auth/login', { email: CREDENCIALES.email, password: CREDENCIALES.password })).datos.token; api.usarToken(tokenStaff);
  const c = (await api.post('/api/clients', { fullName: 'Cliente Novedades', cutoffDay: 1, email: 'novedades@prueba.test' })).datos;
  const link = (await api.post(`/api/clients/${c.id}/access-link`, {})).datos;
  tokenCliente = (await api.post('/api/auth/access-link/' + String(link.url).split('acceso=')[1], { password: 'contrasena-portal-larga' })).datos.token;
}, { timeout: 120_000 });
after(async () => { await db?.end({ timeout: 1 }).catch(() => {}); await servidor?.parar(); });

const lista = async p => { await esperar(() => p.evaluar('typeof maybeShowWhatsNew === "function" && data && data.clients'), { mensaje: 'aplicación cargada' }); };

test('WN1) la lista de novedades está bien armada: ids con fecha y únicos, de la más nueva a la más antigua, con contenido y sin pasar de la versión actual', async () => {
  const p = await abrirPantalla({ baseApi: servidor.base, token: tokenStaff, ancho: 375 });
  try {
    await lista(p);
    const releases = JSON.parse(p.evaluar('JSON.stringify(whatsNewReleases)')); const version = Number(p.evaluar('APP_VERSION'));
    assert.ok(releases.length >= 1);
    assert.equal(new Set(releases.map(r => r.id)).size, releases.length, 'ids únicos');
    for (const r of releases) {
      assert.match(r.id, /^\d{4}-\d{2}-\d{2}-[a-z0-9-]{1,40}$/, `id ${r.id}`);
      assert.match(r.date, /^\d{2}-\d{2}-\d{4}$/, 'fecha dd-mm-aaaa'); assert.equal(`${r.date.slice(6)}-${r.date.slice(3, 5)}-${r.date.slice(0, 2)}`, r.id.slice(0, 10), 'la fecha coincide con el id');
      assert.ok(r.title && r.items.length >= 1 && r.version <= version, `versión ${r.version} ≤ ${version}`);
      for (const item of r.items) { assert.ok(item.icon && item.title && item.text, `${r.id}: ícono, título y texto`); if (item.go) assert.ok(item.go.label && (item.go.help || item.go.view)); }
    }
    for (let i = 1; i < releases.length; i += 1) assert.ok(releases[i - 1].id > releases[i].id, 'de la más nueva a la más antigua');
    // la primera entrega cubre lo hecho desde el acceso al portal en adelante, y debajo lo anterior
    const portal = releases.find(r => r.id.endsWith('acceso-portal-y-firma')); const anterior = releases.find(r => r.id.endsWith('cotizador-ayuda-cumpleanos'));
    const textos = JSON.stringify(portal.items).toLowerCase();
    for (const palabra of ['acceso', 'enlace', 'instalar', 'firma']) assert.ok(textos.includes(palabra), `menciona ${palabra}`);
    const previo = JSON.stringify(anterior.items).toLowerCase();
    for (const palabra of ['cotizaciones', 'ayuda', 'cumpleaños', 'ipad']) assert.ok(previo.includes(palabra), `menciona ${palabra}`);
    assert.ok(portal.id > anterior.id, 'lo del portal va arriba de lo anterior');
  } finally { await p.cerrar(); }
});

test('WN2) API: nace sin marca, guarda la más nueva, nunca retrocede, valida el formato y es solo del personal', async () => {
  assert.equal((await api.get('/api/whats-new')).datos.seen, null);
  assert.equal((await api.post('/api/whats-new/seen', { id: '2026-10-26-acceso-portal-y-firma' })).datos.seen, '2026-10-26-acceso-portal-y-firma');
  assert.equal((await api.post('/api/whats-new/seen', { id: '2026-01-01-antigua' })).datos.seen, '2026-10-26-acceso-portal-y-firma', 'una marca más vieja no la hace retroceder');
  assert.equal((await api.post('/api/whats-new/seen', { id: '2027-02-01-futura' })).datos.seen, '2027-02-01-futura');
  assert.equal((await api.post('/api/whats-new/seen', { id: 'no vale' })).estado, 400);
  await db`UPDATE users SET whats_new_seen = NULL`;
  const cli = cliente(servidor.base); cli.usarToken(tokenCliente);
  assert.equal((await cli.get('/api/whats-new')).estado, 403, 'un cliente no usa las novedades de la entrenadora');
  assert.equal((await cliente(servidor.base).get('/api/whats-new')).estado, 401);
});

test('WN3) en pantalla sale UNA vez con las novedades, se marca como vista, no reaparece en otro aparato y se vuelve a ver desde la cuenta', async () => {
  const p = await abrirPantalla({ baseApi: servidor.base, token: tokenStaff, ancho: 375, novedades: true });
  try {
    await lista(p);
    await esperar(() => p.q('#modal-content .news-release'), { ms: 20000, mensaje: 'aviso de novedades' });
    const texto = p.q('#modal-content').textContent;
    assert.match(texto, /Lo nuevo en tu app/); assert.match(texto, /Dar acceso al portal, listo en un toque/); assert.match(texto, /Guía para instalar la app en el teléfono/); assert.match(texto, /Tu firma en los contratos/);
    assert.equal(p.qa('#modal-content .news-item').length, 15, 'las entregas en el mismo aviso');
    assert.equal(p.qa('#modal-content .news-release').length, 6); assert.match(texto, /Cada clase aparece una sola vez/); assert.match(texto, /Cotizaciones para tus clientes/); assert.match(texto, /Aviso de cumpleaños de tus clientes/);
    assert.ok(texto.indexOf('Tu firma en los contratos') < texto.indexOf('Cotizaciones para tus clientes'), 'lo más nuevo primero');
    await esperar(async () => (await api.get('/api/whats-new')).datos.seen === p.evaluar('whatsNewReleases[0].id'), { mensaje: 'marcada como vista' });
    // un botón de la novedad lleva a donde dice
    p.clic(p.q('[data-whatsnew-go]'));
    await esperar(() => p.evaluar("helpState.topic === 'portal'"), { mensaje: 'abre el tema de ayuda' });
    assert.equal(p.window.document.getElementById('modal').open, false, 'el aviso se cierra al seguir un enlace');
    assert.equal(p.errores.length, 0, `sin errores de JavaScript: ${p.errores.join(' | ')}`);
  } finally { await p.cerrar(); }
  // otro aparato (otra pantalla) con la misma usuaria: ya no sale
  const otro = await abrirPantalla({ baseApi: servidor.base, token: tokenStaff, ancho: 820, novedades: true });
  try {
    await lista(otro); await otro.quieta?.(1500);
    assert.equal(otro.q('#modal-content .news-release'), null, 'no vuelve a salir');
    // desde el menú de la cuenta se vuelve a ver, sin tocar la marca
    otro.clic(otro.q('#account-button'));
    otro.clic(await esperar(() => otro.q('#account-news'), { mensaje: 'botón Novedades en la cuenta' }));
    await esperar(() => otro.q('#modal-content .news-release'), { mensaje: 'historial de novedades' });
    assert.match(otro.q('#modal-content').textContent, /Novedades de la app/);
    assert.equal((await api.get('/api/whats-new')).datos.seen, otro.evaluar('whatsNewReleases[0].id'));
    assert.equal(otro.errores.length, 0, `sin errores de JavaScript: ${otro.errores.join(' | ')}`);
  } finally { await otro.cerrar(); }
});

test('WN4) el centro de ayuda tiene el tema Novedades con el historial', async () => {
  const p = await abrirPantalla({ baseApi: servidor.base, token: tokenStaff, ancho: 375 });
  try {
    await lista(p);
    p.evaluar("openHelp('novedades')");
    await esperar(() => p.q('#help-root .help-article'), { mensaje: 'tema novedades' });
    assert.match(p.q('#help-root').textContent, /Tu firma en los contratos/);
  } finally { await p.cerrar(); }
});
