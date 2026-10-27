// La IA se quedaba casi siempre en 3 bloques aunque Eileen pidiera 2, y no medía el tiempo: ahora el código lee lo que ella pide y lo hace cumplir.
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.DATABASE_URL = 'postgres://prueba'; process.env.JWT_SECRET = 'j'.repeat(40); process.env.SETUP_TOKEN = 's'.repeat(20); process.env.DEEPSEEK_API_KEY = 'clave-de-prueba';
const { suggestRoutine, leerPeticion, segundosDeEjercicio, minutosPrincipales, minutosTotales, aplicarPeticion } = await import('../dist/routine-suggestions.js');

test('leerPeticion entiende bloques, rondas, ejercicios por bloque y minutos', () => {
  assert.deepEqual(leerPeticion('Rutina de 45 minutos en 2 bloques, tren inferior'), { bloques: 2, minutos: 45 });
  assert.deepEqual(leerPeticion('dos bloques de 4 ejercicios con 4 rondas, 60 min'), { bloques: 2, porBloque: 4, rondas: 4, minutos: 60 });
  assert.equal(leerPeticion('una hora de pierna').minutos, 60);
  assert.equal(leerPeticion('hora y media').minutos, 90);
  assert.equal(leerPeticion('media hora de core').minutos, 30);
  assert.deepEqual(leerPeticion('espalda y tríceps, tiene mancuernas'), {});
  assert.equal(leerPeticion('3 series de 12').minutos, undefined, '"12" no son minutos');
});

test('segundosDeEjercicio: repeticiones, tiempo y por lado', () => {
  assert.equal(segundosDeEjercicio('12'), 42);
  assert.equal(segundosDeEjercicio('30 seg'), 30);
  assert.equal(segundosDeEjercicio('1 min'), 60);
  assert.equal(segundosDeEjercicio('10 por lado'), 70);
  assert.equal(segundosDeEjercicio('10-12'), 39);
});

const lista = (n, extra = {}) => Array.from({ length: n }, (_, i) => ({ name: `E${i}`, sets: 3, reps: '12', ...extra }));

test('"2 bloques": 9 ejercicios en 3 bloques de 3 se reorganizan en 2 bloques parejos', () => {
  const ejercicios = lista(9).map((e, i) => ({ ...e, block: Math.floor(i / 3) + 1, rounds: 3 }));
  const r = aplicarPeticion(ejercicios, { bloques: 2 });
  assert.equal(r.bloques, 2);
  assert.deepEqual([...new Set(ejercicios.map(e => e.block))], [1, 2]);
  assert.equal(ejercicios.length, 9, 'cabe en 2×5');
  assert.deepEqual(ejercicios.map(e => e.block), [1, 1, 1, 1, 1, 2, 2, 2, 2]);
});

test('"2 bloques de 4 ejercicios": recorta a 8 y fija las rondas pedidas', () => {
  const ejercicios = lista(9).map((e, i) => ({ ...e, block: Math.floor(i / 3) + 1, rounds: 3 }));
  aplicarPeticion(ejercicios, { bloques: 2, porBloque: 4, rondas: 4 });
  assert.equal(ejercicios.length, 8);
  assert.ok(ejercicios.every(e => e.rounds === 4 && e.sets === 4));
});

test('el tiempo pedido se respeta: 30 min recorta o reduce rondas; 60 min sube rondas; el total queda cerca', () => {
  const corto = lista(9).map((e, i) => ({ ...e, block: Math.floor(i / 3) + 1, rounds: 3 }));
  aplicarPeticion(corto, { bloques: 3, minutos: 30 });
  assert.ok(minutosTotales(corto) <= 30 * 1.15 + 1, `30 min → ${minutosTotales(corto)}`);
  const largo = lista(8).map((e, i) => ({ ...e, block: i < 4 ? 1 : 2, rounds: 3 }));
  const antes = minutosTotales(largo);
  aplicarPeticion(largo, { bloques: 2, minutos: 60 });
  assert.ok(minutosTotales(largo) > antes, 'subió rondas');
  assert.ok(Math.abs(minutosTotales(largo) - 60) <= 12, `60 min → ${minutosTotales(largo)}`);
  const mucho = lista(8).map((e, i) => ({ ...e, block: i < 4 ? 1 : 2, rounds: 3 }));
  aplicarPeticion(mucho, { bloques: 2, minutos: 30, rondas: 5 });
  assert.ok(mucho.every(e => e.rounds === 5), 'las rondas que ella fijó no se tocan');
});

test('sin petición explícita no se toca nada (pero siempre hay estimación)', () => {
  const ejercicios = lista(6).map((e, i) => ({ ...e, block: i < 3 ? 1 : 2, rounds: 3 }));
  const copia = JSON.stringify(ejercicios);
  const r = aplicarPeticion(ejercicios, {});
  assert.equal(JSON.stringify(ejercicios), copia);
  assert.equal(r.minutos, Math.round(minutosPrincipales(ejercicios) + 18));
});

async function conRespuesta(ejercicios, descripcion) {
  const original = globalThis.fetch; let enviado = null;
  globalThis.fetch = async (_u, o) => { enviado = JSON.parse(o.body); return { ok: true, status: 200, json: async () => ({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ title: 'T', description: 'D', sessionsPerWeek: 3, rationale: 'Porque sí.', exercises: ejercicios }) } }] }) }; };
  const catalogo = Array.from({ length: 9 }, (_, i) => ({ name: `E${i}`, section: 'core', machine: 'No aplica', freeWeight: 'No aplica' }));
  try { return { propuesta: await suggestRoutine({ descripcion, catalogo, historial: [], condiciones: [], repetirGrupos: false }), sistema: enviado.messages[0].content }; }
  finally { globalThis.fetch = original; }
}

test('suggestRoutine: pide 2 bloques y 45 min, el modelo responde 3 bloques → sale en 2, con estimación en la explicación y la orden al modelo', async () => {
  const modelo = Array.from({ length: 9 }, (_, i) => ({ name: `E${i}`, sets: 3, reps: '12', block: Math.floor(i / 3) + 1, rounds: 3 }));
  const { propuesta, sistema } = await conRespuesta(modelo, 'Rutina de 45 minutos en 2 bloques de tren inferior');
  assert.match(sistema, /EXACTAMENTE 2 bloques/); assert.match(sistema, /45 minutos/);
  assert.equal(new Set(propuesta.exercises.map(e => e.block)).size, 2);
  assert.ok(Math.abs(propuesta.estimatedMinutes - 45) <= 8, `estimado ${propuesta.estimatedMinutes}`);
  assert.match(propuesta.rationale, /Duración estimada: unos \d+ minutos en total.*en 2 bloques/);
});
