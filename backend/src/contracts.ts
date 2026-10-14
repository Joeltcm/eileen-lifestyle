import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Un contrato por TIPO DE CLIENTE (Joel, 14-10-2026): el cliente a crédito firma el de crédito; el anticipado, mensualidad (o paquete / rutinas,
// que también se pagan por adelantado). Nunca un contrato general que mezcle las dos modalidades.
export const contractTemplateKeys = ['mensualidad', 'paquete', 'rutinas', 'credito'] as const;
export type ContractTemplateKey = typeof contractTemplateKeys[number];
export const CONTRACT_TERMINATION_NOTICE_DAYS = 5;
export const CANCELLATION_NOTICE_HOURS = 24;
export const RESCHEDULE_CHANGE_NOTICE_HOURS = 24;
export const RESCHEDULE_LATEST_END = '17:00';

const templateNames: Record<ContractTemplateKey, string> = {
  mensualidad: 'mensualidad.txt', paquete: 'paquete.txt', rutinas: 'rutinas.txt', credito: 'credito.txt'
};

function templatePath(name: string) {
  return fileURLToPath(new URL('contract-templates/' + name, import.meta.url));
}

export function normalizeContractName(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('es-PA');
}

export function readContractTemplate(key: ContractTemplateKey) {
  return readFileSync(templatePath(templateNames[key]), 'utf8');
}

export function renderContractTemplate(key: ContractTemplateKey, values: Record<string, unknown>) {
  const source = readContractTemplate(key);
  const body = source.replace(/\{\{([A-Z0-9_]+)\}\}/g, (match, marker: string) => values[marker] == null ? match : String(values[marker]));
  const unresolved = body.match(/\{\{[^}]+\}\}/g) || [];
  if (unresolved.length) throw new Error(`La plantilla tiene marcadores sin resolver: ${unresolved.join(', ')}`);
  return body.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

export function contractTemplateVersion(key: ContractTemplateKey) {
  const version = Number(readFileSync(templatePath(`${key}.version`), 'utf8').trim());
  if (!Number.isInteger(version) || version < 1) throw new Error('La versión de la plantilla no es válida');
  return version;
}

export function contractTimestamp(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Panama', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(date);
  const value = (type: string) => parts.find(part => part.type === type)?.value || '';
  return `${value('day')}-${value('month')}-${value('year')} ${value('hour')}:${value('minute')}`;
}

// Regla económica de la clase que cae en feriado (Eileen). null = sin decidir: mensualidad y paquete no se pueden ENVIAR hasta definirla.
// Cuando Eileen decida, poner aquí la frase exacta que irá en la cláusula de feriados.
// Decisión de Joel/Eileen (14-10-2026): la clase que coincide con un feriado se descuenta del plan.
export const HOLIDAY_CLASS_RULE: string | null = 'La clase que coincide con un día feriado cuenta como clase del plan y se descuenta.';
// Cliente a crédito: falta que Joel/Eileen digan qué pasa con la clase de un feriado (no hay plan del que descontar). null = la cláusula no lo menciona.
export const HOLIDAY_CLASS_RULE_CREDIT: string | null = null;
