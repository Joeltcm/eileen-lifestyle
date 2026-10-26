// Firma de Eileen en los contratos: si se guarda DESPUÉS de enviar el contrato, al firmarlo el cliente se usa la actual;
// y en la pantalla, el aviso cuando falta y el acceso directo para guardarla o cambiarla.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import postgres from 'postgres';
import { CREDENCIALES, SETUP_TOKEN, cliente, levantar } from './harness.mjs';
import { signaturePayload } from './signature-fixture.mjs';
import { abrirPantalla, esperar } from './ui-harness.mjs';

let server, api, db, token, number = 0;
const ok = (result, status = 201) => { assert.equal(result.estado, status, JSON.stringify(result.datos)); return result.datos; };
before(async () => {
  server = await levantar(); api = cliente(server.base); db = postgres(server.databaseUrl, { onnotice: () => {}, max: 1 });
  token = ok(await api.post('/api/auth/setup', CREDENCIALES, { 'x-setup-token': SETUP_TOKEN })).token; api.usarToken(token);
  ok(await api.patch('/api/account-settings', { legalName: 'Entrenadora Ficticia', legalId: 'EID-01', contractCity: 'Ciudad de Prueba' }), 200);
  ok(await api.put('/api/working-hours', { tramos: [1, 2, 3, 4, 5].map(weekday => ({ weekday, startsAt: '07:00', endsAt: '17:00' })) }), 200);
}, { timeout: 90000 });
after(async () => { await db?.end({ timeout: 1 }); await server?.parar(); });

async function scenario() {
  const plan = ok(await api.post('/api/plans', { name: 'Firma ' + (++number), billingModel: 'monthly', price: 200, sessionsIncluded: 8 }));
  const client = ok(await api.post('/api/clients', { fullName: 'Cliente Firma ' + number, email: `firma${number}@prueba.test`, cutoffDay: 10, planId: plan.id, idDocument: 'CID-' + number, birthDate: '1990-01-01' }));
  const link = ok(await api.post('/api/clients/' + client.id + '/access-link', {}), 201);
  const access = ok(await api.post('/api/auth/access-link/' + String(link.url).split('acceso=')[1], { password: 'contrasena-portal-larga' }), 200);
  const portal = cliente(server.base); portal.usarToken(access.token);
  const sent = async () => ok(await api.post('/api/clients/' + client.id + '/contracts', { send: true }));
  return { client, portal, sent };
}
const ownerSignature = async () => { const v = await signaturePayload(); return { imageData: v.signaturePng, strokes: v.signatureStrokes, source: 'draw' }; };
const clientSignature = async name => ({ accepted: true, signedName: name, ...await signaturePayload() });

test('NS1) contrato enviado SIN firma de Eileen: si ella la guarda antes de que el cliente firme, el contrato firmado la lleva; y queda congelada', async () => {
  assert.equal((await api.get('/api/account-settings')).datos.has_owner_signature, false);
  const s = await scenario(); const contract = await s.sent();
  assert.equal((await db`SELECT owner_signature_key FROM client_contracts WHERE id = ${contract.id}`)[0].owner_signature_key, null, 'se envió sin firma de Eileen');
  ok(await api.post('/api/account-settings/signature', await ownerSignature()), 200);
  ok(await s.portal.post('/api/contracts/' + contract.id + '/sign', await clientSignature(s.client.full_name)), 200);
  const row = (await db`SELECT status, owner_signature_key, client_signature_key FROM client_contracts WHERE id = ${contract.id}`)[0];
  assert.equal(row.status, 'firmado'); assert.ok(row.owner_signature_key, 'el contrato firmado lleva la firma de Eileen'); assert.ok(row.client_signature_key);
  await assert.rejects(db`UPDATE client_contracts SET owner_signature_key = NULL WHERE id = ${contract.id}`, /inmutable/);
});

