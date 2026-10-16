import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');
const explanation = 'La factura automática se calcula con los conceptos de este plan de facturación, no con el monto mensual del perfil.';

test('a 375 px los tres accesos aclaran la fuente del monto facturado', async () => {
  const app = await read('app.js');
  assert.equal(app.split(explanation).length - 1, 3, 'editor, lista de conceptos y expediente dicen lo mismo');
  assert.doesNotMatch(app, /Preparado para el sistema nuevo; hoy la facturación automática sigue usando el monto mensual del cliente\./);
  assert.match(app, /Precio del expediente para contratos, cotizaciones y sugerencias\. No cambia las líneas del plan de facturación; para cambiar lo que se factura, usa «Cambiar monto» o «Corregir monto» en la línea\./);
});

test('los marcadores de la PWA publican v310', async () => {
  const [app, sw, version, html] = await Promise.all(['app.js', 'sw.js', 'version.json', 'index.html'].map(read));
  assert.match(app, /const APP_VERSION = '310'/);
  assert.match(sw, /const VERSION = '310'/);
  assert.equal(JSON.parse(version).version, '310');
  assert.deepEqual([...html.matchAll(/\?v=(\d+)/g)].map(match => match[1]), Array(7).fill('310'));
});
