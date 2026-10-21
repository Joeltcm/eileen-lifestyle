/**
 * Cotizador de Eileen.
 *
 * Una cotización es una PROPUESTA INFORMATIVA para un cliente (o para alguien que todavía no lo es): líneas con precio,
 * un descuento opcional, una vigencia y las cláusulas que Eileen quiera aplicar (como avisos). NO es una factura ni un
 * contrato y NO se convierte en factura: si la persona continúa, la facturación sigue su camino normal.
 *
 *  - Las cláusulas viven en una biblioteca editable por cuenta (quote_clauses). Cada cotización guarda una FOTO del texto
 *    de las que aplicó: editar la biblioteca después no cambia lo que ya se le mostró a un cliente.
 *  - Los textos pueden llevar variables ({{cliente}}, {{vigencia}}, {{total}}…) que se resuelven al mostrar la cotización.
 *  - El enlace público (#cotizacion=TOKEN) es de solo lectura; cuenta las veces que se abre para que Eileen sepa si la vieron.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { randomBytes } from 'node:crypto';
import type { TransactionSql } from 'postgres';
import { z } from 'zod';
import { config } from './config.js';
import { sql } from './db.js';
import { fechaDeNegocioPanama } from './panama-date.js';
import { quotePdf } from './billing-reports.js';

type AuthUser = { sub: string; role: 'admin' | 'trainer' | 'client'; email: string };
type Row = Record<string, any>;

async function requireStaff(request: FastifyRequest) {
  await request.jwtVerify();
  const user = request.user as AuthUser;
  if (!['admin', 'trainer'].includes(user.role)) {
    const error = new Error('Acceso restringido');
    (error as Error & { statusCode: number }).statusCode = 403;
    throw error;
  }
}

function sendPdf(reply: FastifyReply, buffer: Buffer, fileName: string) {
  reply.header('Content-Type', 'application/pdf');
  reply.header('Content-Disposition', `inline; filename="${fileName.replace(/[^a-zA-Z0-9._-]/g, '-')}"`);
  reply.header('Cache-Control', 'private, no-store');
  reply.header('X-Content-Type-Options', 'nosniff');
  return reply.send(buffer);
}

const visitas = new Map<string, { n: number; desde: number }>();
function demasiadasVisitas(request: { ip: string }) {
  const ahora = Date.now(); const previo = visitas.get(request.ip);
  if (!previo || ahora - previo.desde > 60_000) { visitas.set(request.ip, { n: 1, desde: ahora }); return false; }
  previo.n += 1;
  if (visitas.size > 5000) visitas.clear();
  return previo.n > 90;
}

// ── Cláusulas de ejemplo ─────────────────────────────────────────────────────────────────────────────────────────
// Textos de trabajo, editables por Eileen; no sustituyen la asesoría de un abogado. Las que dicen "por defecto" vienen marcadas
// en cada cotización nueva.
export type QuoteClauseCategory = 'general' | 'pago' | 'servicio' | 'cancelaciones' | 'salud' | 'datos';
export const DEFAULT_QUOTE_CLAUSES: Array<{ title: string; body: string; category: QuoteClauseCategory; icon: string; defaultOn: boolean }> = [
  { title: 'Cotización informativa', icon: '📌', category: 'general', defaultOn: true,
    body: 'Esta cotización es informativa: no es una factura ni un contrato y por sí sola no genera ninguna obligación de pago. Los precios están expresados en dólares estadounidenses (USD).' },
  { title: 'Vigencia de la propuesta', icon: '⏳', category: 'general', defaultOn: true,
    body: 'Esta propuesta es válida hasta el {{vigencia}}. Pasada esa fecha, los precios y la disponibilidad de horarios pueden cambiar.' },
  { title: 'Forma de pago', icon: '💳', category: 'pago', defaultOn: true,
    body: 'El pago se realiza por adelantado al inicio de cada ciclo, en efectivo, Yappy o transferencia. El servicio se activa una vez recibido el pago.' },
  { title: 'Renovación y día de corte', icon: '🔁', category: 'pago', defaultOn: false,
    body: 'La mensualidad se renueva cada mes en el día de corte acordado. Si prefieres no continuar, avísanos con anticipación, antes del siguiente corte.' },
  { title: 'Reprogramaciones y cancelaciones', icon: '📅', category: 'cancelaciones', defaultOn: true,
    body: 'Las clases pueden reprogramarse con al menos 24 horas de anticipación, de lunes a viernes dentro del horario disponible. Una clase cancelada sin aviso, o que no se reprograma, se considera dada.' },
  { title: 'Clases y rutinas por ciclo', icon: '🗓️', category: 'servicio', defaultOn: false,
    body: 'Las clases y rutinas incluidas corresponden al ciclo contratado y no se acumulan para el siguiente, salvo que se acuerde otra cosa por escrito.' },
  { title: 'Vigencia de los paquetes', icon: '🎟️', category: 'servicio', defaultOn: false,
    body: 'Las clases de un paquete se usan dentro de su plazo de vigencia (por defecto, 6 semanas desde el pago). Las clases no tomadas al vencer el paquete se pierden.' },
  { title: 'Rutinas personalizadas', icon: '🏋️', category: 'servicio', defaultOn: false,
    body: 'Las rutinas se entregan en tu portal o por un enlace personal, cada una con su fecha límite. Los videos son de uso personal y sirven de guía. Puedes repetir cada rutina las veces que quieras mientras esté vigente.' },
  { title: 'Salud y seguridad', icon: '❤️‍🩹', category: 'salud', defaultOn: true,
    body: 'Declaras haber informado tus condiciones de salud y lesiones, y te comprometes a avisar cualquier cambio. El entrenamiento no sustituye la atención médica; detente ante cualquier dolor o malestar.' },
  { title: 'Viajes y ausencias', icon: '✈️', category: 'servicio', defaultOn: false,
    body: 'Si vas a viajar, avísanos: podemos prepararte una rutina por enlace para que entrenes fuera. Las clases presenciales de esos días se coordinan con anticipación.' },
  { title: 'Lo que no incluye', icon: '🚫', category: 'servicio', defaultOn: false,
    body: 'Esta propuesta no incluye plan de alimentación, suplementos, equipo personal ni gastos de traslado, salvo que se indique expresamente.' },
  { title: 'Precios e impuestos', icon: '💲', category: 'pago', defaultOn: false,
    body: 'Los precios pueden cambiar con previo aviso. Si corresponde algún impuesto, se indicará en la factura respectiva.' },
  { title: 'Protección de datos personales', icon: '🔒', category: 'datos', defaultOn: false,
    body: 'Tus datos se usan únicamente para prestarte el servicio y se tratan conforme a la Ley 81 de 2019 de Panamá.' },
  { title: 'Cómo continuar', icon: '🤝', category: 'general', defaultOn: false,
    body: 'Para comenzar, confírmanos por WhatsApp o en tu primera sesión. A partir de ahí coordinamos tu primer pago y tu horario.' }
];

async function ensureDefaultClauses(ownerId: string) {
  const [row] = await sql`SELECT quote_clauses_seeded_at FROM account_settings WHERE owner_id = ${ownerId}`;
  if (row?.quote_clauses_seeded_at) return;
  await sql.begin(async transaction => {
    await transaction`INSERT INTO account_settings (owner_id) VALUES (${ownerId}) ON CONFLICT (owner_id) DO NOTHING`;
    const [claim] = await transaction`UPDATE account_settings SET quote_clauses_seeded_at = now() WHERE owner_id = ${ownerId} AND quote_clauses_seeded_at IS NULL RETURNING owner_id`;
    if (!claim) return;   // otra petición la sembró primero
    let order = 0;
    for (const clause of DEFAULT_QUOTE_CLAUSES) {
      order += 10;
      await transaction`INSERT INTO quote_clauses (owner_id, title, body, category, icon, default_on, sort_order) VALUES (${ownerId}, ${clause.title}, ${clause.body}, ${clause.category}, ${clause.icon}, ${clause.defaultOn}, ${order})`;
    }
  });
}

// ── Cálculo y presentación ───────────────────────────────────────────────────────────────────────────────────────
const cents = (value: number) => Math.round(value * 100);
const fromCents = (value: number) => value / 100;
const dmy = (value: string) => `${value.slice(8, 10)}-${value.slice(5, 7)}-${value.slice(0, 4)}`;
const money = (value: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
const addDays = (value: string, days: number) => { const d = new Date(`${value}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); };
export const quoteCode = (number: unknown) => `COT-${String(number).padStart(4, '0')}`;

const itemInput = z.object({
  description: z.string().trim().min(1, 'Cada línea necesita un concepto').max(200),
  detail: z.string().trim().max(400).optional().nullable(),
  quantity: z.coerce.number().min(0.01).max(1000).default(1),
  unitAmount: z.coerce.number().min(0).max(100000),
  planId: z.string().uuid().nullable().optional()
});
type ItemInput = z.infer<typeof itemInput>;

export function computeQuoteTotals(items: Array<{ quantity: number; unitAmount: number }>, discountKind: 'none' | 'percent' | 'amount', discountValue: number) {
  const lines = items.map(item => cents(item.quantity * item.unitAmount));
  const subtotal = lines.reduce((sum, line) => sum + line, 0);
  let discount = 0;
  if (discountKind === 'percent') discount = Math.round(subtotal * Math.min(100, discountValue) / 100);
  else if (discountKind === 'amount') discount = Math.min(subtotal, cents(discountValue));
  return { lineAmounts: lines.map(fromCents), subtotal: fromCents(subtotal), discountAmount: fromCents(discount), total: fromCents(subtotal - discount) };
}

/** Resuelve las variables de una cláusula con los datos de la cotización. Una variable desconocida se deja tal cual (así se nota al revisarla). */
export function renderClauseText(text: string, context: { client: string; firstName: string; valid: string; total: string; issued: string; code: string }) {
  const values: Record<string, string> = { cliente: context.firstName, nombre: context.client, vigencia: context.valid, total: context.total, emision: context.issued, numero: context.code };
  return text.replace(/\{\{\s*([a-zA-Z_]+)\s*\}\}/g, (match, name: string) => (name.toLowerCase() in values ? values[name.toLowerCase()] : match));
}

