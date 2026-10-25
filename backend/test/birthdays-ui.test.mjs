// Cumpleaños en la aplicación real a 375 px: tarjeta del Resumen, botón de felicitar y avisos de la campanita.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import postgres from 'postgres';
import { CREDENCIALES, SETUP_TOKEN, cliente, levantar } from './harness.mjs';
import { abrirPantalla, esperar } from './ui-harness.mjs';
import { fechaDeNegocioPanama } from '../dist/panama-date.js';

process.env.TZ = 'America/Panama';
const sumar = (fecha, dias) => { const d = new Date(`${fecha}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + dias); return d.toISOString().slice(0, 10); };
const hoy = fechaDeNegocioPanama();

let servidor; let api; let db; let tokenStaff;
before(async () => {
  servidor = await levantar(); api = cliente(servidor.base); db = postgres(servidor.databaseUrl, { onnotice: () => {}, max: 2 });
  await api.post('/api/auth/setup', CREDENCIALES, { 'x-setup-token': SETUP_TOKEN });
  tokenStaff = (await api.post('/api/auth/login', { email: CREDENCIALES.email, password: CREDENCIALES.password })).datos.token; api.usarToken(tokenStaff);
}, { timeout: 120_000 });
after(async () => { await db?.end({ timeout: 1 }).catch(() => {}); await servidor?.parar(); });

const lista = async p => { await esperar(() => p.evaluar('typeof loadBirthdays === "function" && data && data.clients'), { mensaje: 'aplicación cargada' }); };

test('BU1) sin cumpleaños cercanos la tarjeta no se muestra; con ellos aparece, ordenada y con botón de felicitar por WhatsApp', async () => {
  const vacia = await abrirPantalla({ baseApi: servidor.base, token: tokenStaff, ancho: 375 });
  try { await lista(vacia); await vacia.quieta?.(); assert.equal(vacia.q('#birthday-card').hidden, true, 'oculta si no hay cumpleaños'); } finally { await vacia.cerrar(); }

  await api.post('/api/clients', { fullName: 'Lucía Pérez Mora', cutoffDay: 1, phone: '6123-4567', birthDate: `1990-${sumar(hoy, 2).slice(5)}` });
  await api.post('/api/clients', { fullName: 'Sin Teléfono', cutoffDay: 1, birthDate: `1985-${sumar(hoy, 9).slice(5)}` });
  const p = await abrirPantalla({ baseApi: servidor.base, token: tokenStaff, ancho: 375 });
  try {
    await lista(p);
    await esperar(() => !p.q('#birthday-card').hidden, { mensaje: 'tarjeta de cumpleaños' });
    const filas = p.qa('#birthday-list .birthday-row');
    assert.equal(filas.length, 2);
    assert.match(filas[0].textContent, /Lucía Pérez Mora/); assert.match(filas[0].textContent, /pasado mañana/); assert.match(filas[0].textContent, /Cumple \d+ años/);
    assert.ok(filas[0].classList.contains('soon'), 'los de los próximos 2 días se destacan');
    assert.ok(!filas[1].classList.contains('soon'));
    const felicitar = p.q('a.birthday-wa', filas[0]);
    assert.ok(felicitar, 'botón de felicitar');
    assert.match(felicitar.href, /^https:\/\/wa\.me\/50761234567\?text=/, 'el teléfono de 8 dígitos lleva el 507');
    assert.match(decodeURIComponent(felicitar.href), /Feliz cumpleaños, Lucía/);
    assert.equal(p.q('a.birthday-wa', filas[1]), null, 'sin teléfono no hay enlace de WhatsApp');
    assert.ok(p.q('button.birthday-wa[data-prep-cliente]', filas[1]), 'pero sí un acceso al expediente');
    assert.equal(p.errores.length, 0, `sin errores de JavaScript: ${p.errores.join(' | ')}`);
  } finally { await p.cerrar(); }
});

test('BU2) la campanita muestra el cumpleaños con "Felicitar por WhatsApp" y "Abrir expediente"', async () => {
  const p = await abrirPantalla({ baseApi: servidor.base, token: tokenStaff, ancho: 375 });
  try {
    await lista(p);
    p.clic(p.q('#notification-button'));
    const aviso = await esperar(() => p.q('.notification-item.birthday'), { mensaje: 'aviso de cumpleaños' });
    assert.match(aviso.textContent, /🎂 Cumpleaños de Lucía Pérez Mora/);
    assert.match(aviso.textContent, /pasado mañana/);
    assert.match(p.q('a[href^="https://wa.me/50761234567"]', aviso).textContent, /Felicitar por WhatsApp/);
    p.clic(p.q('[data-prep-cliente]', aviso));
    await esperar(() => p.evaluar('document.querySelector("dialog[open], .modal[open]")?.textContent.includes("Lucía Pérez Mora")'), { mensaje: 'expediente del cliente' });
    assert.equal(p.errores.length, 0, `sin errores de JavaScript: ${p.errores.join(' | ')}`);
  } finally { await p.cerrar(); }
});
