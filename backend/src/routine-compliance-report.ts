/**
 * Datos de los informes de cumplimiento de RUTINAS (PDF y CSV, para Eileen y para el propio cliente).
 *
 * Misma definición que la bitácora del ciclo (decisión 9 de Joel): "enviadas" y "hechas" son números distintos; hecha =
 * ejecución cerrada con más de 0 %, completa o parcial, incluidas las repeticiones; cumplimiento = hechas ÷ cupo y puede
 * pasar de 100 %; la calidad (promedio de completado, completas/parciales, tiempo) va aparte. Aquí no se recalcula nada:
 * cada ciclo sale de `routineCycleReport`, así el informe y la pantalla nunca se contradicen.
 */
import { sql } from './db.js';
import { fechaDeNegocioPanama } from './panama-date.js';
import { routineCycleReport } from './routine-cycle-report.js';

const dmy = (value: string) => `${value.slice(8, 10)}-${value.slice(5, 7)}-${value.slice(0, 4)}`;
const hora = (value: string | null) => (value ? new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Panama', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value)) : '');
const minutes = (seconds: number) => `${Math.max(1, Math.round(seconds / 60))} min`;
const feelingText: Record<string, string> = { muy_dificil: 'Muy difícil', dificil: 'Difícil', bien: 'Bien', excelente: 'Excelente' };
const difficultyText: Record<string, string> = { facil: 'Fácil', bien: 'Bien', dificil: 'Difícil' };

export type RoutineComplianceCycleRow = {
  start: string; end: string; closed: boolean; current: boolean; quota: number | null;
  sent: number; done: number; distinctDone: number; repeats: number; pending: number; expired: number;
  compliancePercent: number | null; averagePercent: number | null; complete: number; partial: number; totalSeconds: number;
};
export type RoutineComplianceDetailRow = { cycleStart: string; date: string; time: string; event: 'Enviada' | 'Hecha' | 'Vencida'; title: string; detail: string };
export type RoutineComplianceEntitlementRow = {
  quantity: number; from: string; until: string; status: string; sent: number; done: number; distinctDone: number; invoiceCode: string | null; invoiceStatus: string | null; invoiceTotal: number | null;
};
export type RoutineComplianceSeries = {
  client: { id: string; name: string; email: string | null; planName: string | null; isRoutinePlan: boolean; quota: number | null };
  generatedOn: string; from: string | null; to: string | null;
  cycles: RoutineComplianceCycleRow[]; detail: RoutineComplianceDetailRow[];
  totals: { cycles: number; sent: number; done: number; repeats: number; expired: number; pending: number; complianceAverage: number | null; averagePercent: number | null; complete: number; partial: number; totalSeconds: number };
  entitlements: RoutineComplianceEntitlementRow[];
};

export async function routineComplianceSeries(clientId: string, cycles: number, scope: { ownerId?: string } = {}): Promise<RoutineComplianceSeries | null> {
  const [client] = await sql`
    SELECT c.id::text AS id, c.full_name, c.email, c.service_mode, p.service_type, p.name AS plan_name
    FROM clients c LEFT JOIN service_plans p ON p.id = c.plan_id
    WHERE c.id = ${clientId} ${scope.ownerId ? sql`AND c.owner_id = ${scope.ownerId}` : sql``}`;
  if (!client || client.service_mode === 'demo') return null;
  const isRoutinePlan = client.service_type === 'rutinas';
  const reports = [];
  if (isRoutinePlan) for (let index = 0; index < cycles; index += 1) { const report = await routineCycleReport(clientId, -index, scope); if (report) reports.push(report); }
  reports.reverse();   // del más antiguo al actual

  const rows: RoutineComplianceCycleRow[] = reports.map(report => ({
    start: report.cycle.start, end: report.cycle.end, closed: report.cycle.closed, current: report.cycle.isCurrent, quota: report.metrics.quota,
    sent: report.metrics.sent, done: report.metrics.done, distinctDone: report.metrics.distinctDone, repeats: report.metrics.repeats,
    pending: report.metrics.pending, expired: report.metrics.expired, compliancePercent: report.metrics.sent === 0 && report.metrics.done === 0 ? null : report.metrics.compliancePercent,   // sin nada enviado no hay % que mostrar (decisión 11)
    averagePercent: report.metrics.quality.averagePercent, complete: report.metrics.quality.complete, partial: report.metrics.quality.partial, totalSeconds: report.metrics.quality.totalSeconds
  }));

  const detail: RoutineComplianceDetailRow[] = reports.flatMap(report => report.timeline.map(event => {
    if (event.type === 'sent') return { cycleStart: report.cycle.start, date: event.date, time: hora(event.at), event: 'Enviada' as const, title: event.title, detail: `disponible hasta ${dmy(String(event.dueOn))}` };
    if (event.type === 'expired') return { cycleStart: report.cycle.start, date: event.date, time: '', event: 'Vencida' as const, title: event.title, detail: 'no se hizo dentro del ciclo' };
    const parts = [event.partial ? `parcial (${event.percent} %)` : 'completa', (event.repetition ?? 1) > 1 ? `repetición n.º ${event.repetition}` : '', event.seconds ? minutes(event.seconds) : '',
      event.feeling ? feelingText[event.feeling] || '' : '', event.difficulty ? `dificultad: ${difficultyText[event.difficulty] || ''}` : ''].filter(Boolean);
    return { cycleStart: report.cycle.start, date: event.date, time: hora(event.at), event: 'Hecha' as const, title: event.title, detail: parts.join(' · ') };
  }));

  // Un ciclo sin nada enviado ni hecho no es incumplimiento del cliente (decisión 11): no entra en el promedio.
  const withQuota = rows.filter(row => row.compliancePercent !== null && (row.sent > 0 || row.done > 0));
  const doneTotal = rows.reduce((sum, row) => sum + row.done, 0);
  const totals = {
    cycles: rows.length, sent: rows.reduce((sum, row) => sum + row.sent, 0), done: doneTotal, repeats: rows.reduce((sum, row) => sum + row.repeats, 0),
    expired: rows.reduce((sum, row) => sum + row.expired, 0), pending: rows.reduce((sum, row) => sum + row.pending, 0),
    complianceAverage: withQuota.length ? Math.round(withQuota.reduce((sum, row) => sum + (row.compliancePercent || 0), 0) / withQuota.length) : null,
    // promedio ponderado por ejecuciones: un ciclo con más rutinas hechas pesa más
    averagePercent: doneTotal ? Math.round(rows.reduce((sum, row) => sum + (row.averagePercent || 0) * row.done, 0) / doneTotal) : null,
    complete: rows.reduce((sum, row) => sum + row.complete, 0), partial: rows.reduce((sum, row) => sum + row.partial, 0), totalSeconds: rows.reduce((sum, row) => sum + row.totalSeconds, 0)
  };

  const bonos = await sql`
    SELECT e.quantity, e.available_from::text AS available_from, e.available_until::text AS available_until, e.status,
      (SELECT count(DISTINCT COALESCE(r.root_routine_id, r.id)) FROM routine_assignments ra JOIN routines r ON r.id = ra.routine_id WHERE ra.entitlement_id = e.id)::int AS sent,
      (SELECT count(*) FROM routine_completions rc JOIN routine_assignments ra ON ra.id = rc.assignment_id WHERE ra.entitlement_id = e.id AND rc.completion_percent > 0)::int AS done,
      (SELECT count(DISTINCT COALESCE(r.root_routine_id, r.id)) FROM routine_completions rc JOIN routine_assignments ra ON ra.id = rc.assignment_id JOIN routines r ON r.id = rc.routine_id WHERE ra.entitlement_id = e.id AND rc.completion_percent > 0)::int AS distinct_done,
      bi.number AS invoice_number, bi.status AS invoice_status, bi.total AS invoice_total
    FROM routine_entitlements e LEFT JOIN billing_invoices bi ON bi.id = e.invoice_id
    WHERE e.client_id = ${clientId} AND e.status <> 'cancelled'
    ORDER BY e.available_until DESC LIMIT 24`;
  const entitlements: RoutineComplianceEntitlementRow[] = bonos.map(row => ({
    quantity: Number(row.quantity), from: String(row.available_from), until: String(row.available_until), status: String(row.status),
    sent: Number(row.sent) || 0, done: Number(row.done) || 0, distinctDone: Number(row.distinct_done) || 0,
    invoiceCode: row.invoice_number ? `FAC-${String(row.invoice_number).padStart(4, '0')}` : null, invoiceStatus: row.invoice_status ? String(row.invoice_status) : null, invoiceTotal: row.invoice_total == null ? null : Number(row.invoice_total)
  }));

  return {
    client: { id: client.id, name: client.full_name, email: client.email || null, planName: client.plan_name || null, isRoutinePlan, quota: rows.length ? rows[rows.length - 1].quota : null },
    generatedOn: fechaDeNegocioPanama(), from: rows[0]?.start ?? null, to: rows.length ? rows[rows.length - 1].end : null,
    cycles: rows, detail, totals, entitlements
  };
}

export type RoutineComplianceAllRow = { clientId: string; name: string; cycleStart: string; cycleEnd: string; quota: number | null; sent: number; done: number; repeats: number; withoutDone: number; compliancePercent: number | null; averagePercent: number | null };

/** Resumen de todos los clientes con plan de rutinas (activos, no demo): su ciclo actual. */
export async function routineComplianceAll(ownerId: string): Promise<{ generatedOn: string; rows: RoutineComplianceAllRow[] }> {
  const clients = await sql`
    SELECT c.id::text AS id, c.full_name FROM clients c JOIN service_plans p ON p.id = c.plan_id
    WHERE c.owner_id = ${ownerId} AND p.service_type = 'rutinas' AND c.status = 'active' AND c.service_mode <> 'demo'
    ORDER BY c.full_name`;
  const rows: RoutineComplianceAllRow[] = [];
  for (const client of clients) {
    const report = await routineCycleReport(String(client.id), 0, { ownerId });
    if (!report) continue;
    rows.push({ clientId: String(client.id), name: String(client.full_name), cycleStart: report.cycle.start, cycleEnd: report.cycle.end, quota: report.metrics.quota, sent: report.metrics.sent,
      done: report.metrics.done, repeats: report.metrics.repeats, withoutDone: report.metrics.pending + report.metrics.expired, compliancePercent: report.metrics.sent === 0 && report.metrics.done === 0 ? null : report.metrics.compliancePercent, averagePercent: report.metrics.quality.averagePercent });
  }
  return { generatedOn: fechaDeNegocioPanama(), rows };
}
