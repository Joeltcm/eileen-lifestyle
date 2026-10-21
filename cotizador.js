// ── Cotizador de Eileen ──────────────────────────────────────────────────────────────────────────────────────────
// Propuestas INFORMATIVAS para clientes (o personas que todavía no lo son), con las cláusulas que Eileen quiera aplicar como avisos.
// No son facturas ni contratos y no se convierten en factura. Se arman en una sola pantalla (para quién · qué ofreces · condiciones ·
// mensaje), se ven tal como las verá el cliente, se comparten por WhatsApp, enlace o PDF, y se puede saber si ya las abrieron.
// Este archivo comparte el ámbito global con app.js (api, toast, openModal, money, escapeHtml…): la guardia del build los revisa juntos.

const quoteStatusInfo = {
  draft: { label: 'Borrador', icon: '✏️' }, sent: { label: 'Enviada', icon: '📤' }, accepted: { label: 'Aceptada', icon: '✅' },
  declined: { label: 'No continuó', icon: '🚫' }, expired: { label: 'Vencida', icon: '⌛' }
};
const quoteFilterTabs = [['all', 'Todas'], ['draft', 'Borradores'], ['sent', 'Enviadas'], ['accepted', 'Aceptadas'], ['declined', 'No continuaron'], ['expired', 'Vencidas']];
const quoteClauseCategories = { general: 'General', pago: 'Pagos', servicio: 'El servicio', cancelaciones: 'Clases y cancelaciones', salud: 'Salud y seguridad', datos: 'Datos personales' };
const quoteEmojiChoices = ['📌', '⏳', '💳', '🔁', '📅', '🗓️', '🎟️', '🏋️', '❤️‍🩹', '✈️', '🚫', '💲', '🔒', '🤝', '🎁', '📝', '✅', '⚠️', '🕒', '💬', '🏠', '🌧️', '🧘', '🥗'];
const quoteVariableHelp = [['{{cliente}}', 'su primer nombre'], ['{{vigencia}}', 'hasta cuándo vale'], ['{{total}}', 'el total'], ['{{emision}}', 'fecha de emisión'], ['{{numero}}', 'COT-0001']];

const quotesState = { items: [], counts: {}, filter: 'all', query: '', loaded: false, error: '', clauses: [], editor: null };

const quoteDay = value => String(value || '').slice(0, 10);
const quoteAddDays = (value, days) => { const date = new Date(`${quoteDay(value)}T12:00:00`); date.setDate(date.getDate() + days); return dateKey(date); };
const quoteDaysLeft = until => Math.round((new Date(`${quoteDay(until)}T12:00:00`) - new Date(`${dateKey(today)}T12:00:00`)) / 86400000);
const quoteFirstName = name => String(name || '').trim().split(/\s+/)[0] || '';
const quoteCents = value => Math.round(Number(value || 0) * 100);
const quoteLineAmount = item => quoteCents(item.quantity) * quoteCents(item.unitAmount) / 10000;

function quoteTotals(items, kind, value) {
  const subtotal = items.reduce((sum, item) => sum + Math.round(Number(item.quantity || 0) * Number(item.unitAmount || 0) * 100), 0);
  let discount = 0;
  if (kind === 'percent') discount = Math.round(subtotal * Math.min(100, Number(value || 0)) / 100);
  else if (kind === 'amount') discount = Math.min(subtotal, quoteCents(value));
  return { subtotal: subtotal / 100, discount: discount / 100, total: (subtotal - discount) / 100 };
}

function quoteClauseText(text, context) {
  const values = { cliente: context.firstName, nombre: context.name, vigencia: context.valid, total: context.total, emision: context.issued, numero: context.code };
  return String(text).replace(/\{\{\s*([a-zA-Z_]+)\s*\}\}/g, (match, name) => (name.toLowerCase() in values ? values[name.toLowerCase()] : match));
}

const quoteQuantityText = value => { const number = Number(value); return Number.isInteger(number) ? String(number) : String(number).replace('.', ','); };
const quotePhoneDigits = phone => { const digits = String(phone || '').replace(/\D/g, ''); return digits.length === 8 ? `507${digits}` : digits; };
function quoteAgo(value) {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60000));
  if (minutes < 2) return 'hace un momento'; if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.round(minutes / 60); if (hours < 24) return `hace ${hours} h`;
  const days = Math.round(hours / 24); return days === 1 ? 'ayer' : `hace ${days} días`;
}
async function quoteCopy(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* sin permiso del portapapeles: se prueba el método antiguo */ }
  try {
    const area = document.createElement('textarea'); area.value = text; area.setAttribute('readonly', ''); area.style.position = 'fixed'; area.style.opacity = '0';
    document.body.append(area); area.select(); const ok = document.execCommand('copy'); area.remove(); return ok;
  } catch { return false; }
}

// ── El documento: lo mismo que ve Eileen en la vista previa y el cliente en su enlace ────────────────────────────────
function quoteDocumentMarkup(q) {
  const validity = q.expired
    ? `<span class="qt-chip warn">⌛ Venció el ${fechaCorta(q.validUntil)}</span>`
    : `<span class="qt-chip ok">✅ Vigente hasta el ${fechaCorta(q.validUntil)}${q.daysLeft >= 0 && q.daysLeft <= 30 ? ` · ${q.daysLeft === 0 ? 'vence hoy' : q.daysLeft === 1 ? 'queda 1 día' : `quedan ${q.daysLeft} días`}` : ''}</span>`;
  const rows = q.items.map(item => `<li class="qt-line"><div class="qt-line-main"><b>${escapeHtml(item.description)}</b>${item.detail ? `<small>${escapeHtml(item.detail)}</small>` : ''}</div><div class="qt-line-math"><span>${quoteQuantityText(item.quantity)} × ${money.format(item.unitAmount)}</span><strong>${money.format(item.amount)}</strong></div></li>`).join('');
  const discount = q.discount && q.discount.amount > 0
    ? `<div class="qt-total-row"><span>Subtotal</span><span>${money.format(q.subtotal)}</span></div><div class="qt-total-row discount"><span>Descuento${q.discount.kind === 'percent' ? ` (${quoteQuantityText(q.discount.value)} %)` : ''}</span><span>− ${money.format(q.discount.amount)}</span></div>` : '';
  const clauses = q.clauses.length
    ? `<section class="qt-section"><h3>Condiciones y avisos</h3><div class="qt-clauses">${q.clauses.map(clause => `<article class="qt-clause"><span class="qt-clause-icon" aria-hidden="true">${escapeHtml(clause.icon || '📌')}</span><div><b>${escapeHtml(clause.title)}</b><p>${escapeHtml(clause.body)}</p></div></article>`).join('')}</div></section>` : '';
  return `<article class="qt-doc">
    <header class="qt-hero"><div><p class="qt-eyebrow">COTIZACIÓN ${escapeHtml(q.code)}</p><h2>${escapeHtml(q.title)}</h2><p class="qt-for">Para <b>${escapeHtml(q.recipientName)}</b></p></div>${validity}</header>
    ${q.intro ? `<p class="qt-intro">${escapeHtml(q.intro).replace(/\n/g, '<br>')}</p>` : ''}
    <section class="qt-section"><h3>Lo que incluye</h3><ul class="qt-lines">${rows}</ul>
      <div class="qt-totals">${discount}<div class="qt-total-row total"><span>Total</span><strong>${money.format(q.total)}</strong></div></div></section>
    ${q.notes ? `<section class="qt-section"><h3>Notas</h3><p class="qt-notes">${escapeHtml(q.notes).replace(/\n/g, '<br>')}</p></section>` : ''}
    ${clauses}
    <footer class="qt-foot"><small>Documento informativo: no es una factura ni un contrato. Precios en dólares estadounidenses (USD). Emitida el ${fechaCorta(q.issuedOn)}.</small></footer>
  </article>`;
}

