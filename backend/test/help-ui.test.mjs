// Centro de ayuda en la aplicación real: abre, busca, navega entre temas, sus botones llevan a donde dicen y cada «etiqueta» citada existe en la interfaz.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CREDENCIALES, SETUP_TOKEN, cliente, levantar } from './harness.mjs';
import { abrirPantalla, esperar } from './ui-harness.mjs';

process.env.TZ = 'America/Panama';
const raiz = new URL('../../', import.meta.url);
const leer = nombre => readFileSync(fileURLToPath(new URL(nombre, raiz)), 'utf8');

let servidor; let api; let tokenStaff;
before(async () => {
  servidor = await levantar(); api = cliente(servidor.base);
  await api.post('/api/auth/setup', CREDENCIALES, { 'x-setup-token': SETUP_TOKEN });
  tokenStaff = (await api.post('/api/auth/login', { email: CREDENCIALES.email, password: CREDENCIALES.password })).datos.token; api.usarToken(tokenStaff);
}, { timeout: 120_000 });
after(async () => { await servidor?.parar(); });

const lista = async p => { await esperar(() => p.evaluar('typeof renderHelp === "function" && data && data.clients'), { mensaje: 'aplicación cargada' }); };

test('HU1) los temas están completos: ids únicos, categorías válidas, bloques conocidos y botones con destino real', async () => {
  const p = await abrirPantalla({ baseApi: servidor.base, token: tokenStaff, ancho: 375 });
  try {
    await lista(p);
    const temas = JSON.parse(p.evaluar('JSON.stringify({ topics: helpTopics, cats: helpCategories })'));
    assert.equal(temas.topics.length, 17);
    assert.equal(new Set(temas.topics.map(t => t.id)).size, 17, 'ids únicos');
    const cats = new Set(temas.cats.map(c => c.id));
    const vistas = new Set(p.qa('.nav-link[data-view]').map(a => a.dataset.view));
    const acciones = readFileSync(fileURLToPath(new URL('app.js', raiz)), 'utf8');
    for (const t of temas.topics) {
      assert.ok(cats.has(t.category), `${t.id}: categoría ${t.category}`);
      assert.ok(t.title && t.summary && t.icon, `${t.id}: título, resumen e icono`);
      assert.ok(t.blocks.length >= (t.id === 'glosario' ? 1 : 3), `${t.id}: tiene contenido`);
      for (const b of t.blocks) {
        assert.ok(['p', 'steps', 'tip', 'warn', 'note', 'faq', 'go', 'table'].includes(b.t), `${t.id}: bloque ${b.t}`);
        if (b.t === 'go') for (const item of b.items) {
          if (item.view) assert.ok(vistas.has(item.view) || p.q(`section#${item.view}`), `${t.id}: vista ${item.view} existe`);
          if (item.action) assert.ok(acciones.includes(`dataset.action === '${item.action}'`), `${t.id}: acción ${item.action} tiene manejador`);
        }
      }
    }
  } finally { await p.cerrar(); }
});

test('HU2) la ayuda abre desde el menú, busca sin tildes, navega entre temas y vuelve a la portada', async () => {
  const p = await abrirPantalla({ baseApi: servidor.base, token: tokenStaff, ancho: 375 });
  try {
    await lista(p);
    assert.ok(p.q('.nav-link[data-view="help"]'), 'Ayuda está en el menú');
    p.evaluar("navigate('help')");
    await esperar(() => p.q('#help-root #help-search'), { mensaje: 'portada de ayuda' });
    assert.equal(p.qa('#help-root [data-help-open]').length >= 15, true, 'se listan todos los temas');
    // búsqueda sin tildes ni mayúsculas
    p.evaluar("helpState.query = 'FACTURACION'; renderHelp()");
    const encontrados = p.qa('#help-root [data-help-open]').map(b => b.dataset.helpOpen);
    assert.ok(encontrados.includes('facturacion'), 'FACTURACION encuentra el tema de facturación');
    p.evaluar("helpState.query = 'zzzqqq'; renderHelp()");
    assert.ok(p.q('#help-root .help-empty'), 'sin resultados se explica y ofrece volver');
    p.clic(p.q('#help-clear'));
    assert.ok(p.qa('#help-root [data-help-open]').length >= 15);
    // abrir un tema, ver su contenido, pasar al siguiente, volver
    p.clic(p.q('[data-help-open="clientes"]'));
    await esperar(() => p.q('#help-root .help-article'), { mensaje: 'tema' });
    assert.ok(p.q('#help-root h2, #help-root h1'), 'tiene título');
    assert.ok(p.qa('#help-root .help-article section, #help-root .help-article details, #help-root .help-article p').length > 3);
    const siguiente = p.q('.help-pager [data-help-open]:last-child');
    if (siguiente) { const id = siguiente.dataset.helpOpen; p.clic(siguiente); await esperar(() => p.evaluar(`helpState.topic === '${id}'`), { mensaje: 'tema siguiente' }); }
    p.clic(p.q('[data-help-back]'));
    await esperar(() => p.q('#help-root #help-search'), { mensaje: 'de vuelta a la portada' });
    assert.equal(p.evaluar('helpState.topic'), null);
  } finally { await p.cerrar(); }
});

