/**
 * Cumpleaños de los clientes.
 *
 * Eileen quiere saberlo DOS DÍAS ANTES para tener tiempo de escribirles. Este módulo calcula el próximo cumpleaños de cada
 * cliente activo (no demo) con fecha de nacimiento y alimenta tres cosas: la campanita (hoy, mañana y pasado mañana), el
 * push de la entrenadora (una sola vez por cumpleaños, desde las 8:00 de Panamá) y la tarjeta "Próximos cumpleaños" del Resumen.
 *
 * Las fechas son de calendario (aaaa-mm-dd) y se comparan sin pasar por UTC. Quien nació un 29 de febrero celebra el 28
 * en los años que no son bisiestos.
 */
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { sql } from './db.js';
import { fechaDeNegocioPanama, horaDeNegocioPanama } from './panama-date.js';

type AuthUser = { sub: string; role: 'admin' | 'trainer' | 'client'; email: string };

/** Días de antelación del aviso (decisión de Joel/Eileen: dos días antes). */
export const BIRTHDAY_NOTICE_DAYS = 2;

const pad = (n: number) => String(n).padStart(2, '0');
const isLeap = (year: number) => (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
const dayNumber = (date: string) => Math.round(Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10))) / 86_400_000);
const dmy = (date: string) => `${date.slice(8, 10)}-${date.slice(5, 7)}-${date.slice(0, 4)}`;

export type BirthdayItem = {
  clientId: string; name: string; phone: string | null;
  /** Fecha del cumpleaños que viene (aaaa-mm-dd) y cuántos días faltan desde hoy (0 = hoy). */
  date: string; daysUntil: number; turns: number | null;
};

/** Próximo cumpleaños (de hoy en adelante) de alguien nacido en `birthDate`. */
export function nextBirthday(birthDate: string, today: string): { date: string; daysUntil: number; turns: number | null } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate) || !/^\d{4}-\d{2}-\d{2}$/.test(today)) return null;
  const month = Number(birthDate.slice(5, 7)); const day = Number(birthDate.slice(8, 10)); const born = Number(birthDate.slice(0, 4));
  const occurrence = (year: number) => `${year}-${pad(month)}-${pad(month === 2 && day === 29 && !isLeap(year) ? 28 : day)}`;
  let year = Number(today.slice(0, 4)); let date = occurrence(year);
  if (date < today) { year += 1; date = occurrence(year); }
  const turns = year - born;
  return { date, daysUntil: dayNumber(date) - dayNumber(today), turns: born >= 1900 && turns > 0 && turns <= 120 ? turns : null };
}

/** Clave estable (uuid) por cliente y cumpleaños: sirve de reference_id en notification_deliveries. */
export function birthdayReference(clientId: string, date: string) {
  const h = createHash('md5').update(`birthday:${clientId}:${date}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

export const whenText = (daysUntil: number) => (daysUntil <= 0 ? 'hoy' : daysUntil === 1 ? 'mañana' : daysUntil === 2 ? 'pasado mañana' : `en ${daysUntil} días`);

export function birthdayPayload(item: BirthdayItem) {
  const first = item.name.trim().split(/\s+/)[0] || item.name;
  return {
    title: `🎂 Cumpleaños de ${item.name}`,
    body: `${item.turns ? `Cumple ${item.turns} años` : 'Cumple años'} ${whenText(item.daysUntil)} (${dmy(item.date)}). ¿Le escribes un saludo a ${first}?`
  };
}

/** Clientes activos (no demo) con cumpleaños dentro de los próximos `withinDays` días, del más cercano al más lejano. */
export async function upcomingBirthdays(ownerId: string, today: string, withinDays: number): Promise<BirthdayItem[]> {
  const rows = await sql`
    SELECT id::text AS id, full_name, phone, birth_date::text AS birth_date
    FROM clients
    WHERE owner_id = ${ownerId} AND status = 'active' AND service_mode <> 'demo' AND birth_date IS NOT NULL`;
  const items: BirthdayItem[] = [];
  for (const row of rows) {
    const next = nextBirthday(String(row.birth_date), today);
    if (!next || next.daysUntil > withinDays) continue;
    items.push({ clientId: String(row.id), name: String(row.full_name), phone: row.phone ? String(row.phone) : null, ...next });
  }
  return items.sort((a, b) => a.daysUntil - b.daysUntil || a.name.localeCompare(b.name, 'es'));
}

/** Avisos de push pendientes: los cumpleaños a 1 o 2 días (si el servidor estuvo apagado el primer día, aún avisa), desde las 8:00. */
export async function birthdayPushCandidates(ownerId: string, today = fechaDeNegocioPanama(), hour = horaDeNegocioPanama()) {
  if (hour < 8) return [];
  return (await upcomingBirthdays(ownerId, today, BIRTHDAY_NOTICE_DAYS)).filter(item => item.daysUntil >= 1)
    .map(item => ({ ...item, referenceId: birthdayReference(item.clientId, item.date) }));
}

async function requireStaff(request: FastifyRequest) {
  await request.jwtVerify();
  const user = request.user as AuthUser;
  if (!['admin', 'trainer'].includes(user.role)) {
    const error = new Error('Acceso restringido');
    (error as Error & { statusCode: number }).statusCode = 403;
    throw error;
  }
}

export async function registerBirthdayRoutes(app: FastifyInstance) {
  app.get('/api/birthdays', { preHandler: requireStaff }, async request => {
    const auth = request.user as AuthUser;
    const { days } = z.object({ days: z.coerce.number().int().min(0).max(366).default(30) }).parse(request.query);
    return { today: fechaDeNegocioPanama(), noticeDays: BIRTHDAY_NOTICE_DAYS, items: await upcomingBirthdays(auth.sub, fechaDeNegocioPanama(), days) };
  });
}
