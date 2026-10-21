// Cotizador: biblioteca de cláusulas, cotizaciones (cliente o persona nueva), cálculo, estados, enlace público, PDF y avisos.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import postgres from 'postgres';
import { CREDENCIALES, SETUP_TOKEN, cliente, levantar } from './harness.mjs';

let server; let api; let db; let token; let clientId; let planId;
const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Panama' }).format(new Date());
const sumar = (valor, dias) => { const d = new Date(`${valor}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + dias); return d.toISOString().slice(0, 10); };
const dmy = valor => `${valor.slice(8, 10)}-${valor.slice(5, 7)}-${valor.slice(0, 4)}`;
const crudo = async (ruta, tok) => { const r = await fetch(server.base + ruta, { headers: tok ? { Authorization: `Bearer ${tok}` } : {} }); return { estado: r.status, tipo: r.headers.get('content-type'), cuerpo: Buffer.from(await r.arrayBuffer()) }; };
const publico = ruta => cliente(server.base).get(ruta);
const linea = (description, unitAmount, quantity = 1, extra = {}) => ({ description, unitAmount, quantity, ...extra });

before(async () => {
  server = await levantar(); api = cliente(server.base); db = postgres(server.databaseUrl, { onnotice: () => {} });
  const setup = await api.post('/api/auth/setup', CREDENCIALES, { 'x-setup-token': SETUP_TOKEN });
  token = setup.datos.token; api.usarToken(token);
  clientId = (await api.post('/api/clients', { fullName: 'María González', email: 'maria.cot@prueba.test', phone: '+507 6000-1111', cutoffDay: 1 })).datos.id;
  const [dueno] = await db`SELECT id FROM users LIMIT 1`;
  [{ id: planId }] = await db`INSERT INTO service_plans (owner_id, name, billing_model, price, sessions_included, service_type, active) VALUES (${dueno.id}, 'Mensualidad 8 clases', 'monthly', 160, 8, 'presencial', true) RETURNING id`;
}, { timeout: 90_000 });
after(async () => { await db?.end({ timeout: 1 }).catch(() => {}); await server?.parar(); });

test('Q1) la biblioteca de cláusulas se siembra una vez con ejemplos editables y se administra', async () => {
  const lista = (await api.get('/api/quote-clauses')).datos;
  assert.equal(lista.length, 14); assert.equal(lista.filter(c => c.defaultOn).length, 5, 'cinco vienen marcadas por defecto');
  assert.ok(lista.every(c => c.icon && c.title && c.body && c.active));
  assert.equal((await api.get('/api/quote-clauses')).datos.length, 14, 'no se vuelve a sembrar');
  const nueva = await api.post('/api/quote-clauses', { title: 'Política de lluvia', body: 'Las clases al aire libre se mueven si llueve.', category: 'servicio', icon: '🌧️', defaultOn: true });
  assert.equal(nueva.estado, 201, JSON.stringify(nueva.datos)); assert.equal(nueva.datos.sortOrder > Math.max(...lista.map(c => c.sortOrder)), true, 'va al final');
  const editada = await api.patch(`/api/quote-clauses/${nueva.datos.id}`, { body: 'Si llueve, la clase al aire libre se mueve a otro horario.', defaultOn: false });
  assert.equal(editada.estado, 200); assert.deepEqual([editada.datos.defaultOn, editada.datos.title], [false, 'Política de lluvia']);
  assert.equal((await api.post('/api/quote-clauses', { title: 'x', body: 'y' })).estado, 400, 'título y texto de verdad');
  assert.equal((await api.delete(`/api/quote-clauses/${nueva.datos.id}`)).estado, 200);
  assert.equal((await api.delete(`/api/quote-clauses/${nueva.datos.id}`)).estado, 404);
  // restaurar ejemplos: solo vuelven los que faltan, sin duplicar
  const forma = lista.find(c => c.title === 'Forma de pago');
  await api.delete(`/api/quote-clauses/${forma.id}`);
  const restaurar = await api.post('/api/quote-clauses/restore-defaults', {});
  assert.equal(restaurar.datos.restored, 1);
  assert.equal((await api.get('/api/quote-clauses')).datos.length, 14);
  assert.equal((await api.post('/api/quote-clauses/restore-defaults', {})).datos.restored, 0);
  assert.equal((await cliente(server.base).get('/api/quote-clauses')).estado, 401);
});

test('Q2) crear una cotización para un cliente: número, totales con descuento y cláusulas con sus variables', async () => {
  const clausulas = (await api.get('/api/quote-clauses')).datos;
  const vigencia = clausulas.find(c => c.title === 'Vigencia de la propuesta'); const pago = clausulas.find(c => c.title === 'Forma de pago');
  const valida = sumar(hoy, 10);
  const res = await api.post('/api/quotes', {
    clientId, title: 'Plan para María', intro: 'Hola María, gracias por tu interés.', validUntil: valida,
    items: [linea('Mensualidad 8 clases', 160, 1, { detail: 'Cuatro semanas, dos veces por semana', planId }), linea('Evaluación inicial', 25)],
    discount: { kind: 'percent', value: 10 },
    clauses: [{ clauseId: vigencia.id }, { clauseId: pago.id }, { title: 'Clase de prueba gratis', body: 'Tu primera clase es de cortesía para {{cliente}}.', icon: '🎁' }]
  });
  assert.equal(res.estado, 201, JSON.stringify(res.datos));
  const q = res.datos;
  assert.deepEqual([q.code, q.status, q.subtotal, q.discount.amount, q.total], ['COT-0001', 'draft', 185, 18.5, 166.5]);
  assert.deepEqual([q.recipient.name, q.recipient.firstName, q.recipient.isClient, q.recipient.phone], ['María González', 'María', true, '+507 6000-1111']);
  assert.equal(q.issuedOn, hoy); assert.equal(q.validUntil, valida); assert.equal(q.daysLeft, 10);
  assert.equal(q.items[0].amount, 160); assert.equal(q.items[0].planId, planId);
  assert.equal(q.clauses.length, 3);
  assert.match(q.clauses[0].body, new RegExp(`válida hasta el ${dmy(valida)}\\.`), 'la variable {{vigencia}} se resuelve');
  assert.match(q.clauses[2].body, /de cortesía para María\./, 'la variable {{cliente}} usa el primer nombre'); assert.equal(q.clauses[2].id, null, 'cláusula propia de esta cotización');
  // la segunda lleva el número siguiente
  const segunda = await api.post('/api/quotes', { clientId, items: [linea('Clase suelta', 30)] });
  assert.equal(segunda.datos.code, 'COT-0002'); assert.equal(segunda.datos.title, 'Propuesta de entrenamiento');
  assert.equal(segunda.datos.validUntil, sumar(hoy, 15), 'vigencia de 15 días por defecto');
});

test('Q3) para una persona que aún no es cliente; validaciones; cálculo con decimales y descuentos', async () => {
  const p = await api.post('/api/quotes', { prospect: { name: 'Luis Prospecto', email: 'luis@correo.com', phone: '+507 6222-3333' }, items: [linea('Paquete 12 clases', 33.33, 3)], discount: { kind: 'amount', value: 9.99 } });
  assert.equal(p.estado, 201, JSON.stringify(p.datos));
  assert.deepEqual([p.datos.recipient.name, p.datos.recipient.isClient, p.datos.recipient.email], ['Luis Prospecto', false, 'luis@correo.com']);
  assert.deepEqual([p.datos.subtotal, p.datos.discount.amount, p.datos.total], [99.99, 9.99, 90]);
  const mucho = await api.post('/api/quotes', { prospect: { name: 'Ana' }, items: [linea('Algo', 10)], discount: { kind: 'amount', value: 500 } });
  assert.deepEqual([mucho.datos.discount.amount, mucho.datos.total], [10, 0], 'el descuento nunca pasa del subtotal');
  assert.equal((await api.post('/api/quotes', { items: [linea('Sin destinatario', 10)] })).estado, 400);
  assert.equal((await api.post('/api/quotes', { prospect: { name: 'Ana' }, items: [] })).estado, 400);
  assert.equal((await api.post('/api/quotes', { prospect: { name: 'Ana' }, items: [linea('Algo', 10)], discount: { kind: 'percent', value: 120 } })).estado, 400);
  assert.equal((await api.post('/api/quotes', { prospect: { name: 'Ana' }, items: [linea('Algo', 10)], issuedOn: hoy, validUntil: sumar(hoy, -1) })).estado, 400);
  assert.equal((await api.post('/api/quotes', { prospect: { name: 'Ana' }, items: [linea('Algo', -5)] })).estado, 400, 'precio negativo');
  assert.equal((await api.post('/api/quotes', { clientId: '00000000-0000-0000-0000-000000000000', items: [linea('Algo', 10)] })).estado, 404);
  assert.equal((await api.post('/api/quotes', { prospect: { name: 'Ana' }, items: [linea('Algo', 10)], clauses: [{ clauseId: '00000000-0000-0000-0000-000000000000' }] })).estado, 404);
});

test('Q4) editar, estados, duplicar, eliminar; una cotización con respuesta no se edita hasta reabrirla', async () => {
  const q = (await api.post('/api/quotes', { prospect: { name: 'Edita Prueba' }, items: [linea('Uno', 50)] })).datos;
  const editada = await api.patch(`/api/quotes/${q.id}`, { prospect: { name: 'Edita Prueba' }, title: 'Nuevo título', items: [linea('Uno', 50), linea('Dos', 20, 2)], notes: 'Gracias' });
  assert.equal(editada.estado, 200, JSON.stringify(editada.datos)); assert.deepEqual([editada.datos.title, editada.datos.total, editada.datos.notes], ['Nuevo título', 90, 'Gracias']);
  const aceptada = await api.post(`/api/quotes/${q.id}/status`, { status: 'accepted' });
  assert.deepEqual([aceptada.datos.status, Boolean(aceptada.datos.respondedAt), Boolean(aceptada.datos.sentAt)], ['accepted', true, true]);
  assert.equal((await api.patch(`/api/quotes/${q.id}`, { prospect: { name: 'Edita Prueba' }, items: [linea('Uno', 1)] })).estado, 409);
  const reabierta = await api.post(`/api/quotes/${q.id}/status`, { status: 'draft' });
  assert.deepEqual([reabierta.datos.status, reabierta.datos.respondedAt, reabierta.datos.sentAt], ['draft', null, null]);
  assert.equal((await api.patch(`/api/quotes/${q.id}`, { prospect: { name: 'Edita Prueba' }, items: [linea('Uno', 1)] })).estado, 200);
  assert.equal((await api.post(`/api/quotes/${q.id}/status`, { status: 'nada' })).estado, 400);
  const copia = await api.post(`/api/quotes/${q.id}/duplicate`, {});
  assert.equal(copia.estado, 201); assert.notEqual(copia.datos.id, q.id); assert.notEqual(copia.datos.number, q.number);
  assert.deepEqual([copia.datos.status, copia.datos.share.active, copia.datos.total, copia.datos.recipient.name], ['draft', false, 1, 'Edita Prueba']);
  assert.equal((await api.delete(`/api/quotes/${copia.datos.id}`)).estado, 200); assert.equal((await api.get(`/api/quotes/${copia.datos.id}`)).estado, 404);
  assert.equal((await api.delete(`/api/quotes/${copia.datos.id}`)).estado, 404);
});

test('Q5) la lista cuenta por estado, filtra y busca; vencida se deduce de la fecha', async () => {
  await api.post('/api/quotes', { prospect: { name: 'Vencida Vera' }, title: 'Propuesta vieja', issuedOn: sumar(hoy, -20), validUntil: sumar(hoy, -5), items: [linea('Algo', 10)] });
  const todas = (await api.get('/api/quotes')).datos;
  assert.ok(todas.counts.all >= 5 && todas.counts.expired === 1);
  const vencidas = (await api.get('/api/quotes?status=expired')).datos.items;
  assert.deepEqual(vencidas.map(v => [v.recipient.name, v.status]), [['Vencida Vera', 'expired']]);
  assert.equal((await api.get('/api/quotes?q=luis')).datos.items.length, 1, 'busca por destinatario');
  assert.equal((await api.get('/api/quotes?q=COT-0001')).datos.items.length, 1, 'busca por número');
  assert.equal((await api.get('/api/quotes?status=accepted')).datos.items.length, 0);
  const deMaria = (await api.get(`/api/quotes?clientId=${clientId}`)).datos.items;
  assert.ok(deMaria.length >= 2 && deMaria.every(item => item.recipient.clientId === clientId), 'filtra por cliente (para el expediente)');
});

test('Q6) compartir: enlace público de solo lectura, cuenta las vistas, aparece en la campanita y se puede revocar', async () => {
  const q = (await api.post('/api/quotes', { clientId, title: 'Para compartir', items: [linea('Mensualidad', 120)], notes: 'Con gusto te atiendo.' })).datos;
  assert.equal(q.share.active, false);
  const compartida = await api.post(`/api/quotes/${q.id}/share`, {});
  assert.equal(compartida.estado, 200, JSON.stringify(compartida.datos));
  assert.deepEqual([compartida.datos.status, compartida.datos.share.active, compartida.datos.share.viewCount], ['sent', true, 0], 'compartir la marca como enviada');
  const url = compartida.datos.share.url; assert.match(url, /#cotizacion=[A-Za-z0-9_-]{30,}$/);
  const tokenPublico = url.split('#cotizacion=')[1];
  assert.equal((await api.post(`/api/quotes/${q.id}/share`, {})).datos.share.url, url, 'compartir de nuevo reutiliza el mismo enlace');
  const vista = await publico(`/api/public/quote/${tokenPublico}`);
  assert.equal(vista.estado, 200, JSON.stringify(vista.datos));
  assert.deepEqual([vista.datos.code, vista.datos.recipient.firstName, vista.datos.total, vista.datos.status], [q.code, 'María', 120, 'valid']);
  assert.equal(vista.datos.items[0].description, 'Mensualidad'); assert.equal(vista.datos.notes, 'Con gusto te atiendo.');
  assert.ok(!('id' in vista.datos) && !('recipient' in vista.datos && 'email' in vista.datos.recipient), 'la página pública no expone datos internos ni de contacto');
  assert.ok(vista.datos.owner.name);
  await publico(`/api/public/quote/${tokenPublico}`);
  const conVistas = (await api.get(`/api/quotes/${q.id}`)).datos;
  assert.deepEqual([conVistas.share.viewCount, Boolean(conVistas.share.viewedAt)], [2, true]);
  const campanita = (await api.get('/api/notifications')).datos.filter(n => n.type === 'quote_viewed');
  assert.equal(campanita.length, 1); assert.match(campanita[0].title, /COT-\d{4}/); assert.match(campanita[0].body, /María González abrió «Para compartir» \(2 veces\)/);
  const pdfPublico = await crudo(`/api/public/quote/${tokenPublico}/pdf`);
  assert.equal(pdfPublico.estado, 200); assert.equal(pdfPublico.cuerpo.subarray(0, 5).toString(), '%PDF-');
  assert.equal((await publico('/api/public/quote/token-que-no-existe-0000000000000000000000')).estado, 404);
  assert.equal((await publico('/api/public/quote/corto')).estado, 404);
  const revocada = await api.delete(`/api/quotes/${q.id}/share`);
  assert.deepEqual([revocada.datos.share.active, revocada.datos.share.viewCount], [false, 0]);
  assert.equal((await publico(`/api/public/quote/${tokenPublico}`)).estado, 404, 'el enlace revocado deja de abrir');
  const otro = (await api.post(`/api/quotes/${q.id}/share`, {})).datos.share.url; assert.notEqual(otro, url, 'compartir tras revocar crea un enlace nuevo');
});

test('Q7) la cotización vencida se sigue viendo pero avisa; el PDF de la entrenadora sale; las cláusulas guardan su foto', async () => {
  const clausulas = (await api.get('/api/quote-clauses')).datos; const salud = clausulas.find(c => c.title === 'Salud y seguridad');
  const q = (await api.post('/api/quotes', { prospect: { name: 'Foto Prueba' }, issuedOn: sumar(hoy, -30), validUntil: sumar(hoy, -1), items: [linea('Algo', 40)], clauses: [{ clauseId: salud.id }] })).datos;
  const enlace = (await api.post(`/api/quotes/${q.id}/share`, {})).datos.share.url.split('#cotizacion=')[1];
  assert.equal((await publico(`/api/public/quote/${enlace}`)).datos.status, 'expired');
  const textoOriginal = q.clauses[0].body;
  await api.patch(`/api/quote-clauses/${salud.id}`, { body: 'Texto nuevo de la biblioteca.' });
  assert.equal((await api.get(`/api/quotes/${q.id}`)).datos.clauses[0].body, textoOriginal, 'editar la biblioteca no cambia lo ya mostrado');
  const pdf = await crudo(`/api/quotes/${q.id}/pdf`, token);
  assert.equal(pdf.estado, 200); assert.match(pdf.tipo, /application\/pdf/); assert.equal(pdf.cuerpo.subarray(0, 5).toString(), '%PDF-'); assert.ok(pdf.cuerpo.length > 1500);
  assert.equal((await crudo('/api/quotes/00000000-0000-0000-0000-000000000000/pdf', token)).estado, 404);
  assert.equal((await crudo(`/api/quotes/${q.id}/pdf`, '')).estado, 401);
});

test('Q8) si el cliente se elimina, la cotización conserva a quién iba dirigida', async () => {
  const id = (await api.post('/api/clients', { fullName: 'Cliente Efímero', cutoffDay: 1, email: 'efimero.cot@prueba.test' })).datos.id;
  const q = (await api.post('/api/quotes', { clientId: id, items: [linea('Algo', 10)] })).datos;
  await db`DELETE FROM clients WHERE id = ${id}`;
  const despues = (await api.get(`/api/quotes/${q.id}`)).datos;
  assert.deepEqual([despues.recipient.name, despues.recipient.isClient], ['Cliente Efímero', false]);
});

test('Q9) la migración 076 se revierte con orden expresa y se vuelve a aplicar', async () => {
  const down = await readFile(new URL('../migrations-down/076_quotes.down.sql', import.meta.url), 'utf8');
  const up = await readFile(new URL('../migrations/076_quotes.sql', import.meta.url), 'utf8');
  const conexion = await db.reserve();
  try {
    await assert.rejects(() => conexion.unsafe(down), /exige orden expresa/);
    await conexion.unsafe('ROLLBACK');
    await conexion.unsafe(`SET billing.allow_destructive_down = 'on'`); await conexion.unsafe(down); await conexion.unsafe('RESET billing.allow_destructive_down');
  } finally { conexion.release(); }
  assert.equal((await db`SELECT to_regclass('quotes') AS t`)[0].t, null);
  await db.unsafe(up);
  assert.ok((await db`SELECT to_regclass('quotes') AS t`)[0].t);
});