test('HU3) los chips «ⓘ Ayuda» de cada pantalla abren su tema y los botones del tema funcionan', async () => {
  const p = await abrirPantalla({ baseApi: servidor.base, token: tokenStaff, ancho: 375 });
  try {
    await lista(p);
    const chips = p.qa('.help-chip');
    assert.ok(chips.length >= 4, `hay chips en las pantallas principales (${chips.length})`);
    const deClientes = p.q('#clients .help-chip'); assert.ok(deClientes);
    p.clic(deClientes);
    await esperar(() => p.evaluar("helpState.topic === 'clientes'"), { mensaje: 'tema clientes' });
    assert.ok(p.q('#help.active, #help:not([hidden])'), 'la vista de ayuda está visible');
    // un botón de “ir a” cambia de pantalla
    const ir = p.q('#help-root [data-view-go="clients"]'); assert.ok(ir, 'el tema de clientes tiene atajo a Clientes');
    p.clic(ir);
    await esperar(() => p.q('#clients.active'), { mensaje: 'fue a Clientes' });
    // un botón de acción abre la ventana real
    p.evaluar("openHelp('clientes')");
    await esperar(() => p.q('#help-root [data-action="new-client"]'), { mensaje: 'botón nuevo cliente' });
    p.clic(p.q('#help-root [data-action="new-client"]'));
    await esperar(() => p.q('dialog[open] form, .modal[open] form, dialog[open]'), { mensaje: 'formulario de cliente' });
  } finally { await p.cerrar(); }
});

test('HU4) la guía del portal del cliente se muestra y sus respuestas se despliegan', async () => {
  const p = await abrirPantalla({ baseApi: servidor.base, token: tokenStaff, ancho: 375 });
  try {
    await lista(p);
    p.evaluar("document.body.insertAdjacentHTML('beforeend', '<div id=\"portal-dashboard\"></div>'); portalGuideSection()");
    const detalles = p.qa('#portal-guide details');
    assert.equal(detalles.length, 7);
    assert.ok(p.q('#portal-guide').textContent.includes('¿Cómo hago mi rutina?'));
    p.evaluar("portalGuideSection()"); assert.equal(p.qa('#portal-guide').length, 1, 'no se duplica');
  } finally { await p.cerrar(); }
});

test('HU5) cada «etiqueta» citada en la ayuda existe de verdad en la interfaz', () => {
  const ayuda = leer('ayuda.js');
  const corpus = ['index.html', 'app.js', 'cotizador.js'].map(leer).join('\n').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const plano = t => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[\u{1F000}-\u{1FFFF}☀-➿️+]/gu, '').replace(/\s+/g, ' ').trim();
  const propios = new Set([...ayuda.matchAll(/title: '([^']+)'/g)].map(m => plano(m[1])));   // los títulos de los propios temas y categorías no son de la interfaz
  const codigo = ayuda.split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n').replace(/\.replace\(\/«[^\n]*/g, '');
  const sinExistir = new Set();
  for (const [, cruda] of codigo.matchAll(/«([^»]+)»/g)) {
    for (const parte of cruda.split(/\s*(?:→|\/| o )\s*/)) {
      const etiqueta = plano(parte).replace(/[“”".…]+$/g, '').trim();
      if (etiqueta.length < 3 || /^[a-z]*$/.test(etiqueta) && etiqueta.length < 4) continue;
      if (!propios.has(etiqueta) && !corpus.includes(etiqueta)) sinExistir.add(`${cruda} → «${etiqueta}»`);
    }
  }
  assert.deepEqual([...sinExistir], [], 'etiquetas de la ayuda que ya no están en la interfaz');
});

test('HU6) el editor de cotizaciones no se ensancha por la fila de tarifas (columna con minmax(0,1fr))', () => {
  const css = leer('styles.css');
  assert.match(css, /\.qt-editor\{[^}]*grid-template-columns:minmax\(0,1fr\)/, 'la columna del editor debe poder encogerse');
  assert.match(css, /\.qt-editor>\*\{[^}]*min-width:0/, 'y sus hijos también');
  assert.match(css, /\.help-grid\{[^}]*minmax\(min\(300px,100%\),1fr\)/, 'la cuadrícula de la ayuda no impone 300 px mínimos');
});

test('HU7) el atajo de ayuda del Resumen es una franja propia, no un botón dentro del hero (en el teléfono caía sobre la foto)', async () => {
  const p = await abrirPantalla({ baseApi: servidor.base, token: tokenStaff, ancho: 375 });
  try {
    await lista(p);
    assert.equal(p.qa('.hero [data-view-go="help"]').length, 0, 'ya no hay botón de ayuda dentro del hero');
    const franja = p.q('#dashboard .help-strip[data-view-go="help"]'); assert.ok(franja, 'hay una franja de ayuda en el Resumen');
    assert.equal(franja.closest('.hero'), null);
    p.clic(franja);
    await esperar(() => p.q('#help-root #help-search'), { mensaje: 'abre el centro de ayuda' });
  } finally { await p.cerrar(); }
});

test('HU8) en iPad la burbuja de adherencia del Resumen se aparta de la cara de Eileen (regla de tablet presente)', () => {
  const css = leer('styles.css');
  assert.match(css, /@media \(min-width:601px\) and \(max-width:1279px\)\{\s*body \.hero-score\{width:86px;height:86px;top:auto;bottom:76px;right:14px\}/, 'burbuja pequeña, abajo a la derecha, en el rango de tablet');
  assert.match(css, /body \.hero-score small\{display:none\}/);
});
