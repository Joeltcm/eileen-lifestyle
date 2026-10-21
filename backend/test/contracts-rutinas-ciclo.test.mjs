// Entrega E: el contrato de rutinas describe el ciclo de corte. Texto pendiente de revisión jurídica; solo contratos nuevos.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const plantilla = nombre => readFile(new URL(`../src/contract-templates/${nombre}`, import.meta.url), 'utf8');

test('la plantilla de rutinas explica el ciclo, el vencimiento, las repeticiones y el aviso previo (v7)', async () => {
  const texto = await plantilla('rutinas.txt');
  assert.match(texto, /Cada ciclo de rutinas va del día de corte hasta el día anterior al siguiente corte/);
  assert.match(texto, /las no realizadas vencen, no se acumulan y no se renuevan por sí solas/);
  assert.match(texto, /hasta entonces no hay rutinas disponibles/);
  assert.match(texto, /puede repetir las rutinas enviadas cuantas veces quiera.*aunque supere la cantidad enviada/);
  assert.match(texto, /Antes de cada corte Eileen recibe un aviso/);
  assert.equal(Number((await plantilla('rutinas.version')).trim()), 7, 'cambió la redacción: sube la versión');
  // las demás plantillas no cambian
  for (const [nombre, version] of [['credito', 4], ['mensualidad', 6], ['paquete', 6]]) assert.equal(Number((await plantilla(`${nombre}.version`)).trim()), version, nombre);
  // no se cuelan precios ni cantidades fijas (README de plantillas)
  assert.doesNotMatch(texto, /\$\s?\d|\d+\s+rutinas\b/);
});
