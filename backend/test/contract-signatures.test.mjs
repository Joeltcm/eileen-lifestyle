import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import postgres from 'postgres';
import sharp from 'sharp';
import { createHash } from 'node:crypto';
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
  return { client, portal, portalToken: access.token, sent };
}
const contractSignature = async signedName => ({ accepted: true, signedName, ...await signaturePayload() });
const ownerSignature = async source => { const value = await signaturePayload(); return { imageData: value.signaturePng, strokes: value.signatureStrokes, source }; };

test('firma de Eileen opcional: sin ella el contrato se envía con espacio pendiente; luego se guarda dibujada o subida', async () => {
  assert.equal((await api.get('/api/account-settings/signature')).estado, 404);
  const s = await scenario(); const contract = await s.sent();
  assert.equal('owner_signature_key' in contract, false, 'la API no expone la clave privada de R2');
  assert.equal((await db`SELECT owner_signature_key FROM client_contracts WHERE id = ${contract.id}`)[0].owner_signature_key, null);
  const pdf = await fetch(server.base + '/api/contracts/' + contract.id + '/pdf', { headers: { Authorization: 'Bearer ' + token } });
  assert.equal(pdf.status, 200); assert.ok((await pdf.arrayBuffer()).byteLength > 1000);
  ok(await api.post('/api/account-settings/signature', await ownerSignature('draw')), 200);
  assert.equal((await api.get('/api/account-settings')).datos.has_owner_signature, true);
  assert.match((await api.get('/api/account-settings/signature')).datos.imageData, /^data:image\/png;base64,/);
  ok(await api.post('/api/account-settings/signature', await ownerSignature('upload')), 200);
});

test('portal exige firma manuscrita válida, congela método, claves privadas, fecha, hash, IP y agente', async () => {
  const s = await scenario(); const contract = await s.sent();
  assert.equal((await s.portal.post('/api/contracts/' + contract.id + '/sign', { accepted: true, signedName: s.client.full_name })).estado, 400);
  const signed = ok(await s.portal.post('/api/contracts/' + contract.id + '/sign', await contractSignature(s.client.full_name)), 200);
  assert.equal(signed.signature_method, 'portal'); assert.equal(signed.signed_in_person_by, null);
  assert.equal('client_signature_key' in signed, false); assert.equal('client_signature_strokes_key' in signed, false);
  const evidence = (await db`SELECT client_signature_key, client_signature_strokes_key FROM client_contracts WHERE id = ${contract.id}`)[0];
  assert.match(evidence.client_signature_key, /^signatures\/client\//); assert.match(evidence.client_signature_strokes_key, /\.strokes\.json$/);
  assert.ok(signed.signed_ip && signed.signed_user_agent && signed.signed_at && signed.pdf_sha256);
  const response = await fetch(server.base + '/api/contracts/' + contract.id + '/pdf', { headers: { Authorization: 'Bearer ' + s.portalToken } });
  const bytes = Buffer.from(await response.arrayBuffer()); assert.equal(createHash('sha256').update(bytes).digest('hex'), signed.pdf_sha256);
});

test('firma presencial: solo personal, borrador o enviado, nombre exacto y auditoría del usuario', async () => {
  const s = await scenario(); const draft = ok(await api.post('/api/clients/' + s.client.id + '/contracts', {})); const payload = await contractSignature(s.client.full_name);
  assert.equal((await s.portal.post('/api/contracts/' + draft.id + '/sign-in-person', payload)).estado, 403, 'solo personal; la clienta no firma por esta vía');
  const sent = ok(await api.post('/api/contracts/' + draft.id + '/send', {}), 200);
  assert.equal((await s.portal.post('/api/contracts/' + sent.id + '/sign-in-person', payload)).estado, 403);
  assert.equal((await api.post('/api/contracts/' + sent.id + '/sign-in-person', { ...payload, signedName: 'Nombre incorrecto' })).estado, 400);
  const signed = ok(await api.post('/api/contracts/' + sent.id + '/sign-in-person', payload), 200);
  assert.equal(signed.signature_method, 'presencial'); assert.ok(signed.signed_in_person_by);
});

test('servidor rechaza PNG inválido, firma vacía o punto, exceso de 300 KB y trazos inválidos', async () => {
  assert.equal((await api.post('/api/account-settings/signature', { imageData: 'data:image/png;base64,bm8=', source: 'upload' })).estado, 400);
  const blank = await sharp({ create: { width: 320, height: 100, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 0 } } }).png().toBuffer();
  assert.equal((await api.post('/api/account-settings/signature', { imageData: `data:image/png;base64,${blank.toString('base64')}`, source: 'upload' })).estado, 400);
  const valid = await signaturePayload();
  assert.equal((await api.post('/api/account-settings/signature', { imageData: valid.signaturePng, strokes: [[{ x: .5, y: .5, time: 1, pressure: .5 }]], source: 'draw' })).estado, 400);
  const tooLarge = `data:image/png;base64,${Buffer.alloc(300 * 1024 + 1, 1).toString('base64')}`;
  assert.equal((await api.post('/api/account-settings/signature', { imageData: tooLarge, source: 'upload' })).estado, 400);
});

