// Datos ficticios: nunca incluir aquí los datos legales de la cuenta real.
// Editar y eliminar contratos (Joel, 14-10-2026): sin firmar se edita y se borra; firmado solo se borra si era "de prueba"; el real firmado sigue intacto.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import postgres from 'postgres';
import { readFile } from 'node:fs/promises';
import { CREDENCIALES, SETUP_TOKEN, cliente, levantar } from './harness.mjs';
import { signaturePayload } from './signature-fixture.mjs';
import { abrirPantalla, esperar } from './ui-harness.mjs';

let server, api, db, token, number = 0;
const today = () => new Date(Date.now() - 5 * 3600000).toISOString().slice(0, 10);
const ok = (result, status = 201) => { assert.equal(result.estado, status, JSON.stringify(result.datos)); return result.datos; };
before(async () => {
  server = await levantar(); api = cliente(server.base); db = postgres(server.databaseUrl, { onnotice: () => {}, max: 1 });
  const setup = ok(await api.post('/api/auth/setup', CREDENCIALES, { 'x-setup-token': SETUP_TOKEN })); token = setup.token; api.usarToken(token);
  ok(await api.patch('/api/account-settings', { legalName: 'Entrenadora Ficticia', legalId: 'EID-01', contractCity: 'Ciudad de Prueba' }), 200);
}, { timeout: 90000 });
after(async () => { await db?.end({ timeout: 1 }); await server?.parar(); });
async function escenario() {
  const client = ok(await api.post('/api/clients', { fullName: 'Cliente Edita ' + (++number), email: `edita${number}@prueba.test`, cutoffDay: Number(today().slice(-2)), idDocument: 'CID-' + number }));
  const link = ok(await api.post(`/api/clients/${client.id}/access-link`, {}));
  const access = ok(await api.post('/api/auth/access-link/' + String(link.url).split('acceso=')[1], { password: 'contrasena-portal-larga' }), 200);
  const portal = cliente(server.base); portal.usarToken(access.token);
  const terms = { templateKey: 'mensualidad', quantity: 8, price: 200, rescheduleFrom: '08:00', rescheduleTo: '12:00' };
  const crear = async (extra = {}) => ok(await api.post(`/api/clients/${client.id}/contracts`, { ...terms, ...extra }));
  const firmar = async (contract) => ok(await portal.post(`/api/contracts/${contract.id}/sign`, { accepted: true, signedName: client.full_name, ...await signaturePayload() }), 200);
  return { client, portal, terms, crear, firmar };
}
const docsContrato = async clientId => (await db`SELECT id, object_key FROM documents WHERE client_id = ${clientId} AND kind = 'contract'`);

test('editar un borrador actualiza clases y monto en el texto y el PDF, sin acumular PDF viejos', async () => {
  const s = await escenario(); const c = await s.crear();
  assert.match(c.body_text, /8 clases/); assert.match(c.body_text, /\$200\.00/);
  const editado = ok(await api.patch(`/api/contracts/${c.id}`, { ...s.terms, quantity: 12, price: 260 }), 200);
  assert.equal(editado.status, 'borrador'); assert.match(editado.body_text, /12 clases/); assert.match(editado.body_text, /\$260\.00/); assert.doesNotMatch(editado.body_text, /\$200\.00/);
  assert.equal((await docsContrato(s.client.id)).length, 1, 'el PDF anterior se reemplaza, no se acumula');
  assert.equal(editado.values.QUANTITY, 12);
});

test('editar un contrato ENVIADO lo devuelve a borrador: la clienta no puede firmar un texto que no leyó', async () => {
  const s = await escenario(); const c = await s.crear({ send: true }); assert.equal(c.status, 'enviado');
  const editado = ok(await api.patch(`/api/contracts/${c.id}`, { ...s.terms, quantity: 10, price: 240 }), 200);
  assert.equal(editado.status, 'borrador'); assert.equal(editado.sent_at, null);
  assert.equal((await s.portal.post(`/api/contracts/${c.id}/sign`, { accepted: true, signedName: s.client.full_name, ...await signaturePayload() })).estado, 409, 'ya no está pendiente de firma');
  ok(await api.post(`/api/contracts/${c.id}/send`, {}), 200);
  const firmado = await s.firmar(c); assert.match(firmado.body_text, /10 clases/); assert.match(firmado.body_text, /\$240\.00/);
});

test('un contrato firmado no se edita ni se borra; el cliente real con contrato firmado no se puede borrar', async () => {
  const s = await escenario(); const c = await s.crear({ send: true }); await s.firmar(c);
  assert.equal((await api.patch(`/api/contracts/${c.id}`, { ...s.terms, quantity: 20 })).estado, 409);
  assert.equal((await api.delete(`/api/contracts/${c.id}`)).estado, 409);
  assert.equal((await api.delete(`/api/clients/${s.client.id}`)).estado, 409, 'el expediente conserva la evidencia');
  await assert.rejects(db`DELETE FROM client_contracts WHERE id = ${c.id}`, /firmado no se borra/);
  await assert.rejects(db`UPDATE client_contracts SET is_test = true WHERE id = ${c.id}`, /inmutable/, 'no se puede marcar como prueba un contrato ya firmado');
});

