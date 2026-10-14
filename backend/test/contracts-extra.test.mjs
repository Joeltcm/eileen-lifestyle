// Datos ficticios: nunca incluir aquí los datos legales de la cuenta real.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import postgres from 'postgres';
import { CREDENCIALES, SETUP_TOKEN, cliente, levantar } from './harness.mjs';
import { signaturePayload } from './signature-fixture.mjs';

let server, api, db, n = 0;
const today = () => new Date(Date.now() - 5 * 3600000).toISOString().slice(0, 10);
before(async () => {
  server = await levantar(); api = cliente(server.base); db = postgres(server.databaseUrl, { onnotice: () => {}, max: 1 });
  const setup = await api.post('/api/auth/setup', CREDENCIALES, { 'x-setup-token': SETUP_TOKEN }); api.usarToken(setup.datos.token);
  await api.patch('/api/account-settings', { legalName: 'Entrenadora Ficticia', legalId: 'ID-FICTICIO-01', contractCity: 'Ciudad de Prueba' });
  await api.put('/api/working-hours', { tramos: [1, 2, 3, 4, 5].map(weekday => ({ weekday, startsAt: '07:00', endsAt: '17:00' })) });
}, { timeout: 90000 });
after(async () => { await db?.end({ timeout: 1 }); await server?.parar(); });
const ok = (r, s = 201) => { assert.equal(r.estado, s, JSON.stringify(r.datos)); return r.datos; };
async function escenario() {
  const plan = ok(await api.post('/api/plans', { name: 'Plan extra ' + (++n), billingModel: 'monthly', price: 300, sessionsIncluded: 12 }));
  const client = ok(await api.post('/api/clients', { fullName: 'Ana Extra ' + n, email: `extra${n}@prueba.test`, cutoffDay: Number(today().slice(-2)), planId: plan.id, idDocument: 'PASAPORTE-FICTICIO' }));
  const link = ok(await api.post(`/api/clients/${client.id}/access-link`, {}));
  const access = ok(await api.post('/api/auth/access-link/' + String(link.url).split('acceso=')[1], { password: 'contrasena-portal-larga' }), 200);
  const portal = cliente(server.base); portal.usarToken(access.token);
  return { client, portal };
}

test('los PDF de borrador y de envío no se apilan como "Contrato" en los documentos del expediente: solo aparece el firmado', async () => {
  const s = await escenario();
  const borrador = ok(await api.post(`/api/clients/${s.client.id}/contracts`, { templateKey: 'mensualidad', send: false }));
  ok(await api.post(`/api/contracts/${borrador.id}/send`, {}), 200);
  ok(await s.portal.post(`/api/contracts/${borrador.id}/sign`, { accepted: true, signedName: s.client.full_name, ...await signaturePayload() }), 200);
  const docs = ok(await api.get(`/api/documents?clientId=${s.client.id}`), 200).filter(d => d.kind === 'contract');
  assert.equal(docs.length, 1, `un solo documento Contrato (el firmado); hay ${docs.length}: ${docs.map(d => d.original_name).join(', ')}`);
  const [firmado] = await db`SELECT pdf_document_id FROM client_contracts WHERE id = ${borrador.id}`;
  assert.equal(docs[0].id, firmado.pdf_document_id);
  assert.match(docs[0].original_name, /^Contrato firmado \d{2}-\d{2}-\d{4}\.pdf$/, 'nombre legible con la fecha de firma');
});

test('un escaneo en papel subido a mano sigue apareciendo en los documentos', async () => {
  const s = await escenario();
  const [doc] = await db`INSERT INTO documents (client_id, kind, object_key, original_name, content_type, size_bytes, upload_status) VALUES (${s.client.id}, 'contract', ${'clients/x/escaneo.pdf'}, 'escaneo.pdf', 'application/pdf', 10, 'ready') RETURNING id`;
  const docs = ok(await api.get(`/api/documents?clientId=${s.client.id}`), 200);
  assert.ok(docs.some(d => d.id === doc.id));
});