test('cambiar la firma de Eileen no modifica el contrato ya firmado ni su PDF', async () => {
  const s = await scenario(); const contract = await s.sent(); const signed = ok(await s.portal.post('/api/contracts/' + contract.id + '/sign', await contractSignature(s.client.full_name)), 200);
  const before = Buffer.from(await (await fetch(server.base + '/api/contracts/' + contract.id + '/pdf', { headers: { Authorization: 'Bearer ' + s.portalToken } })).arrayBuffer());
  const oldOwnerKey = (await db`SELECT owner_signature_key FROM client_contracts WHERE id = ${contract.id}`)[0].owner_signature_key;
  ok(await api.post('/api/account-settings/signature', await ownerSignature('draw')), 200);
  const row = (await db`SELECT owner_signature_key, pdf_sha256 FROM client_contracts WHERE id = ${contract.id}`)[0];
  assert.equal(row.owner_signature_key, oldOwnerKey); assert.equal(row.pdf_sha256, signed.pdf_sha256);
  const after = Buffer.from(await (await fetch(server.base + '/api/contracts/' + contract.id + '/pdf', { headers: { Authorization: 'Bearer ' + s.portalToken } })).arrayBuffer());
  assert.equal(createHash('sha256').update(after).digest('hex'), createHash('sha256').update(before).digest('hex'));
  await assert.rejects(db`UPDATE client_contracts SET signature_method = 'presencial' WHERE id = ${contract.id}`, /inmutable/);
});