test('borrar un contrato sin firmar lo quita con su PDF; otro dueño recibe 404', async () => {
  const s = await escenario(); const c = await s.crear({ send: true });
  assert.equal((await docsContrato(s.client.id)).length, 1);
  ok(await api.delete(`/api/contracts/${c.id}`), 200);
  assert.equal((await db`SELECT count(*)::int AS n FROM client_contracts WHERE id = ${c.id}`)[0].n, 0);
  assert.equal((await docsContrato(s.client.id)).length, 0, 'sin PDF huérfano');
  assert.equal((await api.delete(`/api/contracts/${c.id}`)).estado, 404);
  const otro = cliente(server.base); assert.equal((await otro.delete(`/api/contracts/${c.id}`)).estado, 401);
});

test('un contrato de PRUEBA firmado sí se borra, con su PDF y sus firmas; y el expediente de prueba también', async () => {
  const s = await escenario(); const c = await s.crear({ send: true, isTest: true }); assert.equal(c.is_test, true);
  const firmado = await s.firmar(c); assert.equal(firmado.status, 'firmado');
  const [antes] = await db`SELECT client_signature_key, client_signature_strokes_key, pdf_document_id FROM client_contracts WHERE id = ${c.id}`;
  assert.ok(antes.client_signature_key && antes.pdf_document_id);
  ok(await api.delete(`/api/contracts/${c.id}`), 200);
  assert.equal((await db`SELECT count(*)::int AS n FROM client_contracts WHERE id = ${c.id}`)[0].n, 0);
  assert.equal((await docsContrato(s.client.id)).length, 0);
  // Un expediente cuyo único contrato firmado es de prueba sí se puede borrar.
  const t = await escenario(); const tc = await t.crear({ send: true, isTest: true }); await t.firmar(tc);
  ok(await api.delete(`/api/clients/${t.client.id}`), 200);
});

test('pantalla a 375 px: Editar abre el contrato con sus montos y clases, guarda sobre el mismo; Eliminar pide confirmación y lo quita', async () => {
  const s = await escenario(); const c = await s.crear();
  const staff = await abrirPantalla({ baseApi: server.base, token, ancho: 375 });
  try {
    await esperar(() => staff.evaluar('data.clients.length') > 0);
    staff.evaluar(`clientDetail('${s.client.id}')`);
    const editar = await esperar(() => staff.q(`[data-contract-edit="${c.id}"]`), { mensaje: 'botón Editar' });
    assert.ok(staff.q(`[data-contract-delete="${c.id}"]`), 'botón Eliminar');
    staff.clic(editar);
    await esperar(() => staff.q('#contract-editor'), { mensaje: 'editor' });
    assert.match(staff.q('#contract-editor').textContent, /Editar contrato/);
    assert.equal(staff.q('#contract-editor [name="quantity"]').value, '8', 'trae las clases del contrato');
    assert.equal(staff.q('#contract-editor [name="price"]').value, '200', 'trae el monto del contrato');
    staff.cambiar(staff.q('#contract-editor [name="quantity"]'), '12'); staff.cambiar(staff.q('#contract-editor [name="price"]'), '260');
    staff.q('#contract-editor [name="isTest"]').checked = true;
    staff.q('#contract-editor').requestSubmit();
    await esperar(async () => (await db`SELECT values FROM client_contracts WHERE id = ${c.id}`)[0].values.QUANTITY === 12, { mensaje: 'guardado en el mismo contrato' });
    const [fila] = await db`SELECT body_text, is_test FROM client_contracts WHERE id = ${c.id}`;
    assert.match(fila.body_text, /12 clases/); assert.match(fila.body_text, /\$260\.00/); assert.equal(fila.is_test, true);
    assert.equal((await db`SELECT count(*)::int AS n FROM client_contracts WHERE client_id = ${s.client.id}`)[0].n, 1, 'no crea un contrato nuevo');
    staff.window.confirm = () => true;
    staff.evaluar(`clientDetail('${s.client.id}')`);
    const borrar = await esperar(() => staff.q(`[data-contract-delete="${c.id}"]`), { mensaje: 'botón Eliminar' });
    staff.clic(borrar);
    await esperar(async () => (await db`SELECT count(*)::int AS n FROM client_contracts WHERE id = ${c.id}`)[0].n === 0, { mensaje: 'contrato eliminado' });
    assert.deepEqual(staff.errores, []);
  } finally { await staff.cerrar(); }
});

test('la reversa 072 devuelve la regla anterior (firmado = imborrable)', async () => {
  const down = await readFile(new URL('../migrations-down/072_contract_test_flag.down.sql', import.meta.url), 'utf8');
  await db.unsafe(down);
  assert.equal((await db`SELECT count(*)::int AS n FROM information_schema.columns WHERE table_name = 'client_contracts' AND column_name = 'is_test'`)[0].n, 0);
});
