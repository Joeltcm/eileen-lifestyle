/**
 * Bitácora de un ciclo de rutinas (admin y portal comparten esta función).
 *
 * Decisión 9 de Joel (20-10-2026): "enviadas" y "hechas" son números distintos.
 *  - Enviadas: rutinas distintas (por raíz) asignadas con inicio dentro del ciclo.
 *  - Hechas: ejecuciones cerradas con porcentaje > 0, completas o parciales, con repeticiones.
 *  - Cumplimiento: hechas ÷ cupo; puede pasar de 100 %.
 *  - Calidad: aparte del cumplimiento (promedio, completas vs parciales, tiempos, sensación).
 *
 * Nada se reconstruye: si una fila no tiene hora real, la línea de tiempo muestra solo el día.
 */
import { sql } from './db.js';
import { fechaDeNegocioPanama } from './panama-date.js';
import { routineCutoffPeriodOffset, routineCycle } from './routine-cycle.js';

type Row = Record<string, any>;

export type RoutineCycleEvent = {
  type: 'sent' | 'done' | 'expired';
  date: string;
  at: string | null;
  title: string;
  routineId: string;
  dueOn?: string | null;
  runNumber?: number;
  repetition?: number;
  percent?: number;
  partial?: boolean;
  seconds?: number;
  feeling?: string | null;
  difficulty?: string | null;
};

const day = (value: unknown) => (value == null ? null : String(value).slice(0, 10));
const iso = (value: unknown) => (value == null ? null : new Date(value as string | Date).toISOString());
const TYPE_ORDER: Record<string, number> = { sent: 0, done: 1, expired: 2 };