test('componente compartido a 375 y 820 px: lápiz, rechazo de palma, deshacer, limpiar y sin desplazamiento', async () => {
  const fixture = await signaturePayload();
  for (const width of [375, 820]) {
    const page = await abrirPantalla({ baseApi: server.base, token, ancho: width });
    try {
      await esperar(() => typeof page.window.openSignatureCapture === 'function', { mensaje: 'carga del componente de firma' });
      Object.defineProperty(page.window, 'innerHeight', { value: width === 820 ? 1180 : 760, configurable: true });
      const fakeContext = canvas => ({ canvas, setTransform() {}, scale() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, clearRect() {}, drawImage() {}, putImageData() {},
        getImageData() { const data = new Uint8ClampedArray(canvas.width * canvas.height * 4); for (let y = 20; y < Math.min(canvas.height, 70); y += 1) for (let x = 30; x < Math.min(canvas.width, 220); x += 1) { const i = (y * canvas.width + x) * 4; data[i] = 40; data[i + 1] = 30; data[i + 2] = 35; data[i + 3] = 255; } return { data }; } });
      page.window.HTMLCanvasElement.prototype.getContext = function () { return this.__context ||= fakeContext(this); };
      page.window.HTMLCanvasElement.prototype.toDataURL = () => fixture.signaturePng;
      page.window.__capturedSignature = undefined; page.window.openSignatureCapture({ title: 'Prueba de firma', allowUpload: true, previewName: 'Entrenadora Ficticia', previewLegalId: 'EID-01' }).then(value => { page.window.__capturedSignature = value; });
      const dialog = await esperar(() => page.q('dialog.signature-dialog-host[open]'));
      assert.match(dialog.textContent, /Entrenadora Ficticia/); assert.match(dialog.textContent, /EID-01/); assert.match(dialog.textContent, /Volver a intentar/);
      const canvas = page.q('canvas', dialog); const pad = page.q('.signature-pad', dialog);
      const rect = { left: 0, top: 0, width: width === 375 ? 320 : 620, height: 190, right: width === 375 ? 320 : 620, bottom: 190, x: 0, y: 0, toJSON() {} };
      canvas.getBoundingClientRect = () => rect; pad.getBoundingClientRect = () => rect; await page.quieta(30);
      const pointer = (type, x, y, pointerType = 'pen') => { const event = new page.window.Event(type, { bubbles: true, cancelable: true }); Object.defineProperties(event, {
        clientX: { value: x }, clientY: { value: y }, pointerId: { value: pointerType === 'pen' ? 1 : 2 }, pointerType: { value: pointerType }, pressure: { value: .6 }, getCoalescedEvents: { value: () => [event] }
      }); return event; };
      assert.equal(canvas.dispatchEvent(pointer('pointerdown', 20, 100)), false, 'touch-action del lienzo evita desplazar la página');
      canvas.dispatchEvent(pointer('pointermove', 80, 40));
      canvas.dispatchEvent(pointer('pointerdown', 100, 100, 'touch')); // palma: se ignora mientras el lápiz está activo
      canvas.dispatchEvent(pointer('pointermove', 150, 80)); canvas.dispatchEvent(pointer('pointerup', 150, 80));
      page.clic(page.q('[data-signature-undo]', dialog));
      page.clic(page.q('[data-signature-clear]', dialog));
      canvas.dispatchEvent(pointer('pointerdown', 25, 120));
      for (const [x, y] of [[70, 45], [120, 100], [180, 35], [235, 90], [285, 40]]) canvas.dispatchEvent(pointer('pointermove', x, y));
      canvas.dispatchEvent(pointer('pointerup', 285, 40)); assert.equal(page.q('[data-signature-preview-image]', dialog).hidden, false); page.clic(page.q('[data-signature-use]', dialog));
      const captured = await esperar(() => page.window.__capturedSignature);
      assert.match(captured.imageData, /^data:image\/png;base64,/); assert.equal(captured.strokes.length, 1); assert.ok(captured.strokes[0].length >= 6);
      assert.deepEqual(page.errores, []);
    } finally { await page.cerrar(); }
  }
});

test('071: la reversa se niega con firmas sin orden expresa y funciona con la orden', async () => {
  const down = await readFile(new URL('../migrations-down/071_contract_handwritten_signatures.down.sql', import.meta.url), 'utf8');
  await assert.rejects(db.unsafe(down), /orden expresa/); await db.unsafe('ROLLBACK');
  await db.unsafe("SET billing.allow_destructive_down = 'on'"); await db.unsafe(down);
  const columns = await db`SELECT column_name FROM information_schema.columns WHERE table_name = 'client_contracts' AND column_name = 'signature_method'`;
  assert.equal(columns.length, 0);
  await db.unsafe(await readFile(new URL('../migrations/071_contract_handwritten_signatures.sql', import.meta.url), 'utf8'));
});

