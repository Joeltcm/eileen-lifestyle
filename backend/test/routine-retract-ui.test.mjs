// Expediente del cliente: botón «Quitar» en cada envío de rutina y botón para crear una rutina ya dirigida a ese cliente.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { CREDENCIALES, SETUP_TOKEN, cliente, levantar } from './harness.mjs';
import { abrirPantalla, esperar } from './ui-harness.mjs';

let server, api, token;
const ok = (result, status = 201) => { assert.equal(result.estado, status, JSON.stringify(result.datos)); return result.datos; };
before(async () => {
  server = await levantar(); api = cliente(server.base);
  token = ok(await api.post('/api/auth/setup', CREDENCIALES, { 'x-setup-token': SETUP_TOKEN })).token; api.usarToken(token);
}, { timeout: 90000 });
after(async () => { await server?.parar(); });

test('RU1) quitar un envío desde el expediente lo saca de la lista; y «Nueva rutina» abre el editor con ese cliente', async () => {
  const client = ok(await api.post('/api/clients', { fullName: 'Juana Prueba Rutina', cutoffDay: 10 }));
  ok(await api.post('/api/routines', { title: 'Enviada por error', description: 'x', sessionsPerWeek: 1, clientId: client.id, exercises: [{ name: 'Sentadilla', sets: 3, reps: '10' }] }));
  const p = await abrirPantalla({ baseApi: server.base, token, ancho: 375 });
  try {
    await esperar(() => p.evaluar('typeof clientDetail === "function" && data && data.clients && data.clients.length > 0'), { mensaje: 'aplicación cargada' });
    p.evaluar('window.confirm = () => true');
    p.evaluar(`clientDetail('${client.id}')`);
    const quitar = await esperar(() => p.q('#client-routine-deliveries [data-retract-delivery]'), { mensaje: 'botón Quitar' });
    assert.match(p.q('#client-routine-deliveries').textContent, /Enviada por error/);
    p.clic(quitar);
    await esperar(() => /Aún no hay envíos/.test(p.q('#client-routine-deliveries')?.textContent || ''), { mensaje: 'lista vacía tras quitar' });
    assert.equal((await api.get(`/api/clients/${client.id}/routine-deliveries`)).datos.length, 0);
    const nueva = p.q('#client-new-routine'); assert.match(nueva.textContent, /Nueva rutina para Juana/);
    p.clic(nueva);
    await esperar(() => p.q('#routine-form'), { mensaje: 'editor de rutina' });
    assert.equal(p.q('#routine-client').value, client.id, 'el cliente ya viene elegido');
    assert.equal(p.errores.length, 0, `sin errores de JavaScript: ${p.errores.join(' | ')}`);
  } finally { await p.cerrar(); }
});
