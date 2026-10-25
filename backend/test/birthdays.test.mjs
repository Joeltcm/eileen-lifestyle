// Aviso de cumpleaños de los clientes, dos días antes: cálculo de fechas, API, campanita y candidatos de push.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import postgres from 'postgres';
import { CREDENCIALES, SETUP_TOKEN, cliente, levantar } from './harness.mjs';
import { fechaDeNegocioPanama } from '../dist/panama-date.js';

process.env.TZ = 'America/Panama';

const sumar = (fecha, dias) => { const d = new Date(`${fecha}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + dias); return d.toISOString().slice(0, 10); };
// 1992 es bisiesto: cualquier mes-día (incluido 29-02) es una fecha de nacimiento válida.
const nacidoEl = (fechaDelCumple, anio = 1992) => `${anio}-${fechaDelCumple.slice(5)}`;

let servidor; let api; let db; let dueno; let mod; let nextBirthday; let birthdayReference; let whenText;
const hoy = fechaDeNegocioPanama();
const ids = {}; let telefono = 1000; const telefonos = {};
before(async () => {
  servidor = await levantar(); api = cliente(servidor.base);
  // El módulo del servidor lee su configuración al importarse: se carga ya con la base de pruebas.
  Object.assign(process.env, { DATABASE_URL: servidor.databaseUrl, JWT_SECRET: 'secreto-de-pruebas-con-mas-de-treinta-y-dos-caracteres', SETUP_TOKEN, NODE_ENV: 'test' });
  mod = await import('../dist/birthdays.js'); ({ nextBirthday, birthdayReference, whenText } = mod); db = postgres(servidor.databaseUrl, { onnotice: () => {}, max: 2 });
  await api.post('/api/auth/setup', CREDENCIALES, { 'x-setup-token': SETUP_TOKEN });
  api.usarToken((await api.post('/api/auth/login', { email: CREDENCIALES.email, password: CREDENCIALES.password })).datos.token);
  [dueno] = await db`SELECT id::text AS id FROM users LIMIT 1`;
  const crear = async (clave, nombre, dias, extra = {}) => {
    const r = await api.post('/api/clients', { fullName: nombre, cutoffDay: 1, phone: (telefonos[clave] = `6000-${++telefono}`), ...(dias === null ? {} : { birthDate: nacidoEl(sumar(hoy, dias)) }), ...extra });
    assert.equal(r.estado, 201, nombre); ids[clave] = r.datos.id;
  };
  await crear('hoy', 'Hoy Cumple', 0); await crear('manana', 'Mañana Cumple', 1); await crear('pasado', 'Pasado Cumple', 2);
  await crear('tres', 'Tres Cumple', 3); await crear('ayer', 'Ayer Cumplió', -1); await crear('sin', 'Sin Fecha', null);
  await crear('demo', 'Demo Cumple', 2); await crear('pausado', 'Pausado Cumple', 2); await crear('lejos', 'Lejos Cumple', 40);
  await db`UPDATE clients SET service_mode = 'demo' WHERE id = ${ids.demo}`;
  await db`UPDATE clients SET status = 'paused' WHERE id = ${ids.pausado}`;
}, { timeout: 120_000 });
after(async () => { await db?.end({ timeout: 1 }).catch(() => {}); await servidor?.parar(); });

test('B1) nextBirthday: hoy, mañana, pasado, ya pasó, fin de año, 29 de febrero, edad y datos inválidos', () => {
  assert.deepEqual(nextBirthday('1990-10-25', '2026-10-25'), { date: '2026-10-25', daysUntil: 0, turns: 36 });
  assert.deepEqual(nextBirthday('1990-10-26', '2026-10-25'), { date: '2026-10-26', daysUntil: 1, turns: 36 });
  assert.deepEqual(nextBirthday('1990-10-27', '2026-10-25'), { date: '2026-10-27', daysUntil: 2, turns: 36 });
  assert.deepEqual(nextBirthday('1990-10-24', '2026-10-25'), { date: '2027-10-24', daysUntil: 364, turns: 37 }, 'si ya pasó este año, el próximo es el del año que viene');
  assert.deepEqual(nextBirthday('1991-01-01', '2026-12-30'), { date: '2027-01-01', daysUntil: 2, turns: 36 }, 'cruza el fin de año');
  assert.equal(nextBirthday('1992-02-29', '2027-02-26')?.date, '2027-02-28', 'el 29 de febrero se celebra el 28 en año no bisiesto');
  assert.equal(nextBirthday('1992-02-29', '2027-02-26')?.daysUntil, 2);
  assert.equal(nextBirthday('1992-02-29', '2028-02-26')?.date, '2028-02-29', 'y el 29 en año bisiesto');
  assert.equal(nextBirthday('1992-02-29', '2028-03-01')?.date, '2029-02-28');
  assert.equal(nextBirthday('0001-05-05', '2026-10-25')?.turns, null, 'un año de nacimiento absurdo no inventa una edad');
  assert.equal(nextBirthday('2026-10-27', '2026-10-25')?.turns, null, 'nacer hoy no es "cumplir" cero años');
  assert.equal(nextBirthday('no-es-fecha', '2026-10-25'), null);
  assert.equal(whenText(0), 'hoy'); assert.equal(whenText(1), 'mañana'); assert.equal(whenText(2), 'pasado mañana'); assert.equal(whenText(9), 'en 9 días');
  assert.equal(birthdayReference('c1', '2026-10-27'), birthdayReference('c1', '2026-10-27'), 'la clave es estable');
  assert.notEqual(birthdayReference('c1', '2026-10-27'), birthdayReference('c1', '2027-10-27'), 'cada año avisa de nuevo');
  assert.match(birthdayReference('c1', '2026-10-27'), /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
});


test('B2) GET /api/birthdays: solo activos con fecha y no demo, ordenados, con edad y días que faltan', async () => {
  const r = await api.get('/api/birthdays?days=30');
  assert.equal(r.estado, 200); assert.equal(r.datos.noticeDays, 2);
  const nombres = r.datos.items.map(i => i.name);
  assert.deepEqual(nombres.slice(0, 4), ['Hoy Cumple', 'Mañana Cumple', 'Pasado Cumple', 'Tres Cumple']);
  assert.ok(!nombres.includes('Sin Fecha') && !nombres.includes('Demo Cumple') && !nombres.includes('Pausado Cumple'), 'sin fecha, demo y pausados no aparecen');
  assert.ok(!nombres.includes('Lejos Cumple'), 'a 40 días queda fuera de la ventana de 30');
  assert.ok(nombres.includes('Ayer Cumplió') === false, 'ayer ya pasó: el próximo es dentro de un año');
  assert.deepEqual(r.datos.items.slice(0, 3).map(i => i.daysUntil), [0, 1, 2]);
  assert.equal(r.datos.items[0].turns, Number(hoy.slice(0, 4)) - 1992);
  assert.equal(r.datos.items[0].phone, telefonos.hoy);
  const largo = await api.get('/api/birthdays?days=366');
  assert.ok(largo.datos.items.some(i => i.name === 'Ayer Cumplió'), 'con ventana de un año sí aparece');
  assert.equal((await api.get('/api/birthdays?days=999')).estado, 400, 'ventana fuera de rango');
});

test('B3) la campanita avisa de hoy, mañana y pasado mañana (no de pasado más lejos) con el texto y los datos para felicitar', async () => {
  const avisos = (await api.get('/api/notifications')).datos.filter(n => n.type === 'birthday');
  assert.deepEqual(avisos.map(a => a.name), ['Hoy Cumple', 'Mañana Cumple', 'Pasado Cumple']);
  const pasado = avisos.find(a => a.name === 'Pasado Cumple');
  assert.equal(pasado.daysUntil, 2); assert.equal(pasado.clientId, ids.pasado); assert.equal(pasado.phone, telefonos.pasado);
  assert.match(pasado.title, /🎂 Cumpleaños de Pasado Cumple/);
  assert.match(pasado.body, /Cumple \d+ años pasado mañana \(\d{2}-\d{2}-\d{4}\)\. ¿Le escribes un saludo a Pasado\?/);
  assert.match(avisos.find(a => a.name === 'Hoy Cumple').body, / hoy \(/);
});

test('B4) la API exige sesión', async () => {
  const anonimo = cliente(servidor.base);
  assert.equal((await anonimo.get('/api/birthdays')).estado, 401);
});

test('B5) candidatos de push: solo cumpleaños a 1 y 2 días, no antes de las 8:00 de Panamá, con clave por cumpleaños', async () => {
  const { birthdayPushCandidates } = mod;
  assert.deepEqual(await birthdayPushCandidates(dueno.id, hoy, 7), [], 'de madrugada no se envía nada');
  const candidatos = await birthdayPushCandidates(dueno.id, hoy, 9);
  assert.deepEqual(candidatos.map(c => c.name), ['Mañana Cumple', 'Pasado Cumple'], 'hoy ya no se avisa por push; tres días tampoco');
  assert.equal(candidatos[1].referenceId, birthdayReference(ids.pasado, sumar(hoy, 2)));
  const reservada = await db`INSERT INTO notification_deliveries (user_id, kind, reference_id) VALUES (${dueno.id}, 'birthday', ${candidatos[1].referenceId}) ON CONFLICT DO NOTHING RETURNING user_id`;
  assert.equal(reservada.length, 1, 'la restricción de la tabla admite la clase birthday');
  const repetida = await db`INSERT INTO notification_deliveries (user_id, kind, reference_id) VALUES (${dueno.id}, 'birthday', ${candidatos[1].referenceId}) ON CONFLICT DO NOTHING RETURNING user_id`;
  assert.equal(repetida.length, 0, 'el mismo cumpleaños no se reserva dos veces');
});