// Convierte la cotización del servidor en lo que pinta el documento.
const quoteForDocument = q => ({
  code: q.code, title: q.title, intro: q.intro, notes: q.notes, recipientName: q.recipient.name, issuedOn: q.issuedOn, validUntil: q.validUntil,
  daysLeft: q.daysLeft, expired: q.status === 'expired', items: q.items, discount: q.discount, subtotal: q.subtotal, total: q.total, clauses: q.clauses
});

// ── Lista ────────────────────────────────────────────────────────────────────────────────────────────────────────
async function loadQuotes() {
  const root = document.getElementById('quotes-root'); if (!root) return;
  if (!quotesState.loaded) root.innerHTML = '<p class="empty">Cargando tus cotizaciones…</p>';
  try {
    const params = new URLSearchParams(); if (quotesState.filter !== 'all') params.set('status', quotesState.filter); if (quotesState.query) params.set('q', quotesState.query);
    const result = await api(`/api/quotes${params.toString() ? `?${params}` : ''}`);
    quotesState.items = result.items; quotesState.counts = result.counts; quotesState.loaded = true; quotesState.error = '';
  } catch (error) { quotesState.error = error.message || 'No se pudieron cargar las cotizaciones.'; }
  if (!quotesState.editor) renderQuotesList();
}

function quoteCardMarkup(q) {
  const info = quoteStatusInfo[q.status] || quoteStatusInfo.draft;
  const validity = ['accepted', 'declined'].includes(q.status) ? '' : q.status === 'expired' ? `Venció el ${fechaCorta(q.validUntil)}` : `Válida hasta ${fechaCorta(q.validUntil)}${q.daysLeft <= 7 ? ` · ${q.daysLeft === 0 ? 'vence hoy' : q.daysLeft === 1 ? 'queda 1 día' : `quedan ${q.daysLeft} días`}` : ''}`;
  const seen = q.share.viewCount ? `<p class="qt-seen">👀 La abrió ${quoteAgo(q.share.viewedAt)}${q.share.viewCount > 1 ? ` · ${q.share.viewCount} veces` : ''}</p>` : q.share.active ? '<p class="qt-seen muted">🔗 Enlace compartido, aún sin abrir</p>' : '';
  return `<article class="qt-card ${q.status}" data-quote-card="${q.id}">
    <div class="qt-card-top"><span class="qt-code">${escapeHtml(q.code)}</span><span class="qt-status ${q.status}">${info.icon} ${info.label}</span></div>
    <div class="qt-card-body"><div><h3>${escapeHtml(q.recipient.name)}${q.recipient.isClient ? '' : ' <small class="qt-new">nuevo</small>'}</h3><p class="qt-title">${escapeHtml(q.title)}</p><p class="qt-valid">${validity}</p>${seen}</div><div class="qt-amount"><strong>${money.format(q.total)}</strong><small>${q.items.length} línea${q.items.length === 1 ? '' : 's'}</small></div></div>
    <div class="qt-card-actions"><button type="button" class="secondary" data-quote-open="${q.id}">Ver</button><button type="button" class="secondary" data-quote-share="${q.id}">🔗 Compartir</button><button type="button" class="secondary" data-quote-menu="${q.id}" aria-label="Más acciones">⋯</button></div>
  </article>`;
}

function renderQuotesList() {
  const root = document.getElementById('quotes-root'); if (!root) return;
  const counts = quotesState.counts || {};
  const tabs = quoteFilterTabs.map(([key, label]) => `<button type="button" class="qt-tab${quotesState.filter === key ? ' active' : ''}" data-quote-filter="${key}">${label}<span>${counts[key] ?? 0}</span></button>`).join('');
  const empty = !quotesState.items.length
    ? (quotesState.error ? `<p class="empty">${escapeHtml(quotesState.error)}</p>`
      : (counts.all ? '<div class="qt-empty"><span aria-hidden="true">🔍</span><h3>No hay cotizaciones así</h3><p>Prueba con otro filtro o con otra búsqueda.</p></div>'
        : '<div class="qt-empty"><span aria-hidden="true">🧾</span><h3>Aún no tienes cotizaciones</h3><p>Crea la primera en un par de minutos: eliges a quién, qué le ofreces y qué condiciones aplican. Después la compartes por WhatsApp, enlace o PDF.</p><button type="button" class="primary" data-quote-new>+ Crear mi primera cotización</button></div>'))
    : '';
  root.innerHTML = `<div class="qt-head"><div><p class="eyebrow">PROPUESTAS PARA TUS CLIENTES</p><h2>Mis propuestas</h2><p class="qt-sub">Informativas: no son facturas ni contratos. Cada una lleva las condiciones y avisos que tú elijas.</p></div>
      <div class="qt-head-actions"><button type="button" class="help-chip" data-help-topic="cotizaciones">ⓘ Ayuda</button><button type="button" class="secondary" data-quote-clauses>📋 Mis cláusulas</button><button type="button" class="primary" data-quote-new>+ Nueva cotización</button></div></div>
    <div class="qt-toolbar"><div class="qt-tabs" role="tablist">${tabs}</div><label class="qt-search"><span aria-hidden="true">🔍</span><input type="search" id="quote-search" placeholder="Buscar por nombre, título o número" value="${escapeHtml(quotesState.query)}" /></label></div>
    <div class="qt-grid">${quotesState.items.map(quoteCardMarkup).join('')}</div>${empty}`;
  bindQuotesList(root);
}

function bindQuotesList(root) {
  root.querySelectorAll('[data-quote-new]').forEach(button => button.onclick = () => openQuoteEditor(null));
  root.querySelector('[data-quote-clauses]')?.addEventListener('click', () => openQuoteClauseManager());
  root.querySelectorAll('[data-quote-filter]').forEach(button => button.onclick = () => { quotesState.filter = button.dataset.quoteFilter; loadQuotes(); });
  let timer = null;
  root.querySelector('#quote-search')?.addEventListener('input', event => { clearTimeout(timer); const value = event.target.value.trim(); timer = setTimeout(() => { quotesState.query = value; loadQuotes().then(() => document.getElementById('quote-search')?.focus()); }, 280); });
  root.querySelectorAll('[data-quote-open]').forEach(button => button.onclick = () => openQuotePreview(button.dataset.quoteOpen));
  root.querySelectorAll('[data-quote-card]').forEach(card => card.addEventListener('click', event => { if (!event.target.closest('button')) openQuotePreview(card.dataset.quoteCard); }));
  root.querySelectorAll('[data-quote-share]').forEach(button => button.onclick = () => openQuoteShare(button.dataset.quoteShare));
  root.querySelectorAll('[data-quote-menu]').forEach(button => button.onclick = () => openQuoteMenu(button.dataset.quoteMenu));
}

// ── Acciones sobre una cotización ────────────────────────────────────────────────────────────────────────────────
async function quoteAction(label, work) {
  try { const result = await work(); if (label) toast(label); await loadQuotes(); return result; } catch (error) { toast(error.message, true); return null; }
}

