import postgres from 'postgres';
const sql = postgres(process.env.DATABASE_URL);
const [c] = await sql`SELECT c.id, c.full_name, c.status, c.service_mode, c.billing_model, c.standard_price, c.billing_cutoff_day, c.payment_mode, c.billing_responsible_client_id FROM clients c WHERE c.full_name ILIKE '%alan%cohen%'`;
console.log('CLIENTE:', JSON.stringify(c, null, 2));
if (!c) { await sql.end(); process.exit(); }
const memberships = await sql`SELECT id, status, starts_on, ends_on FROM memberships WHERE client_id = ${c.id} ORDER BY starts_on DESC LIMIT 3`;
console.log('MEMBRESÍAS:', JSON.stringify(memberships, null, 2));
const invoices = await sql`SELECT id, concept, amount, due_on, billing_period, auto_generated, status, issued_on FROM invoices WHERE (client_id = ${c.id} OR billed_for_client_id = ${c.id}) AND status <> 'void' ORDER BY due_on DESC LIMIT 5`;
console.log('FACTURAS:', JSON.stringify(invoices, null, 2));
const cov = await sql`SELECT cov.invoice_id, ci.due_on, ci.billing_period FROM invoice_coverage cov JOIN invoices ci ON ci.id = cov.invoice_id WHERE cov.client_id = ${c.id} ORDER BY ci.due_on DESC LIMIT 5`;
console.log('COBERTURAS:', JSON.stringify(cov, null, 2));
await sql.end();