export async function routineCycleReport(clientId: string, offset: number, scope: { ownerId?: string } = {}) {
  const [client] = await sql`
    SELECT c.id::text AS id, c.full_name, c.billing_cutoff_day, c.monthly_session_target, c.status,
      p.service_type, p.routines_per_month
    FROM clients c LEFT JOIN service_plans p ON p.id = c.plan_id
    WHERE c.id = ${clientId} ${scope.ownerId ? sql`AND c.owner_id = ${scope.ownerId}` : sql``}`;
  if (!client) return null;

  const today = fechaDeNegocioPanama();
  const cutoffDay = Number(client.billing_cutoff_day) || 1;
  const config = {
    cutoffDay,
    monthlyTarget: client.monthly_session_target == null ? null : Number(client.monthly_session_target),
    planRoutinesPerMonth: client.routines_per_month == null ? null : Number(client.routines_per_month)
  };
  const period = routineCutoffPeriodOffset(today, cutoffDay, Math.abs(offset));
  const cycle = routineCycle(config, period.inicio);
  const quota = cycle.quota;

  const assignments = await sql`
    SELECT ra.id::text AS id, ra.routine_id::text AS routine_id, COALESCE(r.root_routine_id, r.id)::text AS root_id,
      r.title, ra.starts_on::text AS starts_on, ra.due_on::text AS due_on
    FROM routine_assignments ra JOIN routines r ON r.id = ra.routine_id
    WHERE ra.client_id = ${clientId} AND ra.starts_on >= ${cycle.cycleStart}::date AND ra.starts_on <= ${cycle.cycleEnd}::date
    ORDER BY ra.starts_on, r.title` as unknown as Row[];

  const deliveries = await sql`
    SELECT COALESCE(r.root_routine_id, r.id)::text AS root_id, d.sent_at, d.backfilled, d.summary_reconstructed
    FROM routine_deliveries d LEFT JOIN routines r ON r.id = d.routine_id
    WHERE d.client_id = ${clientId}
      AND (d.sent_at AT TIME ZONE 'America/Panama')::date >= ${cycle.cycleStart}::date
      AND (d.sent_at AT TIME ZONE 'America/Panama')::date <= ${cycle.cycleEnd}::date
    ORDER BY d.sent_at` as unknown as Row[];

  const completions = await sql`
    SELECT rc.id::text AS id, rc.routine_id::text AS routine_id, COALESCE(r.root_routine_id, r.id)::text AS root_id, r.title,
      rc.completed_on::text AS completed_on, rc.run_number, rc.completed_at, rc.completion_percent,
      COALESCE(NULLIF(rc.elapsed_seconds, 0), rc.duration_seconds, 0) AS seconds, rc.feeling, rc.difficulty
    FROM routine_completions rc JOIN routines r ON r.id = rc.routine_id
    WHERE rc.client_id = ${clientId} AND rc.completion_percent > 0
      AND rc.completed_on >= ${cycle.cycleStart}::date AND rc.completed_on <= ${cycle.cycleEnd}::date
    ORDER BY rc.completed_on, rc.completed_at NULLS FIRST, rc.run_number` as unknown as Row[];

  // Una fila por rutina (raíz): la asignación más reciente del ciclo.
  const sentByRoot = new Map<string, Row>();
  for (const row of assignments) sentByRoot.set(row.root_id, row);

  // Hora real del envío: solo de envíos reales; lo reconstruido por el relleno no trae hora.
  const sentAtByRoot = new Map<string, string>();
  for (const row of deliveries) {
    if (row.backfilled || row.summary_reconstructed || sentAtByRoot.has(row.root_id)) continue;
    sentAtByRoot.set(row.root_id, iso(row.sent_at)!);
  }

  const doneRoots = new Set(completions.map(row => row.root_id));
  const effectiveDue = (row: Row) => (row.due_on && row.due_on < cycle.cycleEnd ? row.due_on : cycle.cycleEnd);

  const events: RoutineCycleEvent[] = [];
  let pending = 0; let expired = 0;
  for (const [rootId, row] of sentByRoot) {
    const due = effectiveDue(row);
    events.push({ type: 'sent', date: row.starts_on, at: sentAtByRoot.get(rootId) ?? null, title: row.title, routineId: row.routine_id, dueOn: due });
    if (doneRoots.has(rootId)) continue;
    if (cycle.cycleEnd < today || due < today) {
      expired += 1;
      events.push({ type: 'expired', date: due, at: null, title: row.title, routineId: row.routine_id, dueOn: due });
    } else pending += 1;
  }

  const ordinalByRoot = new Map<string, number>();
  const feelings: Record<string, number> = {}; const difficulties: Record<string, number> = {};
  const daysMap = new Map<string, number>();
  let percentSum = 0; let complete = 0; let totalSeconds = 0; let timed = 0;
  for (const row of completions) {
    const ordinal = (ordinalByRoot.get(row.root_id) ?? 0) + 1;
    ordinalByRoot.set(row.root_id, ordinal);
    const percent = Number(row.completion_percent) || 0;
    const seconds = Number(row.seconds) || 0;
    percentSum += percent; if (percent >= 100) complete += 1;
    if (seconds > 0) { totalSeconds += seconds; timed += 1; }
    if (row.feeling) feelings[row.feeling] = (feelings[row.feeling] || 0) + 1;
    if (row.difficulty) difficulties[row.difficulty] = (difficulties[row.difficulty] || 0) + 1;
    daysMap.set(row.completed_on, (daysMap.get(row.completed_on) || 0) + 1);
    events.push({
      type: 'done', date: row.completed_on, at: iso(row.completed_at), title: row.title, routineId: row.routine_id,
      runNumber: Number(row.run_number) || 1, repetition: ordinal, percent, partial: percent < 100, seconds,
      feeling: row.feeling || null, difficulty: row.difficulty || null
    });
  }

  events.sort((a, b) => a.date.localeCompare(b.date)
    || (TYPE_ORDER[a.type] - TYPE_ORDER[b.type])
    || String(a.at ?? '').localeCompare(String(b.at ?? '')));

  const done = completions.length;
  const distinctDone = doneRoots.size;
  const sent = sentByRoot.size;
  const nextCycle = routineCycle(config, cycle.nextCycleStart);
  let nextSent = 0;
  if (offset === 0) {
    const [row] = await sql`
      SELECT count(DISTINCT COALESCE(r.root_routine_id, r.id))::int AS n
      FROM routine_assignments ra JOIN routines r ON r.id = ra.routine_id
      WHERE ra.client_id = ${clientId} AND ra.starts_on >= ${nextCycle.cycleStart}::date AND ra.starts_on <= ${nextCycle.cycleEnd}::date`;
    nextSent = Number(row?.n || 0);
  }

  return {
    client: { id: client.id, name: client.full_name, cutoffDay, serviceType: client.service_type || null },
    cycle: { start: cycle.cycleStart, end: cycle.cycleEnd, nextStart: cycle.nextCycleStart, offset, isCurrent: offset === 0, closed: cycle.cycleEnd < today },
    today,
    state: offset === 0 && sent === 0 ? 'no_routines_yet' : 'ok',
    metrics: {
      quota, sent, done, distinctDone, repeats: done - distinctDone, pending, expired,
      compliancePercent: quota ? Math.round((done / quota) * 100) : null,
      quality: {
        averagePercent: done ? Math.round(percentSum / done) : null, complete, partial: done - complete,
        totalSeconds, averageSeconds: timed ? Math.round(totalSeconds / timed) : null, feelings, difficulties
      }
    },
    timeline: events,
    days: [...daysMap.entries()].map(([date, count]) => ({ date, count })),
    next: offset === 0 ? { start: nextCycle.cycleStart, end: nextCycle.cycleEnd, sent: nextSent, quota: nextCycle.quota } : null
  };
}