test('NS2) si Eileen nunca la guardó, el contrato se firma igual (opcional) y queda sin su firma', async () => {
  await db`UPDATE account_settings SET owner_signature_key = NULL, owner_signature_updated_at = NULL`;
  const s = await scenario(); const contract = await s.sent();
  ok(await s.portal.post('/api/contracts/' + contract.id + '/sign', await clientSignature(s.client.full_name)), 200);
  assert.equal((await db`SELECT owner_signature_key FROM client_contracts WHERE id = ${contract.id}`)[0].owner_signature_key, null);
});

test('NS3) pantalla: aviso si falta la firma de Eileen, la guarda con un toque y queda el acceso directo para cambiarla', async () => {
  await db`UPDATE account_settings SET owner_signature_key = NULL, owner_signature_updated_at = NULL`;
  const s = await scenario();
  const p = await abrirPantalla({ baseApi: server.base, token, ancho: 375 });
  try {
    await esperar(() => p.evaluar('typeof clientDetail === "function" && data && data.clients && data.clients.length > 0'), { mensaje: 'aplicación cargada' });
    // el recuadro de firma se simula con la firma de pruebas: lo que se prueba es el aviso y el guardado
    const payload = await ownerSignature();
    p.window.__firma = payload; p.evaluar('window.openSignatureCapture = async () => window.__firma');
    p.evaluar(`clientDetail('${s.client.id}')`);
    const aviso = await esperar(() => p.q('#owner-sign-slot .owner-sign-notice.warn'), { mensaje: 'aviso de firma faltante' });
    assert.match(aviso.textContent, /Aún no has guardado tu firma/); assert.match(aviso.textContent, /ya no se puede cambiar/);
    p.clic(p.q('[data-owner-sign]', aviso));
    await esperar(() => p.q('#owner-sign-slot .owner-sign-notice.ok'), { mensaje: 'firma guardada' });
    assert.equal((await api.get('/api/account-settings')).datos.has_owner_signature, true, 'quedó guardada en el servidor');
    assert.match(p.q('#owner-sign-slot').textContent, /Tu firma saldrá sola en el contrato/);
    assert.match(p.q('#owner-sign-slot [data-owner-sign]').textContent, /Cambiar mi firma/);
    // el generador de contratos muestra el mismo recuadro y, al cambiarla, refresca la vista previa sin errores
    p.clic(p.q('#generate-client-contract'));
    await esperar(() => p.q('#contract-editor #owner-sign-slot .owner-sign-notice.ok'), { ms: 20000, mensaje: 'recuadro en el generador de contratos' });
    p.clic(p.q('#contract-editor [data-owner-sign]'));
    await esperar(() => p.q('#contract-editor #contract-preview a'), { mensaje: 'vista previa' });
    assert.equal(p.errores.length, 0, `sin errores de JavaScript: ${p.errores.join(' | ')}`);
  } finally { await p.cerrar(); }
});

test('NS4) pantalla: el aviso también sale en la firma presencial', async () => {
  await db`UPDATE account_settings SET owner_signature_key = NULL, owner_signature_updated_at = NULL`;
  const s = await scenario(); const contract = await s.sent();
  const p = await abrirPantalla({ baseApi: server.base, token, ancho: 375 });
  try {
    await esperar(() => p.evaluar('typeof inPersonContractDialog === "function" && data && data.clients && data.clients.length > 0'), { mensaje: 'aplicación cargada' });
    p.evaluar(`inPersonContractDialog(data.clients.find(c => c.id === '${s.client.id}'), '${contract.id}')`);
    const aviso = await esperar(() => p.q('#in-person-contract #owner-sign-slot .owner-sign-notice.warn'), { mensaje: 'aviso en la firma presencial' });
    assert.match(aviso.textContent, /Guardar mi firma ahora/);
    assert.equal(p.errores.length, 0, `sin errores de JavaScript: ${p.errores.join(' | ')}`);
  } finally { await p.cerrar(); }
});
