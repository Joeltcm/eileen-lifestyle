// Acceso al portal: lo que ve Eileen al generar el enlace (mensaje listo para WhatsApp) y lo que vive el cliente al abrirlo
// (crear contraseña, bienvenida con la guía de instalación) o al tocarlo de nuevo cuando ya no sirve.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import postgres from 'postgres';
import { CREDENCIALES, SETUP_TOKEN, cliente, levantar } from './harness.mjs';
import { abrirPantalla, esperar } from './ui-harness.mjs';

process.env.TZ = 'America/Panama';

let servidor; let api; let db; let tokenStaff; let clienteId;
before(async () => {
  servidor = await levantar(); api = cliente(servidor.base); db = postgres(servidor.databaseUrl, { onnotice: () => {}, max: 2 });
  await api.post('/api/auth/setup', CREDENCIALES, { 'x-setup-token': SETUP_TOKEN });
  tokenStaff = (await api.post('/api/auth/login', { email: CREDENCIALES.email, password: CREDENCIALES.password })).datos.token; api.usarToken(tokenStaff);
  clienteId = (await api.post('/api/clients', { fullName: 'María González', cutoffDay: 1, email: 'maria.portal@prueba.test', phone: '6123-4567' })).datos.id;
}, { timeout: 120_000 });
after(async () => { await db?.end({ timeout: 1 }).catch(() => {}); await servidor?.parar(); });

const lista = async p => { await esperar(() => p.evaluar('typeof portalAccessLink === "function" && data && data.clients && data.clients.length > 0'), { mensaje: 'aplicación cargada' }); };

