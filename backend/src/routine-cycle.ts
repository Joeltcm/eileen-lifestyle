/**
 * Ciclos de las rutinas mensuales.
 *
 * El corte es inclusivo: un ciclo empieza el día de corte y termina el día
 * inmediatamente anterior al siguiente corte. Mantener esta regla aquí evita
 * que una rutina con corte 31 se comporte distinto en febrero, en el portal y
 * en el expediente.
 */
import { createHash } from 'node:crypto';

export type RoutineCycle = {
  cycleStart: string;
  cycleEnd: string;
  nextCycleStart: string;
  quota: number | null;
};

type RoutineCycleInput = {
  cutoffDay: number | null | undefined;
  monthlyTarget?: number | null;
  planRoutinesPerMonth?: number | null;
};

function noon(value: string | Date) {
  const day = typeof value === 'string'
    ? value.slice(0, 10)
    : new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Panama', year: 'numeric', month: '2-digit', day: '2-digit' }).format(value);
  return new Date(`${day}T12:00:00Z`);
}

function cutoffInMonth(year: number, month: number, cutoffDay: number) {
  const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(Math.max(1, cutoffDay || 1), last), 12));
}

function previousCutoff(reference: Date, cutoffDay: number) {
  let cutoff = cutoffInMonth(reference.getUTCFullYear(), reference.getUTCMonth(), cutoffDay);
  if (cutoff > reference) cutoff = cutoffInMonth(reference.getUTCFullYear(), reference.getUTCMonth() - 1, cutoffDay);
  return cutoff;
}

function nextCutoff(reference: Date, cutoffDay: number) {
  let cutoff = cutoffInMonth(reference.getUTCFullYear(), reference.getUTCMonth(), cutoffDay);
  if (cutoff <= reference) cutoff = cutoffInMonth(reference.getUTCFullYear(), reference.getUTCMonth() + 1, cutoffDay);
  return cutoff;
}

function iso(day: Date) {
  return day.toISOString().slice(0, 10);
}

/** The cutoff period used by routine history as well as routine assignments. */
export function routineCutoffPeriod(reference: string | Date, cutoffDay: number) {
  const day = noon(reference);
  return { inicio: iso(previousCutoff(day, cutoffDay)), vence: iso(nextCutoff(day, cutoffDay)) };
}

export function routineCutoffPeriodOffset(reference: string | Date, cutoffDay: number, offset: number) {
  let period = routineCutoffPeriod(reference, cutoffDay);
  for (let index = 0; index < offset; index += 1) {
    const day = noon(period.inicio);
    day.setUTCDate(day.getUTCDate() - 1);
    period = routineCutoffPeriod(day, cutoffDay);
  }
  return period;
}

export function routineCycle(input: RoutineCycleInput, reference: string | Date): RoutineCycle {
  const period = routineCutoffPeriod(reference, Number(input.cutoffDay) || 1);
  const end = noon(period.vence);
  end.setUTCDate(end.getUTCDate() - 1);
  const configuredQuota = input.monthlyTarget ?? input.planRoutinesPerMonth ?? null;
  const quota = configuredQuota == null || Number(configuredQuota) <= 0 ? null : Number(configuredQuota);
  return { cycleStart: period.inicio, cycleEnd: iso(end), nextCycleStart: period.vence, quota };
}

export type RoutinePrepStage = 'T2' | 'T1' | 'DAY0';

/** Clave estable (uuid) por cliente, corte y etapa: sirve de reference_id en notification_deliveries. */
export function routinePrepReference(clientId: string, cutoffDate: string, stage: RoutinePrepStage) {
  const h = createHash('md5').update(`routine-prep:${clientId}:${cutoffDate}:${stage}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}