function openQuoteMenu(id) {
  const q = quotesState.items.find(item => item.id === id); if (!q) return;
  const box = document.createElement('div');
  const entries = [
    ['📄', 'Ver como la verá el cliente', 'open'], ['✏️', 'Editar', 'edit', ['accepted', 'declined'].includes(q.status)], ['⧉', 'Duplicar', 'duplicate'],
    q.status === 'accepted' || q.status === 'declined' ? ['↩️', 'Reabrir (volver a borrador)', 'draft'] : null,
    !['accepted'].includes(q.status) ? ['✅', 'Marcar como aceptada', 'accepted'] : null, !['declined'].includes(q.status) ? ['🚫', 'Marcar como “no continuó”', 'declined'] : null,
    !q.recipient.isClient ? ['🧑‍🤝‍🧑', 'Crear expediente con estos datos', 'client'] : null, ['🗑️', 'Eliminar', 'delete']
  ].filter(Boolean);
  box.innerHTML = `<p class="eyebrow">${escapeHtml(q.code)}</p><h2>${escapeHtml(q.recipient.name)}</h2><div class="qt-menu">${entries.map(([icon, text, action, disabled]) => `<button type="button" class="qt-menu-item${action === 'delete' ? ' danger' : ''}" data-quote-act="${action}"${disabled ? ' disabled' : ''}><span aria-hidden="true">${icon}</span>${text}</button>`).join('')}</div>`;
  openModal(box);
  box.querySelectorAll('[data-quote-act]').forEach(button => button.onclick = async () => {
    const action = button.dataset.quoteAct;
    if (action === 'open') return openQuotePreview(id);
    if (action === 'edit') return openQuoteEditor(id);
    modal.close();
    if (action === 'duplicate') { const copy = await quoteAction('Cotización duplicada', () => api(`/api/quotes/${id}/duplicate`, { method: 'POST', body: {} })); if (copy) openQuoteEditor(copy.id); return; }
    if (['draft', 'accepted', 'declined'].includes(action)) return void await quoteAction(action === 'accepted' ? '¡Qué bueno! Marcada como aceptada' : action === 'declined' ? 'Marcada como “no continuó”' : 'Vuelve a ser un borrador', () => api(`/api/quotes/${id}/status`, { method: 'POST', body: { status: action } }));
    if (action === 'client') return quoteCreateClient(q);
    if (action === 'delete' && confirm(`¿Eliminar la cotización ${q.code} de ${q.recipient.name}? Esto no se puede deshacer.`)) await quoteAction('Cotización eliminada', () => api(`/api/quotes/${id}`, { method: 'DELETE' }));
  });
}

// Abre el formulario de cliente nuevo con los datos de la persona ya puestos.
function quoteCreateClient(q) {
  newClient();
  const form = document.getElementById('client-form'); if (!form) return;
  if (form.elements.name) form.elements.name.value = q.recipient.name;
  if (form.elements.email && q.recipient.email) form.elements.email.value = q.recipient.email;
  if (form.elements.phone && q.recipient.phone) form.elements.phone.value = q.recipient.phone;
  toast('Datos de la cotización cargados: elige su plan y crea el expediente');
}

async function openQuotePreview(id) {
  let q; try { q = await api(`/api/quotes/${id}`); } catch (error) { toast(error.message, true); return; }
  const box = document.createElement('div'); box.className = 'qt-preview';
  const info = quoteStatusInfo[q.status] || quoteStatusInfo.draft;
  box.innerHTML = `<div class="qt-preview-bar"><span class="qt-status ${q.status}">${info.icon} ${info.label}</span><div class="qt-preview-actions"><button type="button" class="secondary" data-qp="edit"${['accepted', 'declined'].includes(q.status) ? ' disabled title="Reabre la cotización para editarla"' : ''}>✏️ Editar</button><button type="button" class="secondary" data-qp="pdf">📄 PDF</button><button type="button" class="primary" data-qp="share">🔗 Compartir</button></div></div>
    <p class="section-note">Así la verá ${escapeHtml(q.recipient.firstName || 'tu cliente')}.</p>${quoteDocumentMarkup(quoteForDocument(q))}`;
  openModal(box, true);
  box.querySelector('[data-qp="edit"]').onclick = () => openQuoteEditor(id);
  box.querySelector('[data-qp="share"]').onclick = () => openQuoteShare(id);
  box.querySelector('[data-qp="pdf"]').onclick = async event => {
    const button = event.currentTarget; button.disabled = true;
    try { downloadBlob(await protectedBlob(`/api/quotes/${id}/pdf`), `cotizacion-${q.code}.pdf`); } catch (error) { toast(error.message, true); } finally { button.disabled = false; }
  };
}