let tokenDelEnlace;
test('PA1) Eileen genera el acceso: mensaje listo con el enlace y la dirección permanente, WhatsApp con el 507, copiar y correo', async () => {
  const p = await abrirPantalla({ baseApi: servidor.base, token: tokenStaff, ancho: 375 });
  try {
    await lista(p);
    p.evaluar(`portalAccessLink(data.clients.find(c => c.id === '${clienteId}'))`);
    const area = await esperar(() => p.q('#access-message'), { mensaje: 'mensaje para el cliente' });
    const texto = area.value;
    assert.match(texto, /^Hola María 👋/);
    assert.match(texto, /#acceso=[0-9a-f]{32,}/, 'trae el enlace de un solo uso');
    tokenDelEnlace = texto.match(/#acceso=([0-9a-f]+)/)[1];
    assert.match(texto, /entra siempre desde https?:\/\/[^\s]+ con tu correo \(maria\.portal@prueba\.test\)/, 'trae la dirección permanente y el correo');
    assert.match(texto, /vence en 48 horas/);
    assert.match(p.q('#access-whatsapp').href, /^https:\/\/wa\.me\/50761234567\?text=/, 'el teléfono de 8 dígitos lleva el 507');
    assert.ok(decodeURIComponent(p.q('#access-whatsapp').href).includes('#acceso='));
    assert.match(p.q('#access-mail').href, /^mailto:maria\.portal%40prueba\.test\?subject=/);
    assert.ok(p.q('#access-copy-message') && p.q('#access-copy-link'));
    // si Eileen edita el mensaje, el enlace de WhatsApp lo sigue
    area.value = `${texto}\nUn abrazo, Eileen`; area.dispatchEvent(new p.window.Event('input', { bubbles: true }));
    assert.match(decodeURIComponent(p.q('#access-whatsapp').href), /Un abrazo, Eileen/);
    assert.equal(p.errores.length, 0, `sin errores de JavaScript: ${p.errores.join(' | ')}`);
  } finally { await p.cerrar(); }
});

test('PA2) el cliente abre el enlace, crea su contraseña y ve la bienvenida con la guía para instalar la app', async () => {
  const p = await abrirPantalla({ baseApi: servidor.base, token: null, hash: `#acceso=${tokenDelEnlace}`, ancho: 375 });
  try {
    await esperar(() => !p.q('#access-link-form').hidden, { mensaje: 'formulario de contraseña' });
    p.cambiar(p.q('#access-link-form [name="password"]'), 'mi-clave-nueva-larga'); p.cambiar(p.q('#access-link-form [name="confirm"]'), 'mi-clave-nueva-larga');
    p.q('#access-link-form').dispatchEvent(new p.window.Event('submit', { bubbles: true, cancelable: true }));
    await esperar(() => p.q('#modal-content .pwa-guide'), { ms: 40000, mensaje: 'bienvenida con la guía' });
    const bienvenida = p.q('#modal-content').textContent;
    assert.match(bienvenida, /Tu portal está listo/); assert.match(bienvenida, /crea el acceso directo/);
    assert.ok(p.q('#modal-content .pwa-address').textContent.includes(p.window.location.origin), 'muestra la dirección del portal');
    assert.equal(p.qa('#modal-content [data-pwa-tab]').length, 3, 'iPhone, Android y computadora');
    // pestañas: solo un panel visible; iPhone habla de Safari, Android de Chrome
    p.clic(p.q('[data-pwa-tab="iphone"]'));
    assert.equal(p.qa('#modal-content [data-pwa-panel]:not([hidden])').length, 1);
    assert.match(p.q('[data-pwa-panel="iphone"]').textContent, /Safari/); assert.match(p.q('[data-pwa-panel="iphone"]').textContent, /Agregar a pantalla de inicio/);
    p.clic(p.q('[data-pwa-tab="android"]'));
    assert.ok(p.q('[data-pwa-panel="iphone"]').hidden); assert.match(p.q('[data-pwa-panel="android"]').textContent, /Instalar aplicación/);
    assert.ok(p.qa('#modal-content .pwa-problems-title, #modal-content details').length >= 6, 'preguntas frecuentes');
    p.clic(p.q('[data-pwa-close]'));
    assert.equal(p.window.document.getElementById('modal').open, false, 'se cierra y queda el portal');
    assert.equal(p.q('#portal-shell').hidden, false, 'el cliente queda dentro de su portal');
    assert.equal(p.window.localStorage.getItem('eileen-lifestyle-ultimo-correo'), 'maria.portal@prueba.test', 'se recuerda su correo para la próxima vez');
    assert.equal(p.errores.length, 0, `sin errores de JavaScript: ${p.errores.join(' | ')}`);
  } finally { await p.cerrar(); }
});

test('PA3) tocar de nuevo el enlace ya usado no deja al cliente en un callejón: explica, deja entrar y ofrece la guía', async () => {
  const p = await abrirPantalla({ baseApi: servidor.base, token: null, hash: `#acceso=${tokenDelEnlace}`, ancho: 375 });
  try {
    await esperar(() => /ya se usó o venció/.test(p.q('#auth-title').textContent), { mensaje: 'aviso amable' });
    assert.match(p.q('#auth-copy').textContent, /Si ya creaste tu contraseña, entra con tu correo/);
    assert.equal(p.q('#login-form').hidden, false, 'el formulario de acceso está a la vista');
    assert.equal(p.q('#access-link-form').hidden, true);
    assert.match(p.q('#login-form').textContent, /Eres cliente de Eileen/);
    assert.equal(p.window.location.hash, '', 'el enlace inservible se limpia de la barra');
    // con su correo recordado, solo escribe la contraseña
    p.window.localStorage.setItem('eileen-lifestyle-ultimo-correo', 'maria.portal@prueba.test');
    p.evaluar('showAuth(false)');
    assert.equal(p.q('#login-form [name="email"]').value, 'maria.portal@prueba.test');
    // y desde aquí puede abrir la guía de instalación
    p.clic(p.q('#login-form [data-pwa-guide]'));
    await esperar(() => p.q('#modal-content .pwa-guide'), { mensaje: 'guía de instalación' });
    assert.match(p.q('#modal-content').textContent, /Crea tu acceso directo/);
    assert.equal(p.qa('#modal-content [data-pwa-panel]:not([hidden])').length, 1);
    // y con su contraseña entra de verdad
    p.clic(p.q('[data-pwa-close]'));
    p.cambiar(p.q('#login-form [name="password"]'), 'mi-clave-nueva-larga');
    p.q('#login-form').dispatchEvent(new p.window.Event('submit', { bubbles: true, cancelable: true }));
    await esperar(() => p.q('#portal-shell') && !p.q('#portal-shell').hidden, { ms: 40000, mensaje: 'entra al portal' });
    assert.equal(p.errores.length, 0, `sin errores de JavaScript: ${p.errores.join(' | ')}`);
  } finally { await p.cerrar(); }
});

test('PA4) en el portal, la guía rápida trae el botón que abre la guía de instalación', async () => {
  const login = await api.post('/api/auth/login', { email: 'maria.portal@prueba.test', password: 'mi-clave-nueva-larga' });
  const p = await abrirPantalla({ baseApi: servidor.base, token: login.datos.token, ancho: 375, hash: '#portal-dashboard' });
  try {
    await esperar(() => p.q('#portal-guide [data-pwa-guide]'), { ms: 40000, mensaje: 'botón de la guía en el portal' });
    p.clic(p.q('#portal-guide [data-pwa-guide]'));
    await esperar(() => p.q('#modal-content .pwa-guide'), { mensaje: 'guía abierta' });
    assert.match(p.q('#modal-content').textContent, /Dirección de tu portal/);
    assert.equal(p.errores.length, 0, `sin errores de JavaScript: ${p.errores.join(' | ')}`);
  } finally { await p.cerrar(); }
});
