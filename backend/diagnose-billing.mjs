import postgres from 'postgres';
const sql = postgres(process.env.DATABASE_URL);

// 1. Simular exactamente la consulta de generateRecurringInvoices (sin el INSERT)
console.log('=== CANDIDATOS PARA FACTURACIÓN AUTOMÁTICA ===');
const candidates = await sql`
  WITH periods AS (
    SELECT generate_series(
      date_trunc('month', current_date),
      date_trunc('month', current_date) + interval '1 month',
      interval '1 month'
    )::date AS billing_period
  ), schedule AS (
    SELECT COALESCE(c.billing_responsible_client_id, c.id) AS client_id,
      c.id AS billed_for_client_id, c.full_name AS billed_for_name,
      (c.billing_responsible_client_id IS NOT NULL) AS la_paga_otro,
      c.owner_id, CASE WHEN c.payment_mode = 'no_anticipado' THEN 0 ELSE c.standard_price END AS amount,
      COALESCE(p.name, 'Mensualidad') AS plan_name, periods.billing_period,
      make_date(
        extract(year FROM periods.billing_period)::integer,
        extract(month FROM periods.billing_period)::integer,
        least(c.billing_cutoff_day, extract(day FROM (periods.billing_period + interval '1 month - 1 day'))::integer)
      ) AS due_on
    FROM clients c
    LEFT JOIN service_plans p ON p.id = c.plan_id
    CROSS JOIN periods
    WHERE c.status = 'active' AND c.service_mode <> 'demo' AND c.billing_model = 'monthly' AND c.standard_price > 0
      AND NOT EXISTS (
        SELECT 1 FROM integration_connections ic
        WHERE ic.owner_id = c.owner_id AND ic.provider = 'zoho_invoice'
          AND ic.sync_enabled = true AND ic.status <> 'completed'
      )
  ), candidates AS (
    SELECT s.*
    FROM schedule s
    WHERE s.billing_period = date_trunc('month', current_date)::date
      AND s.due_on <= current_date
      AND EXISTS (
        SELECT 1 FROM memberships m
        WHERE m.client_id = s.billed_for_client_id AND m.status = 'active' AND m.starts_on <= s.due_on
          AND (m.ends_on IS NULL OR m.ends_on >= s.billing_period)
      )
      AND NOT EXISTS (
        SELECT 1 FROM invoices i
        WHERE COALESCE(i.billed_for_client_id, i.client_id) = s.billed_for_client_id AND i.status <> 'void'
          AND date_trunc('month', COALESCE(i.billing_period, i.issued_on, i.due_on))::date = s.billing_period
          AND (
            i.auto_generated = true OR i.source_system = 'zoho_invoice'
            OR (i.package_id IS NULL AND i.amount = s.amount)
            OR lower(i.concept) LIKE '%mensual%'
          )
      )
      AND NOT EXISTS (
        SELECT 1 FROM invoice_coverage cov
        JOIN invoices ci ON ci.id = cov.invoice_id AND ci.status <> 'void'
        WHERE cov.client_id = s.billed_for_client_id
          AND date_trunc('month', ci.due_on)::date = s.billing_period
      )
  )
  SELECT * FROM candidates
`;

if (candidates.length === 0) {
  console.log('NO HAY CANDIDATOS — todos ya tienen factura o no califican');
} else {
  console.log(`${candidates.length} candidato(s):`);
  for (const c of candidates) {
    console.log(`  - ${c.billed_for_name}: $${c.amount}, due_on=${c.due_on}, period=${c.billing_period}`);
  }
}

// 2. Verificar facturas existentes de noviembre para TODOS los clientes activos
console.log('\n=== FACTURAS DE NOVIEMBRE EXISTENTES ===');
const novInvoices = await sql`
  SELECT c.full_name, i.concept, i.amount, i.due_on, i.auto_generated, i.billing_period
  FROM invoices i
  JOIN clients c ON c.id = COALESCE(i.billed_for_client_id, i.client_id)
  WHERE i.status <> 'void'
    AND date_trunc('month', COALESCE(i.billing_period, i.issued_on, i.due_on))::date = '2026-11-01'
  ORDER BY c.full_name
`;
if (novInvoices.length === 0) {
  console.log('NINGUNA factura de noviembre existe para ningún cliente');
} else {
  for (const inv of novInvoices) {
    console.log(`  - ${inv.full_name}: $${inv.amount} (auto=${inv.auto_generated}, period=${inv.billing_period}, due=${inv.due_on})`);
  }
}

await sql.end();