test('los contratos no llevan cláusula de feriados (Joel la omitió) ni ningún texto pendiente', async () => {
  const s = await escenario();
  const preview = ok(await api.post(`/api/clients/${s.client.id}/contracts/preview`, { templateKey: 'mensualidad', quantity: 8, price: 200, rescheduleFrom: '08:00', rescheduleTo: '12:00' }), 200);
  assert.doesNotMatch(preview.bodyText, /feriado|\[pendiente|\{\{/i);
  assert.doesNotMatch(preview.bodyText, /inteligencia artificial|fotos de progreso/i, 'sin mención a IA ni a fotos de progreso');
  assert.match(preview.bodyText, /Ley 81 de 2019/, 'se conserva la referencia a la ley de datos');
  assert.match(preview.bodyText, /Rutina sustitutiva\./);
  assert.ok(!(preview.warnings || []).some(w => /feriado/i.test(w)), 'sin avisos de feriados');
});

test('un contrato por TIPO DE CLIENTE: a crédito -> contrato de crédito; anticipado -> mensualidad anticipada; nunca mezclados', async () => {
  // Cliente a crédito.
  const cred = ok(await api.post('/api/clients', { fullName: 'Julio Credito', email: 'julio.credito@prueba.test', cutoffDay: Number(today().slice(-2)), idDocument: 'PASAPORTE-CRED', paymentMode: 'no_anticipado', creditSessionPrice: 25 }));
  const cp = ok(await api.post(`/api/clients/${cred.id}/contracts/preview`, { quantity: 8, rescheduleFrom: '08:00', rescheduleTo: '12:00' }), 200);
  assert.equal(cp.templateKey, 'credito'); assert.equal(cp.canSend, true, JSON.stringify(cp.missing));
  assert.match(cp.bodyText, /CLIENTE A CRÉDITO/); assert.match(cp.bodyText, /\$25\.00 USD/); assert.match(cp.bodyText, /se cobra/);
  assert.doesNotMatch(cp.bodyText, /se descuenta del plan|MENSUALIDAD ANTICIPADA|\[pendiente/i);
  assert.equal((await api.post(`/api/clients/${cred.id}/contracts/preview`, { templateKey: 'mensualidad' })).estado, 409, 'a un cliente a crédito no se le genera mensualidad');
  const sent = ok(await api.post(`/api/clients/${cred.id}/contracts`, { quantity: 8, rescheduleFrom: '08:00', rescheduleTo: '12:00', send: true }));
  assert.equal(sent.template_key, 'credito', 'el CHECK de la 071 admite el modelo de crédito');
  // Cliente anticipado.
  const ant = await escenario();
  const ap = ok(await api.post(`/api/clients/${ant.client.id}/contracts/preview`, { quantity: 8, price: 200, rescheduleFrom: '08:00', rescheduleTo: '12:00', paymentMode: 'no_anticipado', creditClassPrice: 30 }), 200);
  assert.equal(ap.templateKey, 'mensualidad'); assert.match(ap.bodyText, /MENSUALIDAD ANTICIPADA/); assert.match(ap.bodyText, /pago es anticipado/);
  assert.doesNotMatch(ap.bodyText, /crédito/i, 'el contrato anticipado no menciona crédito aunque se pida');
  assert.equal((await api.post(`/api/clients/${ant.client.id}/contracts/preview`, { templateKey: 'credito' })).estado, 409);
});

test('vigencia: con 0 meses NO hay fecha límite pactada; con meses, plazo fijo; nunca "por 0 meses"', async () => {
  const s = await escenario();
  const pedir = async (templateKey, commitmentMonths) => ok(await api.post(`/api/clients/${s.client.id}/contracts/preview`, { templateKey, quantity: 8, price: 200, commitmentMonths, rescheduleFrom: '08:00', rescheduleTo: '12:00' }), 200).bodyText;
  const sin = await pedir('mensualidad', 0);
  assert.match(sin, /No se ha pactado una fecha límite para este contrato/); assert.match(sin, /termina cuando el cliente o Eileen lo acuerden/);
  assert.doesNotMatch(sin, /por 0 meses|Si el plazo es 0/);
  const con = await pedir('mensualidad', 6);
  assert.match(con, /se contrata por 6 meses/); assert.match(con, /se renueva automáticamente mes a mes/); assert.doesNotMatch(con, /No se ha pactado una fecha límite/);
  assert.match(await pedir('mensualidad', 1), /por 1 mes\./, 'singular');
  const paquete = await pedir('paquete', 0); assert.match(paquete, /No se ha pactado una fecha límite/); assert.match(paquete, /no genera una mensualidad automática/);
  assert.match(await pedir('rutinas', 0), /No se ha pactado una fecha límite/);
});