// Compartir: enlace, WhatsApp, PDF y correo. Crear el enlace marca la cotización como enviada.
async function openQuoteShare(id) {
  let q; try { q = await api(`/api/quotes/${id}/share`, { method: 'POST', body: {} }); } catch (error) { toast(error.message, true); return; }
  loadQuotes();
  const box = document.createElement('div');
  const first = q.recipient.firstName || 'hola'; const digits = quotePhoneDigits(q.recipient.phone);
  const message = `Hola ${q.recipient.firstName || ''}${q.recipient.firstName ? ',' : ''} te comparto tu cotización ${q.code} de Eileen Lifestyle: ${q.share.url}\nEs válida hasta el ${fechaCorta(q.validUntil)}. ¡Cualquier duda me avisas!`;
  const whatsapp = `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
  const mail = `mailto:${encodeURIComponent(q.recipient.email || '')}?subject=${encodeURIComponent(`Tu cotización ${q.code} · Eileen Lifestyle`)}&body=${encodeURIComponent(message)}`;
  box.innerHTML = `<p class="eyebrow">COMPARTIR · ${escapeHtml(q.code)}</p><h2>Enviar a ${escapeHtml(q.recipient.name)}</h2>
    <p class="section-note">Quien abra el enlace verá la cotización completa, sin necesidad de cuenta. ${q.status === 'sent' ? 'Quedó marcada como enviada.' : ''}</p>
    <label class="qt-linkbox"><span>Enlace de la cotización</span><div><input type="text" readonly value="${escapeHtml(q.share.url)}" id="quote-link" /><button type="button" class="secondary" id="quote-copy">Copiar</button></div></label>
    <div class="qt-share-grid">
      <a class="qt-share wa" href="${whatsapp}" target="_blank" rel="noopener" data-share="wa"><span aria-hidden="true">💬</span><b>WhatsApp</b><small>${digits ? 'Al número de la persona' : 'Elige el contacto'}</small></a>
      <button type="button" class="qt-share" data-share="pdf"><span aria-hidden="true">📄</span><b>Descargar PDF</b><small>Para imprimir o adjuntar</small></button>
      <a class="qt-share" href="${mail}" data-share="mail"><span aria-hidden="true">✉️</span><b>Correo</b><small>${q.recipient.email ? escapeHtml(q.recipient.email) : 'Sin correo registrado'}</small></a>
    </div>
    <p class="qt-seen ${q.share.viewCount ? '' : 'muted'}">${q.share.viewCount ? `👀 La abrió ${quoteAgo(q.share.viewedAt)}${q.share.viewCount > 1 ? ` · ${q.share.viewCount} veces` : ''}` : '🔗 Todavía no la han abierto. Te avisaré en las notificaciones cuando lo hagan.'}</p>
    <div class="form-row"><button type="button" class="secondary danger" id="quote-unshare">Retirar el enlace</button><button type="button" class="primary" id="quote-done">Listo</button></div>`;
  openModal(box);
  box.querySelector('#quote-copy').onclick = async event => { const ok = await quoteCopy(q.share.url); event.currentTarget.textContent = ok ? '¡Copiado!' : 'Cópialo a mano'; if (!ok) box.querySelector('#quote-link').select(); };
  box.querySelector('#quote-link').onfocus = event => event.target.select();
  box.querySelector('[data-share="pdf"]').onclick = async () => { try { downloadBlob(await protectedBlob(`/api/quotes/${id}/pdf`), `cotizacion-${q.code}.pdf`); } catch (error) { toast(error.message, true); } };
  box.querySelector('#quote-done').onclick = () => { modal.close(); loadQuotes(); };
  box.querySelector('#quote-unshare').onclick = async () => {
    if (!confirm('¿Retirar el enlace? Quien lo tenga ya no podrá abrir la cotización. Podrás crear uno nuevo cuando quieras.')) return;
    await quoteAction('Enlace retirado', () => api(`/api/quotes/${id}/share`, { method: 'DELETE' })); modal.close();
  };
}

// ── Editor ───────────────────────────────────────────────────────────────────────────────────────────────────────
function quoteBlankEditor(preset = {}) {
  const issuedOn = dateKey(today);
  return {
    id: null, mode: preset.clientId ? 'client' : 'client', clientId: preset.clientId || '', prospect: { name: '', email: '', phone: '' }, title: 'Propuesta de entrenamiento', intro: '', introTouched: false, notes: '',
    issuedOn, validUntil: quoteAddDays(issuedOn, 15), validDays: 15, items: [], discountKind: 'none', discountValue: 0, selected: new Set(), custom: []
  };
}

function quoteEditorFromQuote(q) {
  const library = new Map(quotesState.clauses.map(clause => [clause.id, clause])); const editor = quoteBlankEditor();
  Object.assign(editor, {
    id: q.id, mode: q.recipient.isClient ? 'client' : 'prospect', clientId: q.recipient.clientId || '', prospect: { name: q.recipient.isClient ? '' : q.recipient.name, email: q.recipient.isClient ? '' : q.recipient.email || '', phone: q.recipient.isClient ? '' : q.recipient.phone || '' },
    title: q.title, intro: q.intro || '', introTouched: true, notes: q.notes || '', issuedOn: q.issuedOn, validUntil: q.validUntil, validDays: 0,
    items: q.items.map(item => ({ description: item.description, detail: item.detail || '', quantity: item.quantity, unitAmount: item.unitAmount, planId: item.planId || null })),
    discountKind: q.discount.kind, discountValue: q.discount.value
  });
  for (const clause of q.clauses) { if (clause.id && library.has(clause.id)) editor.selected.add(clause.id); else editor.custom.push({ title: clause.title, body: clause.body, icon: clause.icon || '✏️' }); }
  return editor;
}

function quotePlanDetail(plan) {
  if (plan.serviceType === 'rutinas') return `${plan.routinesPerMonth || ''} rutinas al mes`.trim();
  if (plan.billingModel === 'package') return `${plan.sessionsIncluded} clases${plan.validityDays ? ` · vigencia ${plan.validityDays} días` : ''}`;
  if (plan.billingModel === 'monthly') return plan.sessionsIncluded ? `${plan.sessionsIncluded} clases al mes` : 'Mensualidad';
  return 'Clase individual';
}

const quoteEditorContext = editor => {
  const name = editor.mode === 'client' ? (data.clients.find(client => client.id === editor.clientId)?.name || '') : editor.prospect.name;
  return { name, firstName: quoteFirstName(name), valid: fechaCorta(editor.validUntil), total: money.format(quoteTotals(editor.items, editor.discountKind, editor.discountValue).total), issued: fechaCorta(editor.issuedOn), code: 'COT-••••' };
};

function quoteEditorDraftForDocument(editor) {
  const totals = quoteTotals(editor.items, editor.discountKind, editor.discountValue); const context = quoteEditorContext(editor);
  const chosen = [...quotesState.clauses.filter(clause => editor.selected.has(clause.id)), ...editor.custom];
  return {
    code: 'COT-••••', title: editor.title || 'Propuesta de entrenamiento', intro: editor.intro, notes: editor.notes, recipientName: context.name || 'tu cliente', issuedOn: editor.issuedOn, validUntil: editor.validUntil,
    daysLeft: quoteDaysLeft(editor.validUntil), expired: quoteDaysLeft(editor.validUntil) < 0,
    items: editor.items.map(item => ({ description: item.description || 'Concepto', detail: item.detail, quantity: Number(item.quantity) || 0, unitAmount: Number(item.unitAmount) || 0, amount: quoteLineAmount(item) })),
    discount: { kind: editor.discountKind, value: Number(editor.discountValue) || 0, amount: totals.discount }, subtotal: totals.subtotal, total: totals.total,
    clauses: chosen.map(clause => ({ icon: clause.icon, title: clause.title, body: quoteClauseText(clause.body, context) }))
  };
}

const quoteDefaultIntro = name => `Hola${quoteFirstName(name) ? ` ${quoteFirstName(name)}` : ''}, gracias por tu interés en entrenar conmigo. Aquí tienes mi propuesta, pensada para ti. Si quieres ajustar algo, me dices y lo vemos.`;

async function openQuoteEditor(idOrNull, preset = {}) {
  try {
    if (!quotesState.clauses.length) quotesState.clauses = (await api('/api/quote-clauses')).filter(clause => clause.active);
    else quotesState.clauses = (await api('/api/quote-clauses')).filter(clause => clause.active);
  } catch (error) { toast(error.message, true); return; }
  let editor;
  if (idOrNull) { try { editor = quoteEditorFromQuote(await api(`/api/quotes/${idOrNull}`)); } catch (error) { toast(error.message, true); return; } }
  else { editor = quoteBlankEditor(preset); quotesState.clauses.filter(clause => clause.defaultOn).forEach(clause => editor.selected.add(clause.id)); }
  quotesState.editor = editor;
  if (modal.open) modal.close();
  navigate('quotes');
  renderQuoteEditor();
}

function closeQuoteEditor() { quotesState.editor = null; renderQuotesList(); loadQuotes(); window.scrollTo(0, 0); }

function quoteSectionHead(number, title, hint) { return `<header class="qt-step-head"><span class="qt-step-num">${number}</span><div><h3>${title}</h3><p>${hint}</p></div></header>`; }

function renderQuoteEditor() {
  const root = document.getElementById('quotes-root'); const editor = quotesState.editor; if (!root || !editor) return;
  const clients = (data.clients || []).slice().sort((a, b) => a.name.localeCompare(b.name, 'es'));
  const plans = (data.plans || []).filter(plan => plan.active && plan.price >= 0);
  const validityChips = [7, 15, 30].map(days => `<button type="button" class="qt-pill${editor.validDays === days ? ' active' : ''}" data-valid-days="${days}">${days} días</button>`).join('');
  root.innerHTML = `<div class="qt-editor">
    <div class="qt-editor-top"><button type="button" class="secondary" id="qe-back">← Volver</button><div><p class="eyebrow">${editor.id ? 'EDITANDO COTIZACIÓN' : 'NUEVA COTIZACIÓN'}</p><h2>${editor.id ? 'Editar propuesta' : 'Armemos una propuesta'}</h2></div></div>
    <section class="qt-step card">${quoteSectionHead(1, '¿Para quién es?', 'Elige a un cliente o escribe los datos de alguien que aún no lo es.')}
      <div class="qt-segment" role="tablist"><button type="button" class="${editor.mode === 'client' ? 'active' : ''}" data-qe-mode="client">👤 Un cliente</button><button type="button" class="${editor.mode === 'prospect' ? 'active' : ''}" data-qe-mode="prospect">✨ Alguien nuevo</button></div>
      ${editor.mode === 'client'
        ? `<label><span class="qt-lab">Cliente</span><select id="qe-client"><option value="">Elige un cliente…</option>${clients.map(client => `<option value="${client.id}"${client.id === editor.clientId ? ' selected' : ''}>${escapeHtml(client.name)}</option>`).join('')}</select></label>`
        : `<div class="form-row"><label>Nombre<input id="qe-pname" value="${escapeHtml(editor.prospect.name)}" placeholder="Ej. Luis Prospecto" maxlength="120" /></label><label>Teléfono / WhatsApp<input id="qe-pphone" type="tel" value="${escapeHtml(editor.prospect.phone)}" placeholder="+507 6000-0000" /></label></div><label><span class="qt-lab">Correo <em>(opcional)</em></span><input id="qe-pemail" type="email" value="${escapeHtml(editor.prospect.email)}" placeholder="persona@correo.com" /></label>`}
      <label>Título de la propuesta<input id="qe-title" value="${escapeHtml(editor.title)}" maxlength="140" /></label>
      <div class="qt-valid"><span>Válida por</span>${validityChips}<label class="qt-date">o hasta<input type="date" id="qe-valid" value="${editor.validUntil}" min="${editor.issuedOn}" /></label></div>
    </section>
    <section class="qt-step card">${quoteSectionHead(2, '¿Qué le ofreces?', 'Toca una de tus tarifas para agregarla, o escribe una línea libre.')}
      ${plans.length ? `<div class="qt-plan-chips" aria-label="Mis tarifas">${plans.map(plan => `<button type="button" class="qt-plan-chip" data-qe-plan="${plan.id}"><b>${escapeHtml(plan.name)}</b><span>${money.format(plan.price)}</span></button>`).join('')}</div>` : ''}
      <div id="qe-lines"></div>
      <button type="button" class="secondary wide-button" id="qe-add-line">+ Agregar línea libre</button>
      <div id="qe-discount"></div><div id="qe-totals"></div>
    </section>
    <section class="qt-step card">${quoteSectionHead(3, 'Condiciones y avisos', 'Marca las que quieres que vea tu cliente. Son informativas; las editas en “Mis cláusulas”.')}
      <div class="qt-clause-tools"><button type="button" class="qt-pill" id="qe-clauses-all">Marcar todas</button><button type="button" class="qt-pill" id="qe-clauses-none">Quitar todas</button><button type="button" class="qt-pill" id="qe-clauses-manage">📋 Administrar mis cláusulas</button><span class="qt-count" id="qe-clause-count"></span></div>
      <div id="qe-clauses" class="qt-pick-grid"></div><div id="qe-custom"></div>
      <button type="button" class="secondary wide-button" id="qe-add-custom">✏️ Escribir una cláusula solo para esta cotización</button>
    </section>
    <section class="qt-step card">${quoteSectionHead(4, 'Tu mensaje', 'Un saludo cálido y, si quieres, una nota final. Es lo primero que lee tu cliente.')}
      <label>Saludo<textarea id="qe-intro" rows="3" maxlength="1500" placeholder="Hola…">${escapeHtml(editor.intro)}</textarea></label>
      <label><span class="qt-lab">Notas finales <em>(opcional)</em></span><textarea id="qe-notes" rows="2" maxlength="1500" placeholder="Ej. Podemos empezar cuando te quede bien.">${escapeHtml(editor.notes)}</textarea></label>
    </section>
    <div class="qt-sticky"><div class="qt-sticky-total"><small id="qe-sticky-meta">—</small><strong id="qe-sticky-total">$0.00</strong></div><div class="qt-sticky-actions"><button type="button" class="secondary" id="qe-preview">👁 Vista previa</button><button type="button" class="secondary" id="qe-save">Guardar</button><button type="button" class="primary" id="qe-share">Guardar y compartir</button></div></div>
  </div>`;
  bindQuoteEditor(root, editor);
  renderQuoteLines(); renderQuoteDiscount(); renderQuoteTotals(); renderQuoteClausePicker(); renderQuoteCustom();
  if (!editor.introTouched && !editor.intro) { editor.intro = quoteDefaultIntro(quoteEditorContext(editor).name); root.querySelector('#qe-intro').value = editor.intro; }
  window.scrollTo(0, 0);
}

function bindQuoteEditor(root, editor) {
  root.querySelector('#qe-back').onclick = () => { if (!editor.items.length && !editor.id || confirm('¿Salir sin guardar los cambios?')) closeQuoteEditor(); };
  root.querySelectorAll('[data-qe-mode]').forEach(button => button.onclick = () => { editor.mode = button.dataset.qeMode; captureQuoteEditor(root, editor); renderQuoteEditor(); });
  root.querySelector('#qe-client')?.addEventListener('change', event => { editor.clientId = event.target.value; refreshQuoteIntro(root, editor); renderQuoteClausePicker(); });
  root.querySelector('#qe-pname')?.addEventListener('input', event => { editor.prospect.name = event.target.value; refreshQuoteIntro(root, editor); });
  root.querySelector('#qe-pphone')?.addEventListener('input', event => { editor.prospect.phone = event.target.value; });
  root.querySelector('#qe-pemail')?.addEventListener('input', event => { editor.prospect.email = event.target.value; });
  root.querySelector('#qe-title').addEventListener('input', event => { editor.title = event.target.value; });
  root.querySelectorAll('[data-valid-days]').forEach(button => button.onclick = () => { editor.validDays = Number(button.dataset.validDays); editor.validUntil = quoteAddDays(editor.issuedOn, editor.validDays); root.querySelector('#qe-valid').value = editor.validUntil; root.querySelectorAll('[data-valid-days]').forEach(item => item.classList.toggle('active', item === button)); renderQuoteClausePicker(); });
  root.querySelector('#qe-valid').addEventListener('change', event => { if (event.target.value) { editor.validUntil = event.target.value; editor.validDays = 0; root.querySelectorAll('[data-valid-days]').forEach(item => item.classList.remove('active')); renderQuoteClausePicker(); } });
  root.querySelectorAll('[data-qe-plan]').forEach(button => button.onclick = () => {
    const plan = data.plans.find(item => item.id === button.dataset.qePlan); if (!plan) return;
    editor.items.push({ description: plan.name, detail: plan.description || quotePlanDetail(plan), quantity: 1, unitAmount: plan.price, planId: plan.id });
    renderQuoteLines(); renderQuoteTotals(); toast(`Agregada: ${plan.name}`);
  });
  root.querySelector('#qe-add-line').onclick = () => { editor.items.push({ description: '', detail: '', quantity: 1, unitAmount: 0, planId: null }); renderQuoteLines(); renderQuoteTotals(); root.querySelector('#qe-lines .qt-edit-line:last-child input')?.focus(); };
  root.querySelector('#qe-clauses-all').onclick = () => { quotesState.clauses.forEach(clause => editor.selected.add(clause.id)); renderQuoteClausePicker(); };
  root.querySelector('#qe-clauses-none').onclick = () => { editor.selected.clear(); renderQuoteClausePicker(); };
  root.querySelector('#qe-clauses-manage').onclick = () => { captureQuoteEditor(root, editor); openQuoteClauseManager(); };
  root.querySelector('#qe-add-custom').onclick = () => quoteCustomClauseDialog(root, editor);
  root.querySelector('#qe-intro').addEventListener('input', event => { editor.intro = event.target.value; editor.introTouched = true; });
  root.querySelector('#qe-notes').addEventListener('input', event => { editor.notes = event.target.value; });
  root.querySelector('#qe-preview').onclick = () => { captureQuoteEditor(root, editor); const box = document.createElement('div'); box.className = 'qt-preview'; box.innerHTML = `<p class="section-note">Vista previa: así la verá ${escapeHtml(quoteEditorContext(editor).firstName || 'tu cliente')}. El número se asigna al guardar.</p>${quoteDocumentMarkup(quoteEditorDraftForDocument(editor))}<div class="form-row"><button type="button" class="primary" id="qe-preview-close">Seguir editando</button></div>`; openModal(box, true); box.querySelector('#qe-preview-close').onclick = () => modal.close(); };
  root.querySelector('#qe-save').onclick = () => saveQuoteEditor(root, editor, false);
  root.querySelector('#qe-share').onclick = () => saveQuoteEditor(root, editor, true);
}

// Si el saludo no se ha tocado, sigue al nombre de la persona.
function refreshQuoteIntro(root, editor) {
  if (editor.introTouched) return;
  editor.intro = quoteDefaultIntro(quoteEditorContext(editor).name); const area = root.querySelector('#qe-intro'); if (area) area.value = editor.intro;
}

function captureQuoteEditor(root, editor) {
  const read = (selector, fallback) => { const element = root.querySelector(selector); return element ? element.value : fallback; };
  editor.title = read('#qe-title', editor.title); editor.intro = read('#qe-intro', editor.intro); editor.notes = read('#qe-notes', editor.notes);
  if (editor.mode === 'client') editor.clientId = read('#qe-client', editor.clientId);
  else editor.prospect = { name: read('#qe-pname', editor.prospect.name), phone: read('#qe-pphone', editor.prospect.phone), email: read('#qe-pemail', editor.prospect.email) };
}

function renderQuoteLines() {
  const editor = quotesState.editor; const target = document.getElementById('qe-lines'); if (!editor || !target) return;
  target.innerHTML = editor.items.length ? editor.items.map((item, index) => `<div class="qt-edit-line" data-line="${index}">
      <div class="qt-edit-main"><label>Concepto<input data-f="description" value="${escapeHtml(item.description)}" placeholder="Ej. Mensualidad 8 clases" maxlength="200" /></label><label><span class="qt-lab">Detalle <em>(opcional)</em></span><input data-f="detail" value="${escapeHtml(item.detail || '')}" placeholder="Ej. Dos clases por semana" maxlength="400" /></label></div>
      <div class="qt-edit-math"><label>Cant.<div class="qt-stepper"><button type="button" data-step="-1" aria-label="Menos">−</button><input data-f="quantity" type="number" min="0.01" step="any" inputmode="decimal" value="${item.quantity}" /><button type="button" data-step="1" aria-label="Más">+</button></div></label><label>Precio (USD)<input data-f="unitAmount" type="number" min="0" step="0.01" inputmode="decimal" value="${item.unitAmount}" /></label><div class="qt-edit-amount"><small>Importe</small><b data-amount>${money.format(quoteLineAmount(item))}</b></div></div>
      <div class="qt-edit-tools"><button type="button" class="qt-link" data-dup>⧉ Duplicar</button><button type="button" class="qt-link danger" data-del>🗑 Quitar</button></div></div>`).join('') : '<p class="qt-hint">Todavía no hay líneas. Toca una de tus tarifas de arriba o agrega una línea libre.</p>';
  target.querySelectorAll('.qt-edit-line').forEach(row => {
    const index = Number(row.dataset.line); const item = editor.items[index];
    row.querySelectorAll('[data-f]').forEach(input => input.addEventListener('input', () => {
      const field = input.dataset.f; item[field] = ['quantity', 'unitAmount'].includes(field) ? (input.value === '' ? 0 : Number(input.value)) : input.value;
      row.querySelector('[data-amount]').textContent = money.format(quoteLineAmount(item)); renderQuoteTotals(); renderQuoteClausePicker();
    }));
    row.querySelectorAll('[data-step]').forEach(button => button.onclick = () => { item.quantity = Math.max(1, Math.round((Number(item.quantity) || 0) + Number(button.dataset.step))); renderQuoteLines(); renderQuoteTotals(); });
    row.querySelector('[data-dup]').onclick = () => { editor.items.splice(index + 1, 0, { ...item }); renderQuoteLines(); renderQuoteTotals(); };
    row.querySelector('[data-del]').onclick = () => { editor.items.splice(index, 1); renderQuoteLines(); renderQuoteTotals(); };
  });
}

function renderQuoteDiscount() {
  const editor = quotesState.editor; const target = document.getElementById('qe-discount'); if (!editor || !target) return;
  if (editor.discountKind === 'none') { target.innerHTML = '<button type="button" class="qt-link" id="qe-discount-add">🏷️ Agregar un descuento</button>'; target.querySelector('#qe-discount-add').onclick = () => { editor.discountKind = 'percent'; editor.discountValue = 10; renderQuoteDiscount(); renderQuoteTotals(); }; return; }
  target.innerHTML = `<div class="qt-discount"><div class="qt-segment small"><button type="button" class="${editor.discountKind === 'percent' ? 'active' : ''}" data-dk="percent">%</button><button type="button" class="${editor.discountKind === 'amount' ? 'active' : ''}" data-dk="amount">$</button></div><label>Descuento<input type="number" min="0" step="0.01" inputmode="decimal" id="qe-dvalue" value="${editor.discountValue}" /></label><button type="button" class="qt-link danger" id="qe-discount-del">Quitar</button></div>`;
  target.querySelectorAll('[data-dk]').forEach(button => button.onclick = () => { editor.discountKind = button.dataset.dk; renderQuoteDiscount(); renderQuoteTotals(); });
  target.querySelector('#qe-dvalue').addEventListener('input', event => { editor.discountValue = event.target.value === '' ? 0 : Number(event.target.value); renderQuoteTotals(); });
  target.querySelector('#qe-discount-del').onclick = () => { editor.discountKind = 'none'; editor.discountValue = 0; renderQuoteDiscount(); renderQuoteTotals(); };
}

function renderQuoteTotals() {
  const editor = quotesState.editor; if (!editor) return; const totals = quoteTotals(editor.items, editor.discountKind, editor.discountValue);
  const target = document.getElementById('qe-totals');
  if (target) target.innerHTML = `<div class="qt-totals editor"><div class="qt-total-row"><span>Subtotal</span><span>${money.format(totals.subtotal)}</span></div>${totals.discount > 0 ? `<div class="qt-total-row discount"><span>Descuento${editor.discountKind === 'percent' ? ` (${quoteQuantityText(editor.discountValue)} %)` : ''}</span><span>− ${money.format(totals.discount)}</span></div>` : ''}<div class="qt-total-row total"><span>Total</span><strong>${money.format(totals.total)}</strong></div></div>`;
  const total = document.getElementById('qe-sticky-total'); if (total) total.textContent = money.format(totals.total);
  const meta = document.getElementById('qe-sticky-meta'); if (meta) meta.textContent = `${editor.items.length} línea${editor.items.length === 1 ? '' : 's'} · ${editor.selected.size + editor.custom.length} cláusula${editor.selected.size + editor.custom.length === 1 ? '' : 's'}`;
}

function renderQuoteClausePicker() {
  const editor = quotesState.editor; const target = document.getElementById('qe-clauses'); if (!editor || !target) return;
  const context = quoteEditorContext(editor);
  target.innerHTML = quotesState.clauses.map(clause => `<label class="qt-pick${editor.selected.has(clause.id) ? ' on' : ''}"><input type="checkbox" data-clause="${clause.id}"${editor.selected.has(clause.id) ? ' checked' : ''} /><span class="qt-pick-icon" aria-hidden="true">${escapeHtml(clause.icon)}</span><span class="qt-pick-body"><b>${escapeHtml(clause.title)}</b><small>${escapeHtml(quoteClauseText(clause.body, context))}</small></span><span class="qt-pick-check" aria-hidden="true">✓</span></label>`).join('') || '<p class="qt-hint">Aún no tienes cláusulas. Crea la primera en “Administrar mis cláusulas”.</p>';
  target.querySelectorAll('[data-clause]').forEach(input => input.addEventListener('change', () => { if (input.checked) editor.selected.add(input.dataset.clause); else editor.selected.delete(input.dataset.clause); input.closest('.qt-pick').classList.toggle('on', input.checked); renderQuoteTotals(); updateQuoteClauseCount(); }));
  updateQuoteClauseCount(); renderQuoteTotals();
}
function updateQuoteClauseCount() { const editor = quotesState.editor; const label = document.getElementById('qe-clause-count'); if (editor && label) { const n = editor.selected.size + editor.custom.length; label.textContent = `${n} seleccionada${n === 1 ? '' : 's'}`; } }

function renderQuoteCustom() {
  const editor = quotesState.editor; const target = document.getElementById('qe-custom'); if (!editor || !target) return;
  target.innerHTML = editor.custom.map((clause, index) => `<div class="qt-pick on custom"><span class="qt-pick-icon" aria-hidden="true">${escapeHtml(clause.icon || '✏️')}</span><span class="qt-pick-body"><b>${escapeHtml(clause.title)} <small class="qt-new">solo aquí</small></b><small>${escapeHtml(clause.body)}</small></span><button type="button" class="qt-link danger" data-custom-del="${index}">Quitar</button></div>`).join('');
  target.querySelectorAll('[data-custom-del]').forEach(button => button.onclick = () => { editor.custom.splice(Number(button.dataset.customDel), 1); renderQuoteCustom(); updateQuoteClauseCount(); renderQuoteTotals(); });
  updateQuoteClauseCount();
}

function quoteCustomClauseDialog(root, editor) {
  captureQuoteEditor(root, editor);
  const box = document.createElement('div');
  box.innerHTML = `<form id="qe-custom-form"><p class="eyebrow">SOLO PARA ESTA COTIZACIÓN</p><h2>Escribir una cláusula</h2><label>Título<input name="title" required maxlength="120" placeholder="Ej. Clase de prueba gratis" /></label><label>Texto<textarea name="body" rows="4" required maxlength="2000" placeholder="Escribe la condición o el aviso…"></textarea></label><p class="section-note">Puedes usar ${quoteVariableHelp.map(([key, hint]) => `<code>${key}</code> (${hint})`).join(', ')}.</p><div class="form-row"><button type="button" class="secondary" id="qe-custom-cancel">Cancelar</button><button class="primary">Agregar</button></div></form>`;
  openModal(box);
  box.querySelector('#qe-custom-cancel').onclick = () => { modal.close(); };
  box.querySelector('form').onsubmit = event => { event.preventDefault(); const values = new FormData(event.target); editor.custom.push({ title: String(values.get('title')).trim(), body: String(values.get('body')).trim(), icon: '✏️' }); modal.close(); renderQuoteEditor(); };
}

async function saveQuoteEditor(root, editor, thenShare) {
  captureQuoteEditor(root, editor);
  const problem = quoteEditorProblem(editor); if (problem) { toast(problem, true); return; }
  const body = {
    ...(editor.mode === 'client' ? { clientId: editor.clientId } : { prospect: { name: editor.prospect.name.trim(), email: editor.prospect.email.trim() || null, phone: editor.prospect.phone.trim() || null } }),
    title: editor.title.trim() || 'Propuesta de entrenamiento', intro: editor.intro.trim() || null, notes: editor.notes.trim() || null, issuedOn: editor.issuedOn, validUntil: editor.validUntil,
    items: editor.items.map(item => ({ description: item.description.trim(), detail: String(item.detail || '').trim() || null, quantity: Number(item.quantity), unitAmount: Number(item.unitAmount), planId: item.planId || null })),
    discount: { kind: editor.discountKind, value: Number(editor.discountValue) || 0 },
    clauses: [...quotesState.clauses.filter(clause => editor.selected.has(clause.id)).map(clause => ({ clauseId: clause.id })), ...editor.custom.map(clause => ({ title: clause.title, body: clause.body, icon: clause.icon }))]
  };
  const buttons = root.querySelectorAll('.qt-sticky button'); buttons.forEach(button => { button.disabled = true; });
  try {
    const saved = await api(editor.id ? `/api/quotes/${editor.id}` : '/api/quotes', { method: editor.id ? 'PATCH' : 'POST', body });
    editor.id = saved.id; toast(editor.id ? `Cotización ${saved.code} guardada` : 'Guardada');
    quotesState.editor = null; await loadQuotes(); renderQuotesList();
    if (thenShare) openQuoteShare(saved.id);
  } catch (error) { toast(error.message, true); buttons.forEach(button => { button.disabled = false; }); }
}

function quoteEditorProblem(editor) {
  if (editor.mode === 'client' && !editor.clientId) return 'Elige a quién va dirigida la cotización';
  if (editor.mode === 'prospect' && !editor.prospect.name.trim()) return 'Escribe el nombre de la persona';
  if (!editor.items.length) return 'Agrega al menos una línea a la cotización';
  const sinConcepto = editor.items.findIndex(item => !item.description.trim()); if (sinConcepto >= 0) return `La línea ${sinConcepto + 1} necesita un concepto`;
  if (editor.items.some(item => !(Number(item.quantity) > 0))) return 'Revisa las cantidades: deben ser mayores que cero';
  if (editor.items.some(item => Number(item.unitAmount) < 0 || Number.isNaN(Number(item.unitAmount)))) return 'Revisa los precios';
  if (editor.discountKind === 'percent' && Number(editor.discountValue) > 100) return 'El descuento no puede pasar de 100 %';
  if (editor.validUntil < editor.issuedOn) return 'La vigencia no puede ser anterior a hoy';
  return '';
}

// ── Mis cláusulas ────────────────────────────────────────────────────────────────────────────────────────────────
async function openQuoteClauseManager() {
  let clauses; try { clauses = await api('/api/quote-clauses'); } catch (error) { toast(error.message, true); return; }
  quotesState.clauses = clauses.filter(clause => clause.active);
  const box = document.createElement('div'); box.className = 'qt-clause-manager';
  const groups = Object.entries(quoteClauseCategories).map(([key, label]) => [key, label, clauses.filter(clause => clause.category === key)]).filter(group => group[2].length);
  box.innerHTML = `<p class="eyebrow">COTIZADOR</p><h2>Mis cláusulas</h2><p class="section-note">Son los avisos y condiciones que puedes poner en tus cotizaciones. Los textos de ejemplo son un punto de partida: cámbialos a tu manera y revísalos con tu asesor legal si lo necesitas. Editar una cláusula no cambia las cotizaciones que ya enviaste. Las palabras entre llaves, como <code>{{vigencia}}</code>, se llenan solas con los datos de cada cotización.</p>
    <div class="qt-manager-actions"><button type="button" class="primary" id="qc-new">+ Nueva cláusula</button><button type="button" class="secondary" id="qc-restore">Restaurar ejemplos que falten</button></div>
    ${groups.map(([key, label, list]) => `<h3 class="qt-group">${label}</h3>${list.map(clause => `<article class="qt-clause-row${clause.active ? '' : ' off'}"><span class="qt-pick-icon" aria-hidden="true">${escapeHtml(clause.icon)}</span><div class="qt-pick-body"><b>${escapeHtml(clause.title)}${clause.defaultOn ? ' <small class="qt-new">viene marcada</small>' : ''}${clause.active ? '' : ' <small class="qt-new off">oculta</small>'}</b><small>${escapeHtml(clause.body)}</small></div><div class="qt-row-actions"><button type="button" class="qt-link" data-qc-edit="${clause.id}">Editar</button><button type="button" class="qt-link danger" data-qc-del="${clause.id}">Eliminar</button></div></article>`).join('')}`).join('')}
    <div class="form-row"><button type="button" class="primary" id="qc-close">Listo</button></div>`;
  openModal(box, true);
  box.querySelector('#qc-close').onclick = () => { modal.close(); if (quotesState.editor) renderQuoteEditor(); };
  box.querySelector('#qc-new').onclick = () => openQuoteClauseForm(null);
  box.querySelector('#qc-restore').onclick = async () => { try { const result = await api('/api/quote-clauses/restore-defaults', { method: 'POST', body: {} }); toast(result.restored ? `Se restauraron ${result.restored}` : 'No faltaba ninguna'); openQuoteClauseManager(); } catch (error) { toast(error.message, true); } };
  box.querySelectorAll('[data-qc-edit]').forEach(button => button.onclick = () => openQuoteClauseForm(clauses.find(clause => clause.id === button.dataset.qcEdit)));
  box.querySelectorAll('[data-qc-del]').forEach(button => button.onclick = async () => {
    const clause = clauses.find(item => item.id === button.dataset.qcDel);
    if (!confirm(`¿Eliminar la cláusula “${clause.title}”? Las cotizaciones ya creadas conservan su texto.`)) return;
    try { await api(`/api/quote-clauses/${clause.id}`, { method: 'DELETE' }); toast('Cláusula eliminada'); openQuoteClauseManager(); } catch (error) { toast(error.message, true); }
  });
}

function openQuoteClauseForm(clause) {
  const box = document.createElement('div'); const current = clause || { title: '', body: '', category: 'general', icon: '📌', defaultOn: false, active: true };
  box.innerHTML = `<form id="qc-form"><p class="eyebrow">MIS CLÁUSULAS</p><h2>${clause ? 'Editar cláusula' : 'Nueva cláusula'}</h2>
    <label>Título<input name="title" required maxlength="120" value="${escapeHtml(current.title)}" placeholder="Ej. Política de lluvia" /></label>
    <label>Texto<textarea name="body" id="qc-body" rows="5" required maxlength="2000" placeholder="Escribe la condición o el aviso…">${escapeHtml(current.body)}</textarea></label>
    <div class="qt-vars" aria-label="Variables"><small>Insertar:</small>${quoteVariableHelp.map(([key, hint]) => `<button type="button" class="qt-pill" data-var="${key}" title="${hint}">${key}</button>`).join('')}</div>
    <div class="form-row"><label>Tipo<select name="category">${Object.entries(quoteClauseCategories).map(([key, label]) => `<option value="${key}"${current.category === key ? ' selected' : ''}>${label}</option>`).join('')}</select></label><label>Icono<input type="hidden" name="icon" value="${escapeHtml(current.icon)}" /><div class="qt-emojis" id="qc-emojis">${quoteEmojiChoices.map(emoji => `<button type="button" class="${emoji === current.icon ? 'active' : ''}" data-emoji="${emoji}">${emoji}</button>`).join('')}</div></label></div>
    <label class="checkbox-line"><input type="checkbox" name="defaultOn"${current.defaultOn ? ' checked' : ''} /> Que venga marcada en cada cotización nueva</label>
    <label class="checkbox-line"><input type="checkbox" name="active"${current.active ? ' checked' : ''} /> Disponible para usar (si la desmarcas, queda oculta)</label>
    <div class="form-row"><button type="button" class="secondary" id="qc-cancel">Cancelar</button><button class="primary">Guardar</button></div></form>`;
  openModal(box);
  box.querySelectorAll('[data-var]').forEach(button => button.onclick = () => { const area = box.querySelector('#qc-body'); const start = area.selectionStart ?? area.value.length; area.setRangeText(button.dataset.var, start, area.selectionEnd ?? start, 'end'); area.focus(); });
  box.querySelectorAll('[data-emoji]').forEach(button => button.onclick = () => { box.querySelector('[name="icon"]').value = button.dataset.emoji; box.querySelectorAll('[data-emoji]').forEach(item => item.classList.toggle('active', item === button)); });
  box.querySelector('#qc-cancel').onclick = () => openQuoteClauseManager();
  box.querySelector('form').onsubmit = async event => {
    event.preventDefault(); const values = new FormData(event.target); const body = { title: String(values.get('title')).trim(), body: String(values.get('body')).trim(), category: values.get('category'), icon: values.get('icon') || '📌', defaultOn: values.get('defaultOn') === 'on', active: values.get('active') === 'on' };
    try { await api(clause ? `/api/quote-clauses/${clause.id}` : '/api/quote-clauses', { method: clause ? 'PATCH' : 'POST', body }); toast('Cláusula guardada'); openQuoteClauseManager(); } catch (error) { toast(error.message, true); }
  };
}

// ── Cotizaciones de un cliente (en su expediente) ────────────────────────────────────────────────────────────────
function clientQuotesSection(target, client) {
  if (!target) return;
  api(`/api/quotes?clientId=${encodeURIComponent(client.id)}`).then(result => {
    const list = result.items.slice(0, 5);
    target.innerHTML = `${list.length ? list.map(q => `<button type="button" class="qt-mini" data-client-quote="${q.id}"><b>${escapeHtml(q.code)}</b><span>${escapeHtml(q.title)}</span><span class="qt-status ${q.status}">${(quoteStatusInfo[q.status] || quoteStatusInfo.draft).icon} ${(quoteStatusInfo[q.status] || quoteStatusInfo.draft).label}</span><strong>${money.format(q.total)}</strong></button>`).join('') : '<p class="empty">Aún no le has hecho una cotización.</p>'}<button type="button" class="secondary wide-button" id="client-new-quote">🧾 Cotizar a ${escapeHtml(quoteFirstName(client.name) || 'este cliente')}</button>`;
    target.querySelectorAll('[data-client-quote]').forEach(button => button.onclick = () => { modal.close(); navigate('quotes'); openQuotePreview(button.dataset.clientQuote); });
    target.querySelector('#client-new-quote').onclick = () => { modal.close(); openQuoteEditor(null, { clientId: client.id }); };
  }).catch(() => { target.innerHTML = ''; });
}

// ── Enlace público (#cotizacion=TOKEN): lo que ve el cliente ─────────────────────────────────────────────────────
const cotizacionPublicaDelHash = () => (location.hash.match(/^#cotizacion=([A-Za-z0-9_-]{30,80})$/) || [])[1] || null;
async function mostrarCotizacionPublica(token) {
  for (const id of ['auth-screen', 'app-shell', 'portal-shell', 'public-routine']) { const element = document.getElementById(id); if (element) element.hidden = true; }
  const root = document.getElementById('public-quote'); root.hidden = false;
  const brand = '<div class="public-brand"><span class="brand-mark">EL</span><span>Eileen <b>Lifestyle</b></span></div>';
  try {
    const q = await api(`/api/public/quote/${token}`, { auth: false });
    document.title = `${q.code} · Eileen Lifestyle`;
    const whatsapp = q.owner.whatsapp ? `https://wa.me/${q.owner.whatsapp}?text=${encodeURIComponent(`Hola Eileen, vi mi cotización ${q.code} y me interesa. ¿Podemos hablar?`)}` : '';
    root.innerHTML = `${brand}<div class="qt-public">
      <p class="qt-hello">Hola${q.recipient.firstName ? `, ${escapeHtml(q.recipient.firstName)}` : ''} 👋</p><p class="qt-hello-sub">Esta es tu propuesta de Eileen Lifestyle.</p>
      ${quoteDocumentMarkup({ code: q.code, title: q.title, intro: q.intro, notes: q.notes, recipientName: q.recipient.name, issuedOn: q.issuedOn, validUntil: q.validUntil, daysLeft: q.daysLeft, expired: q.status === 'expired', items: q.items, discount: q.discount, subtotal: q.subtotal, total: q.total, clauses: q.clauses })}
      <div class="qt-public-actions">${whatsapp ? `<a class="primary wide-button qt-wa" href="${whatsapp}" target="_blank" rel="noopener">💬 Hablar con Eileen</a>` : ''}<button type="button" class="secondary wide-button" id="qt-public-pdf">📄 Descargar PDF</button></div>
      <p class="qt-public-foot">Cotización informativa · ${escapeHtml(q.owner.name)}</p></div>`;
    root.querySelector('#qt-public-pdf').onclick = async event => {
      const button = event.currentTarget; button.disabled = true;
      try { const response = await fetch(`${API_BASE}/api/public/quote/${token}/pdf`); if (!response.ok) throw new Error('No se pudo descargar el PDF'); downloadBlob(await response.blob(), `cotizacion-${q.code}.pdf`); }
      catch (error) { toast(error.message, true); } finally { button.disabled = false; }
    };
  } catch (error) {
    root.innerHTML = `${brand}<div class="qt-public"><article class="public-card"><p class="eyebrow">COTIZACIÓN</p><h2>No se puede abrir</h2><p class="public-instrucciones">${escapeHtml(error.message)}</p></article></div>`;
  }
}