// Revisión de Claude (v306): la palma apoyada entre trazos del Apple Pencil no dibuja, y otro dedo no corta el trazo en curso.
test('rechazo de palma ENTRE trazos del lápiz y un solo puntero a la vez: la palma no dibuja ni corta el trazo', async () => {
  const fixture = await signaturePayload();
  for (const width of [375, 820]) {
    const page = await abrirPantalla({ baseApi: server.base, token, ancho: width });
    try {
      await esperar(() => typeof page.window.openSignatureCapture === 'function', { mensaje: 'carga del componente de firma' });
      Object.defineProperty(page.window, 'innerHeight', { value: width === 820 ? 1180 : 760, configurable: true });
      const fakeContext = canvas => ({ canvas, setTransform() {}, scale() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, clearRect() {}, drawImage() {}, putImageData() {},
        getImageData() { const data = new Uint8ClampedArray(canvas.width * canvas.height * 4); for (let y = 20; y < Math.min(canvas.height, 70); y += 1) for (let x = 30; x < Math.min(canvas.width, 220); x += 1) { const i = (y * canvas.width + x) * 4; data[i] = 40; data[i + 1] = 30; data[i + 2] = 35; data[i + 3] = 255; } return { data }; } });
      page.window.HTMLCanvasElement.prototype.getContext = function () { return this.__context ||= fakeContext(this); };
      page.window.HTMLCanvasElement.prototype.toDataURL = () => fixture.signaturePng;
      page.window.__capturedSignature = undefined; page.window.openSignatureCapture({ title: 'Prueba de firma', allowUpload: true, previewName: 'Entrenadora Ficticia', previewLegalId: 'EID-01' }).then(value => { page.window.__capturedSignature = value; });
      const dialog = await esperar(() => page.q('dialog.signature-dialog-host[open]'));
      assert.match(dialog.textContent, /Entrenadora Ficticia/); assert.match(dialog.textContent, /EID-01/); assert.match(dialog.textContent, /Volver a intentar/);
      const canvas = page.q('canvas', dialog); const pad = page.q('.signature-pad', dialog);
      const rect = { left: 0, top: 0, width: width === 375 ? 320 : 620, height: 190, right: width === 375 ? 320 : 620, bottom: 190, x: 0, y: 0, toJSON() {} };
      canvas.getBoundingClientRect = () => rect; pad.getBoundingClientRect = () => rect; await page.quieta(30);
      const pointer = (type, x, y, pointerType = 'pen') => { const event = new page.window.Event(type, { bubbles: true, cancelable: true }); Object.defineProperties(event, {
        clientX: { value: x }, clientY: { value: y }, pointerId: { value: pointerType === 'pen' ? 1 : 2 }, pointerType: { value: pointerType }, pressure: { value: .6 }, getCoalescedEvents: { value: () => [event] }
      }); return event; };
      // Trazo 1 con el lápiz.
      canvas.dispatchEvent(pointer('pointerdown', 20, 100)); for (const [x, y] of [[60, 50], [100, 90], [140, 40]]) canvas.dispatchEvent(pointer('pointermove', x, y));
      // La palma se apoya ENTRE trazos (el lápiz ya se levantó): no debe dibujar.
      canvas.dispatchEvent(pointer('pointerup', 140, 40));
      canvas.dispatchEvent(pointer('pointerdown', 200, 150, 'touch')); canvas.dispatchEvent(pointer('pointermove', 260, 170, 'touch')); canvas.dispatchEvent(pointer('pointerup', 260, 170, 'touch'));
      // Trazo 2 con el lápiz; a mitad, un toque del dedo NO corta ni mezcla el trazo.
      canvas.dispatchEvent(pointer('pointerdown', 160, 120)); canvas.dispatchEvent(pointer('pointermove', 190, 60));
      canvas.dispatchEvent(pointer('pointerup', 300, 180, 'touch'));
      for (const [x, y] of [[220, 110], [250, 50], [280, 95]]) canvas.dispatchEvent(pointer('pointermove', x, y));
      canvas.dispatchEvent(pointer('pointerup', 280, 95)); page.clic(page.q('[data-signature-use]', dialog));
      const captured = await esperar(() => page.window.__capturedSignature);
      assert.match(captured.imageData, /^data:image\/png;base64,/); assert.equal(captured.strokes.length, 2, `solo los 2 trazos del lápiz (hay ${captured.strokes.length})`); assert.equal(captured.strokes[1].length, 5, 'el trazo 2 sigue entero tras el toque del dedo');
      assert.deepEqual(page.errores, []);
    } finally { await page.cerrar(); }
  }
});
