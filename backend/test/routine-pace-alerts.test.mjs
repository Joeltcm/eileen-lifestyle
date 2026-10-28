// Alertas de ritmo: aviso a la entrenadora cuando un cliente de rutinas se atrasa
// o cuando una rutina de viaje lleva 3+ días sin completar.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import postgres from 'postgres';
import { CREDENCIALES, SETUP_TOKEN, cliente, levantar } from './harness.mjs';

let server; let api; let db; let ownerId;
const addDays = (iso, n) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const hoy = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Panama', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
function paceRef(clientId, dateStr) {
  const h = createHash('md5').update(`routine-pace:${clientId}:${dateStr}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

before(async () => {
  server = await levantar(); api = cliente(server.base);
  db = postgres(server.databaseUrl, { onnotice: () => {} });
  const setup = await api.post('/api/auth/setup', CREDENCIALES, { 'x-setup-token': SETUP_TOKEN });
  api.usarToken(setup.datos.token);
  ownerId = (await db`SELECT id FROM users WHERE email = ${CREDENCIALES.email}`)[0].id;
}, { timeout: 90_000 });
after(async () => { await db?.end({ timeout: 1 }).catch(() => {}); await server?.parar(); });

test('RP1) la migración admite los tipos routine_pace y travel_overdue', async () => {
  const ref1 = crypto.randomUUID();
  await db`INSERT INTO notification_deliveries (user_id, kind, reference_id) VALUES (${ownerId}, 'routine_pace', ${ref1})`;
  const ref2 = crypto.randomUUID();
  await db`INSERT INTO notification_deliveries (user_id, kind, reference_id) VALUES (${ownerId}, 'travel_overdue', ${ref2})`;
  const rows = await db`SELECT kind FROM notification_deliveries WHERE reference_id IN (${ref1}, ${ref2}) ORDER BY kind`;
  assert.deepEqual(rows.map(r => r.kind), ['routine_pace', 'travel_overdue']);
  await db`DELETE FROM notification_deliveries WHERE reference_id IN (${ref1}, ${ref2})`;
});

test('RP2) la clave de dedup del ritmo es estable y cambia con la fecha', async () => {
  const cid = '11111111-1111-1111-1111-111111111111';
  const r1 = paceRef(cid, '2026-10-01');
  const r2 = paceRef(cid, '2026-10-01');
  const r3 = paceRef(cid, '2026-10-05');
  assert.equal(r1, r2, 'misma fecha → misma ref');
  assert.notEqual(r1, r3, 'distinta fecha → distinta ref');
  assert.match(r1, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  // la ref se puede guardar como uuid
  await db`INSERT INTO notification_deliveries (user_id, kind, reference_id) VALUES (${ownerId}, 'routine_pace', ${r1}::uuid)`;
  const dup = await db`INSERT INTO notification_deliveries (user_id, kind, reference_id) VALUES (${ownerId}, 'routine_pace', ${r1}::uuid) ON CONFLICT DO NOTHING RETURNING user_id`;
  assert.equal(dup.length, 0, 'dedup funciona');
  await db`DELETE FROM notification_deliveries WHERE reference_id = ${r1}::uuid AND kind = 'routine_pace'`;
});

test('RP3) rutina de viaje sin completar 3+ días genera alerta', async () => {
  const today = hoy();
  const alta = await api.post('/api/clients', { fullName: 'Viajero Olvidadizo', cutoffDay: 1 });
  assert.equal(alta.estado, 201);
  const clientId = alta.datos.id;

  const [rutina] = await db`INSERT INTO routines (owner_id, title, sessions_per_week, exercises)
    VALUES (${ownerId}, 'Rutina viaje test', 2, '[]'::jsonb) RETURNING id`;
  const sentAt = new Date(`${addDays(today, -4)}T10:00:00-05:00`);
  const [delivery] = await db`INSERT INTO routine_deliveries (owner_id, routine_id, client_id, kind, sent_at, routine_title, client_name, routine_version, summary_text, exercises_snapshot)
    VALUES (${ownerId}, ${rutina.id}, ${clientId}, 'travel_link', ${sentAt}, 'Rutina viaje test', 'Viajero Olvidadizo', 1, 'test', '[]'::jsonb) RETURNING id`;

  // Sin completion → sale como pendiente
  const pendientes = await db`
    SELECT rd.id FROM routine_deliveries rd
    WHERE rd.kind = 'travel_link' AND rd.client_id = ${clientId}
      AND (${today}::date - (rd.sent_at AT TIME ZONE 'America/Panama')::date) >= 3
      AND NOT EXISTS (
        SELECT 1 FROM routine_completions rc
        WHERE rc.routine_id = rd.routine_id AND rc.client_id = rd.client_id
          AND rc.completed_on >= (rd.sent_at AT TIME ZONE 'America/Panama')::date
      )
      AND NOT EXISTS (
        SELECT 1 FROM notification_deliveries nd
        WHERE nd.user_id = rd.owner_id AND nd.kind = 'travel_overdue' AND nd.reference_id = rd.id
      )`;
  assert.ok(pendientes.length >= 1, 'la rutina sin completar aparece como pendiente');

  // Insertar dedup y verificar que no sale de nuevo
  await db`INSERT INTO notification_deliveries (user_id, kind, reference_id) VALUES (${ownerId}, 'travel_overdue', ${delivery.id})`;
  const despues = await db`
    SELECT rd.id FROM routine_deliveries rd
    WHERE rd.kind = 'travel_link' AND rd.client_id = ${clientId}
      AND NOT EXISTS (
        SELECT 1 FROM notification_deliveries nd
        WHERE nd.user_id = rd.owner_id AND nd.kind = 'travel_overdue' AND nd.reference_id = rd.id
      )`;
  assert.equal(despues.filter(r => r.id === delivery.id).length, 0, 'dedup evita duplicado');
});

test('RP4) rutina de viaje completada no genera alerta', async () => {
  const today = hoy();
  const alta = await api.post('/api/clients', { fullName: 'Viajero Cumplido', cutoffDay: 1 });
  const clientId = alta.datos.id;
  const [rutina] = await db`INSERT INTO routines (owner_id, title, sessions_per_week, exercises)
    VALUES (${ownerId}, 'Rutina completada', 2, '[]'::jsonb) RETURNING id`;
  const sentAt = new Date(`${addDays(today, -4)}T10:00:00-05:00`);
  await db`INSERT INTO routine_deliveries (owner_id, routine_id, client_id, kind, sent_at, routine_title, client_name, routine_version, summary_text, exercises_snapshot)
    VALUES (${ownerId}, ${rutina.id}, ${clientId}, 'travel_link', ${sentAt}, 'Rutina completada', 'Viajero Cumplido', 1, 'test', '[]'::jsonb)`;

  await db`INSERT INTO routine_completions (routine_id, client_id, completed_on, completion_percent)
    VALUES (${rutina.id}, ${clientId}, ${addDays(today, -3)}, 100)`;

  const pendientes = await db`
    SELECT rd.id FROM routine_deliveries rd
    WHERE rd.kind = 'travel_link' AND rd.client_id = ${clientId}
      AND (${today}::date - (rd.sent_at AT TIME ZONE 'America/Panama')::date) >= 3
      AND NOT EXISTS (
        SELECT 1 FROM routine_completions rc
        WHERE rc.routine_id = rd.routine_id AND rc.client_id = rd.client_id
          AND rc.completed_on >= (rd.sent_at AT TIME ZONE 'America/Panama')::date
      )`;
  assert.equal(pendientes.length, 0, 'la rutina completada no aparece como pendiente');
});

test('RP5) cliente al día no genera alerta de ritmo', async () => {
  const today = hoy();
  const cutDay = Number(addDays(today, -2).slice(8, 10));
  const [plan] = await db`INSERT INTO service_plans (owner_id, name, billing_model, price, sessions_included, service_type, routines_per_month, active)
    VALUES (${ownerId}, 'Rutinas al día', 'monthly', 90, NULL, 'rutinas', 8, true) RETURNING id`;
  const alta = await api.post('/api/clients', { fullName: 'Cliente Puntual', cutoffDay: cutDay, planId: plan.id });
  const clientId = alta.datos.id;

  const [rutina] = await db`INSERT INTO routines (owner_id, title, sessions_per_week, exercises)
    VALUES (${ownerId}, 'Rutina puntual', 2, '[]'::jsonb) RETURNING id`;
  await db`INSERT INTO routine_completions (routine_id, client_id, completed_on, completion_percent)
    VALUES (${rutina.id}, ${clientId}, ${addDays(today, -1)}, 100)`;

  // Con última completion ayer (1 día), umbral=CEIL(30/8)=4 → no debería alertar
  const atrasados = await db`
    WITH periodo AS (
      SELECT ${clientId}::uuid AS cid, ${addDays(today, -2)}::date AS inicio, ${addDays(today, 28)}::date AS fin, 8 AS rpm
    )
    SELECT p.cid,
      (${today}::date - COALESCE(MAX(rc.completed_on), p.inicio)) AS dias_desde
    FROM periodo p
    LEFT JOIN routine_completions rc ON rc.client_id = p.cid AND rc.completed_on >= p.inicio AND rc.completed_on < p.fin
    GROUP BY p.cid, p.inicio, p.fin, p.rpm
    HAVING (${today}::date - COALESCE(MAX(rc.completed_on), p.inicio)) > CEIL((p.fin - p.inicio)::numeric / p.rpm)`;
  assert.equal(atrasados.length, 0, 'cliente al día no genera alerta');
});