function derivedStatus(row: Row, today: string) {
  if (['draft', 'sent'].includes(row.status) && String(row.valid_until_text) < today) return 'expired';
  return String(row.status);
}

const firstName = (name: string) => String(name || '').trim().split(/\s+/)[0] || '';

function quoteView(row: Row, today: string) {
  const items = (Array.isArray(row.items) ? row.items : []) as Array<Record<string, any>>;
  const totals = computeQuoteTotals(items.map(item => ({ quantity: Number(item.quantity) || 0, unitAmount: Number(item.unitAmount) || 0 })), row.discount_kind, Number(row.discount_value) || 0);
  const name = String(row.client_name || row.prospect_name || '');
  const valid = String(row.valid_until_text); const issued = String(row.issued_on_text);
  const context = { client: name, firstName: firstName(name), valid: dmy(valid), total: money(Number(row.total)), issued: dmy(issued), code: quoteCode(row.number) };
  const clauses = ((Array.isArray(row.clauses) ? row.clauses : []) as Array<Record<string, any>>).map(clause => ({
    id: clause.id ?? null, icon: String(clause.icon || '📌'), title: String(clause.title), body: renderClauseText(String(clause.body), context)
  }));
  return {
    id: String(row.id), number: Number(row.number), code: quoteCode(row.number), title: String(row.title), intro: row.intro || null, notes: row.notes || null,
    status: derivedStatus(row, today), storedStatus: String(row.status),
    recipient: { clientId: row.client_id ? String(row.client_id) : null, name, firstName: firstName(name), email: row.client_email || row.prospect_email || null, phone: row.client_phone || row.prospect_phone || null, isClient: Boolean(row.client_id) },
    issuedOn: issued, validUntil: valid, daysLeft: Math.round((Date.parse(`${valid}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86_400_000),
    items: items.map((item, index) => ({ description: String(item.description), detail: item.detail || null, quantity: Number(item.quantity), unitAmount: Number(item.unitAmount), amount: totals.lineAmounts[index], planId: item.planId ?? null })),
    discount: { kind: String(row.discount_kind), value: Number(row.discount_value), amount: totals.discountAmount },
    subtotal: totals.subtotal, total: totals.total, clauses,
    share: { active: Boolean(row.share_token), url: row.share_token ? `${config.APP_URL}/#cotizacion=${row.share_token}` : null, sharedAt: row.shared_at || null, viewedAt: row.viewed_at || null, viewCount: Number(row.view_count) || 0 },
    sentAt: row.sent_at || null, respondedAt: row.responded_at || null, createdAt: row.created_at, updatedAt: row.updated_at
  };
}

const quoteSelect = () => sql`
  SELECT q.*, q.issued_on::text AS issued_on_text, q.valid_until::text AS valid_until_text, c.full_name AS client_name, c.email AS client_email, c.phone AS client_phone
  FROM quotes q LEFT JOIN clients c ON c.id = q.client_id`;

// ── Entradas ─────────────────────────────────────────────────────────────────────────────────────────────────────
const clauseRef = z.union([
  z.object({ clauseId: z.string().uuid() }),
  z.object({ title: z.string().trim().min(2).max(120), body: z.string().trim().min(2).max(2000), icon: z.string().trim().min(1).max(8).optional() })
]);
const quoteInput = z.object({
  clientId: z.string().uuid().nullable().optional(),
  prospect: z.object({ name: z.string().trim().min(1, 'Escribe el nombre de la persona').max(120), email: z.string().trim().max(160).optional().nullable(), phone: z.string().trim().max(40).optional().nullable() }).optional().nullable(),
  title: z.string().trim().min(2).max(140).default('Propuesta de entrenamiento'),
  intro: z.string().trim().max(1500).optional().nullable(),
  notes: z.string().trim().max(1500).optional().nullable(),
  issuedOn: z.string().date().optional(),
  validUntil: z.string().date().optional(),
  items: z.array(itemInput).min(1, 'Agrega al menos una línea a la cotización').max(40),
  discount: z.object({ kind: z.enum(['none', 'percent', 'amount']).default('none'), value: z.coerce.number().min(0).max(100000).default(0) }).optional(),
  clauses: z.array(clauseRef).max(30).default([])
}).refine(value => value.clientId || value.prospect?.name, { message: 'Elige un cliente o escribe el nombre de la persona', path: ['clientId'] })
  .refine(value => !value.discount || value.discount.kind !== 'percent' || value.discount.value <= 100, { message: 'El descuento no puede pasar de 100 %', path: ['discount'] });

const clauseInput = z.object({
  title: z.string().trim().min(2, 'Ponle un título').max(120),
  body: z.string().trim().min(2, 'Escribe el texto de la cláusula').max(2000),
  category: z.enum(['general', 'pago', 'servicio', 'cancelaciones', 'salud', 'datos']).default('general'),
  icon: z.string().trim().min(1).max(8).default('📌'),
  defaultOn: z.boolean().default(false),
  active: z.boolean().default(true),
  sortOrder: z.coerce.number().int().min(0).max(100000).optional()
});

const clauseValue = (row: Row) => ({ id: String(row.id), title: String(row.title), body: String(row.body), category: String(row.category), icon: String(row.icon), defaultOn: Boolean(row.default_on), active: Boolean(row.active), sortOrder: Number(row.sort_order) });

type Tx = TransactionSql;

/** Resuelve las cláusulas pedidas (de la biblioteca o propias de esta cotización) en su foto de texto. */
async function snapshotClauses(transaction: Tx, ownerId: string, refs: z.infer<typeof clauseRef>[]) {
  const out: Array<{ id: string | null; icon: string; title: string; body: string }> = [];
  for (const ref of refs) {
    if ('clauseId' in ref) {
      const [row] = await transaction`SELECT id::text AS id, title, body, icon FROM quote_clauses WHERE id = ${ref.clauseId} AND owner_id = ${ownerId}`;
      if (!row) throw Object.assign(new Error('Una de las cláusulas ya no existe'), { statusCode: 404 });
      out.push({ id: String(row.id), icon: String(row.icon), title: String(row.title), body: String(row.body) });
    } else out.push({ id: null, icon: ref.icon || '✏️', title: ref.title, body: ref.body });
  }
  return out;
}

async function resolveRecipient(transaction: Tx, ownerId: string, input: z.infer<typeof quoteInput>) {
  if (input.clientId) {
    const [client] = await transaction`SELECT id::text AS id, full_name, email, phone FROM clients WHERE id = ${input.clientId} AND owner_id = ${ownerId}`;
    if (!client) throw Object.assign(new Error('Cliente no encontrado'), { statusCode: 404 });
    // Se guarda también su nombre: si el cliente se elimina, la cotización conserva a quién iba dirigida.
    return { clientId: String(client.id), name: String(client.full_name), email: client.email || null, phone: client.phone || null };
  }
  return { clientId: null, name: input.prospect!.name, email: input.prospect?.email || null, phone: input.prospect?.phone || null };
}

export async function registerQuoteRoutes(app: FastifyInstance) {
  // ── Biblioteca de cláusulas ─────────────────────────────────────────────────────────────────────────────────────
  app.get('/api/quote-clauses', { preHandler: requireStaff }, async request => {
    const auth = request.user as AuthUser; await ensureDefaultClauses(auth.sub);
    const rows = await sql`SELECT * FROM quote_clauses WHERE owner_id = ${auth.sub} ORDER BY sort_order, created_at`;
    return rows.map(clauseValue);
  });

  app.post('/api/quote-clauses', { preHandler: requireStaff }, async (request, reply) => {
    const auth = request.user as AuthUser; const input = clauseInput.parse(request.body); await ensureDefaultClauses(auth.sub);
    const [last] = await sql`SELECT COALESCE(max(sort_order), 0)::int AS n FROM quote_clauses WHERE owner_id = ${auth.sub}`;
    const [row] = await sql`
      INSERT INTO quote_clauses (owner_id, title, body, category, icon, default_on, active, sort_order)
      VALUES (${auth.sub}, ${input.title}, ${input.body}, ${input.category}, ${input.icon}, ${input.defaultOn}, ${input.active}, ${input.sortOrder ?? Number(last.n) + 10}) RETURNING *`;
    return reply.code(201).send(clauseValue(row));
  });

  app.patch('/api/quote-clauses/:id', { preHandler: requireStaff }, async (request, reply) => {
    const auth = request.user as AuthUser; const id = z.string().uuid().parse((request.params as { id: string }).id);
    const input = clauseInput.partial().parse(request.body);
    const [current] = await sql`SELECT * FROM quote_clauses WHERE id = ${id} AND owner_id = ${auth.sub}`;
    if (!current) return reply.code(404).send({ error: 'Cláusula no encontrada' });
    const [row] = await sql`
      UPDATE quote_clauses SET title = ${input.title ?? current.title}, body = ${input.body ?? current.body}, category = ${input.category ?? current.category},
        icon = ${input.icon ?? current.icon}, default_on = ${input.defaultOn ?? current.default_on}, active = ${input.active ?? current.active},
        sort_order = ${input.sortOrder ?? current.sort_order}, updated_at = now() WHERE id = ${id} RETURNING *`;
    return clauseValue(row);
  });

  app.delete('/api/quote-clauses/:id', { preHandler: requireStaff }, async (request, reply) => {
    const auth = request.user as AuthUser; const id = z.string().uuid().parse((request.params as { id: string }).id);
    const [row] = await sql`DELETE FROM quote_clauses WHERE id = ${id} AND owner_id = ${auth.sub} RETURNING id`;
    if (!row) return reply.code(404).send({ error: 'Cláusula no encontrada' });
    return { deleted: true };
  });

  // Vuelve a poner las cláusulas de ejemplo que falten (por título); no toca las que ya existen ni las propias.
  app.post('/api/quote-clauses/restore-defaults', { preHandler: requireStaff }, async request => {
    const auth = request.user as AuthUser; await ensureDefaultClauses(auth.sub);
    const existing = await sql`SELECT title FROM quote_clauses WHERE owner_id = ${auth.sub}`;
    const titles = new Set(existing.map(row => String(row.title).toLowerCase()));
    const [last] = await sql`SELECT COALESCE(max(sort_order), 0)::int AS n FROM quote_clauses WHERE owner_id = ${auth.sub}`;
    let order = Number(last.n); let restored = 0;
    for (const clause of DEFAULT_QUOTE_CLAUSES) {
      if (titles.has(clause.title.toLowerCase())) continue;
      order += 10; restored += 1;
      await sql`INSERT INTO quote_clauses (owner_id, title, body, category, icon, default_on, sort_order) VALUES (${auth.sub}, ${clause.title}, ${clause.body}, ${clause.category}, ${clause.icon}, ${clause.defaultOn}, ${order})`;
    }
    return { restored };
  });

  // ── Cotizaciones ────────────────────────────────────────────────────────────────────────────────────────────────
  const listQuery = z.object({ status: z.enum(['all', 'draft', 'sent', 'accepted', 'declined', 'expired']).default('all'), q: z.string().trim().max(80).optional(), clientId: z.string().uuid().optional() });
  app.get('/api/quotes', { preHandler: requireStaff }, async request => {
    const auth = request.user as AuthUser; const query = listQuery.parse(request.query); const today = fechaDeNegocioPanama();
    const rows = await sql`${quoteSelect()} WHERE q.owner_id = ${auth.sub} ${query.clientId ? sql`AND q.client_id = ${query.clientId}` : sql``} ORDER BY q.created_at DESC, q.number DESC LIMIT 500`;
    const all = rows.map(row => quoteView(row, today));
    const counts: Record<string, number> = { all: all.length, draft: 0, sent: 0, accepted: 0, declined: 0, expired: 0 };
    for (const quote of all) counts[quote.status] += 1;
    const needle = (query.q || '').toLowerCase();
    const items = all.filter(quote => (query.status === 'all' || quote.status === query.status)
      && (!needle || `${quote.code} ${quote.title} ${quote.recipient.name}`.toLowerCase().includes(needle)));
    return { items, counts };
  });

  const loadQuote = async (ownerId: string, id: string) => {
    const [row] = await sql`${quoteSelect()} WHERE q.id = ${id} AND q.owner_id = ${ownerId}`;
    return row ? quoteView(row, fechaDeNegocioPanama()) : null;
  };

  app.get('/api/quotes/:id', { preHandler: requireStaff }, async (request, reply) => {
    const auth = request.user as AuthUser; const id = z.string().uuid().parse((request.params as { id: string }).id);
    const quote = await loadQuote(auth.sub, id);
    return quote ?? reply.code(404).send({ error: 'Cotización no encontrada' });
  });

  app.post('/api/quotes', { preHandler: requireStaff }, async (request, reply) => {
    const auth = request.user as AuthUser; const input = quoteInput.parse(request.body); const today = fechaDeNegocioPanama();
    const issuedOn = input.issuedOn ?? today; const validUntil = input.validUntil ?? addDays(issuedOn, 15);
    if (validUntil < issuedOn) return reply.code(400).send({ error: 'La vigencia no puede ser anterior a la fecha de emisión' });
    const totals = computeQuoteTotals(input.items, input.discount?.kind ?? 'none', input.discount?.value ?? 0);
    const id = await sql.begin(async transaction => {
      const recipient = await resolveRecipient(transaction, auth.sub, input);
      const clauses = await snapshotClauses(transaction, auth.sub, input.clauses);
      await transaction`SELECT pg_advisory_xact_lock(hashtext(${`quote-number:${auth.sub}`}))`;
      const [{ n }] = await transaction`SELECT COALESCE(max(number), 0)::int + 1 AS n FROM quotes WHERE owner_id = ${auth.sub}`;
      const [row] = await transaction`
        INSERT INTO quotes (owner_id, number, client_id, prospect_name, prospect_email, prospect_phone, title, intro, notes, issued_on, valid_until, items,
          discount_kind, discount_value, subtotal, discount_amount, total, clauses, created_by)
        VALUES (${auth.sub}, ${n}, ${recipient.clientId}, ${recipient.name}, ${recipient.email}, ${recipient.phone}, ${input.title}, ${input.intro || null}, ${input.notes || null},
          ${issuedOn}::date, ${validUntil}::date, ${transaction.json(input.items.map(item => ({ description: item.description, detail: item.detail || null, quantity: item.quantity, unitAmount: item.unitAmount, planId: item.planId ?? null })))},
          ${input.discount?.kind ?? 'none'}, ${input.discount?.value ?? 0}, ${totals.subtotal}, ${totals.discountAmount}, ${totals.total}, ${transaction.json(clauses)}, ${auth.sub})
        RETURNING id::text AS id`;
      return String(row.id);
    });
    return reply.code(201).send(await loadQuote(auth.sub, id));
  });

  app.patch('/api/quotes/:id', { preHandler: requireStaff }, async (request, reply) => {
    const auth = request.user as AuthUser; const id = z.string().uuid().parse((request.params as { id: string }).id); const input = quoteInput.parse(request.body);
    const [current] = await sql`SELECT id, status, issued_on::text AS issued_on FROM quotes WHERE id = ${id} AND owner_id = ${auth.sub}`;
    if (!current) return reply.code(404).send({ error: 'Cotización no encontrada' });
    if (['accepted', 'declined'].includes(String(current.status))) return reply.code(409).send({ error: 'Esta cotización ya tiene respuesta. Reábrela para poder editarla.' });
    const issuedOn = input.issuedOn ?? String(current.issued_on); const validUntil = input.validUntil ?? addDays(issuedOn, 15);
    if (validUntil < issuedOn) return reply.code(400).send({ error: 'La vigencia no puede ser anterior a la fecha de emisión' });
    const totals = computeQuoteTotals(input.items, input.discount?.kind ?? 'none', input.discount?.value ?? 0);
    await sql.begin(async transaction => {
      const recipient = await resolveRecipient(transaction, auth.sub, input);
      const clauses = await snapshotClauses(transaction, auth.sub, input.clauses);
      await transaction`
        UPDATE quotes SET client_id = ${recipient.clientId}, prospect_name = ${recipient.name}, prospect_email = ${recipient.email}, prospect_phone = ${recipient.phone},
          title = ${input.title}, intro = ${input.intro || null}, notes = ${input.notes || null}, issued_on = ${issuedOn}::date, valid_until = ${validUntil}::date,
          items = ${transaction.json(input.items.map(item => ({ description: item.description, detail: item.detail || null, quantity: item.quantity, unitAmount: item.unitAmount, planId: item.planId ?? null })))},
          discount_kind = ${input.discount?.kind ?? 'none'}, discount_value = ${input.discount?.value ?? 0}, subtotal = ${totals.subtotal}, discount_amount = ${totals.discountAmount}, total = ${totals.total},
          clauses = ${transaction.json(clauses)}, updated_at = now()
        WHERE id = ${id}`;
    });
    return loadQuote(auth.sub, id);
  });

  app.delete('/api/quotes/:id', { preHandler: requireStaff }, async (request, reply) => {
    const auth = request.user as AuthUser; const id = z.string().uuid().parse((request.params as { id: string }).id);
    const [row] = await sql`DELETE FROM quotes WHERE id = ${id} AND owner_id = ${auth.sub} RETURNING id`;
    if (!row) return reply.code(404).send({ error: 'Cotización no encontrada' });
    return { deleted: true };
  });

  app.post('/api/quotes/:id/duplicate', { preHandler: requireStaff }, async (request, reply) => {
    const auth = request.user as AuthUser; const id = z.string().uuid().parse((request.params as { id: string }).id); const today = fechaDeNegocioPanama();
    const newId = await sql.begin(async transaction => {
      const [source] = await transaction`SELECT * FROM quotes WHERE id = ${id} AND owner_id = ${auth.sub}`;
      if (!source) return null;
      await transaction`SELECT pg_advisory_xact_lock(hashtext(${`quote-number:${auth.sub}`}))`;
      const [{ n }] = await transaction`SELECT COALESCE(max(number), 0)::int + 1 AS n FROM quotes WHERE owner_id = ${auth.sub}`;
      const [row] = await transaction`
        INSERT INTO quotes (owner_id, number, client_id, prospect_name, prospect_email, prospect_phone, title, intro, notes, issued_on, valid_until, items,
          discount_kind, discount_value, subtotal, discount_amount, total, clauses, created_by)
        VALUES (${auth.sub}, ${n}, ${source.client_id}, ${source.prospect_name}, ${source.prospect_email}, ${source.prospect_phone}, ${source.title}, ${source.intro}, ${source.notes},
          ${today}::date, ${addDays(today, 15)}::date, ${transaction.json(source.items)}, ${source.discount_kind}, ${source.discount_value}, ${source.subtotal}, ${source.discount_amount}, ${source.total}, ${transaction.json(source.clauses)}, ${auth.sub})
        RETURNING id::text AS id`;
      return String(row.id);
    });
    if (!newId) return reply.code(404).send({ error: 'Cotización no encontrada' });
    return reply.code(201).send(await loadQuote(auth.sub, newId));
  });

  app.post('/api/quotes/:id/status', { preHandler: requireStaff }, async (request, reply) => {
    const auth = request.user as AuthUser; const id = z.string().uuid().parse((request.params as { id: string }).id);
    const { status } = z.object({ status: z.enum(['draft', 'sent', 'accepted', 'declined']) }).parse(request.body);
    const [row] = await sql`
      UPDATE quotes SET status = ${status},
        sent_at = CASE WHEN ${status} IN ('sent', 'accepted', 'declined') THEN COALESCE(sent_at, now()) ELSE NULL END,
        responded_at = CASE WHEN ${status} IN ('accepted', 'declined') THEN now() ELSE NULL END, updated_at = now()
      WHERE id = ${id} AND owner_id = ${auth.sub} RETURNING id::text AS id`;
    if (!row) return reply.code(404).send({ error: 'Cotización no encontrada' });
    return loadQuote(auth.sub, String(row.id));
  });

  // Compartir: crea (o reutiliza) el enlace público y, si estaba en borrador, la marca como enviada.
  app.post('/api/quotes/:id/share', { preHandler: requireStaff }, async (request, reply) => {
    const auth = request.user as AuthUser; const id = z.string().uuid().parse((request.params as { id: string }).id);
    const [current] = await sql`SELECT id, share_token FROM quotes WHERE id = ${id} AND owner_id = ${auth.sub}`;
    if (!current) return reply.code(404).send({ error: 'Cotización no encontrada' });
    const token = current.share_token ? String(current.share_token) : randomBytes(24).toString('base64url');
    await sql`
      UPDATE quotes SET share_token = ${token}, shared_at = COALESCE(shared_at, now()),
        status = CASE WHEN status = 'draft' THEN 'sent' ELSE status END, sent_at = COALESCE(sent_at, now()), updated_at = now() WHERE id = ${id}`;
    return loadQuote(auth.sub, id);
  });

  // Revocar: el enlace deja de abrir y se reinician sus visitas; el siguiente "compartir" crea uno nuevo.
  app.delete('/api/quotes/:id/share', { preHandler: requireStaff }, async (request, reply) => {
    const auth = request.user as AuthUser; const id = z.string().uuid().parse((request.params as { id: string }).id);
    const [row] = await sql`UPDATE quotes SET share_token = NULL, shared_at = NULL, viewed_at = NULL, view_count = 0, updated_at = now() WHERE id = ${id} AND owner_id = ${auth.sub} RETURNING id::text AS id`;
    if (!row) return reply.code(404).send({ error: 'Cotización no encontrada' });
    return loadQuote(auth.sub, String(row.id));
  });

  app.get('/api/quotes/:id/pdf', { preHandler: requireStaff }, async (request, reply) => {
    const auth = request.user as AuthUser; const id = z.string().uuid().parse((request.params as { id: string }).id);
    const quote = await loadQuote(auth.sub, id);
    if (!quote) return reply.code(404).send({ error: 'Cotización no encontrada' });
    return sendPdf(reply, await quotePdf(quote), `cotizacion-${quote.code}.pdf`);
  });

  // ── Página pública (sin sesión) ────────────────────────────────────────────────────────────────────────────────
  const publicQuote = async (token: string) => {
    if (!/^[A-Za-z0-9_-]{30,80}$/.test(token)) return null;
    const [row] = await sql`${quoteSelect()} WHERE q.share_token = ${token}`;
    return row ?? null;
  };

  app.get('/api/public/quote/:token', async (request, reply) => {
    if (demasiadasVisitas(request)) return reply.code(429).send({ error: 'Demasiados intentos. Espera un minuto.' });
    const row = await publicQuote(String((request.params as { token: string }).token));
    if (!row) return reply.code(404).send({ error: 'Este enlace no existe o Eileen lo retiró.' });
    await sql`UPDATE quotes SET view_count = view_count + 1, viewed_at = COALESCE(viewed_at, now()) WHERE id = ${row.id}`;
    const view = quoteView(row, fechaDeNegocioPanama());
    const [settings] = await sql`SELECT contact_whatsapp FROM account_settings WHERE owner_id = ${row.owner_id}`;
    return {
      code: view.code, title: view.title, intro: view.intro, notes: view.notes, status: view.status === 'expired' ? 'expired' : 'valid',
      recipient: { name: view.recipient.name, firstName: view.recipient.firstName }, issuedOn: view.issuedOn, validUntil: view.validUntil, daysLeft: view.daysLeft,
      items: view.items.map(({ description, detail, quantity, unitAmount, amount }) => ({ description, detail, quantity, unitAmount, amount })),
      discount: view.discount, subtotal: view.subtotal, total: view.total, clauses: view.clauses.map(({ icon, title, body }) => ({ icon, title, body })),
      owner: { name: 'Eileen Lifestyle', whatsapp: settings?.contact_whatsapp ? String(settings.contact_whatsapp).replace(/\D/g, '') : null }, updatedAt: view.updatedAt
    };
  });

  app.get('/api/public/quote/:token/pdf', async (request, reply) => {
    if (demasiadasVisitas(request)) return reply.code(429).send({ error: 'Demasiados intentos. Espera un minuto.' });
    const row = await publicQuote(String((request.params as { token: string }).token));
    if (!row) return reply.code(404).send({ error: 'Este enlace no existe o Eileen lo retiró.' });
    const view = quoteView(row, fechaDeNegocioPanama());
    return sendPdf(reply, await quotePdf(view), `cotizacion-${view.code}.pdf`);
  });
}
