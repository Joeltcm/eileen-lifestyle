/**
 * Aviso previo al corte (Entrega C): Eileen debe haber enviado las rutinas del ciclo nuevo.
 *  - 2 días antes y 1 día antes del corte, si el ciclo siguiente tiene menos rutinas asignadas que su cupo.
 *  - El mismo día del corte, si el ciclo que empieza hoy sigue en cero (decisión 11: el cliente no hereda nada del ciclo anterior).
 * Solo clientes de rutinas activos y no demo. Las fechas son de Panamá; "hoy" se inyecta para poder probarlo.
 */
import { sql } from './db.js';
import { routineCycle, routinePrepReference, type RoutinePrepStage } from './routine-cycle.js';

export type RoutinePrepItem = {
  ownerId: string; clientId: string; clientName: string; stage: RoutinePrepStage;
  cutoffDate: string; assigned: number; quota: number; referenceId: string;
};

const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000);

export async function routineCyclePrep(today: string, ownerId?: string): Promise<RoutinePrepItem[]> {
  const clients = await sql`
    SELECT c.id::text AS id, c.owner_id::text AS owner_id, c.full_name, c.billing_cutoff_day, c.monthly_session_target, p.routines_per_month
    FROM clients c JOIN service_plans p ON p.id = c.plan_id
    WHERE p.service_type = 'rutinas' AND c.status = 'active' AND c.service_mode <> 'demo'
      ${ownerId ? sql`AND c.owner_id = ${ownerId}` : sql``}`;
  const items: RoutinePrepItem[] = [];
  for (const client of clients) {
    const config = {
      cutoffDay: Number(client.billing_cutoff_day) || 1,
      monthlyTarget: client.monthly_session_target == null ? null : Number(client.monthly_session_target),
      planRoutinesPerMonth: client.routines_per_month == null ? null : Number(client.routines_per_month)
    };
    const current = routineCycle(config, today);
    if (!current.quota) continue;
    const untilCut = daysBetween(today, current.nextCycleStart);
    const stage: RoutinePrepStage | null = current.cycleStart === today ? 'DAY0' : untilCut === 2 ? 'T2' : untilCut === 1 ? 'T1' : null;
    if (!stage) continue;
    const target = stage === 'DAY0' ? current : routineCycle(config, current.nextCycleStart);
    const [row] = await sql`
      SELECT count(DISTINCT COALESCE(r.root_routine_id, r.id))::int AS n
      FROM routine_assignments ra JOIN routines r ON r.id = ra.routine_id
      WHERE ra.client_id = ${client.id} AND ra.starts_on >= ${target.cycleStart}::date AND ra.starts_on <= ${target.cycleEnd}::date`;
    const assigned = Number(row?.n || 0);
    if (stage === 'DAY0' ? assigned > 0 : assigned >= current.quota) continue;
    const cutoffDate = stage === 'DAY0' ? today : current.nextCycleStart;
    items.push({ ownerId: client.owner_id, clientId: client.id, clientName: client.full_name, stage, cutoffDate, assigned, quota: target.quota ?? current.quota,
      referenceId: routinePrepReference(client.id, cutoffDate, stage) });
  }
  return items;
}
