import PDFDocument from 'pdfkit';
import type { RoutineComplianceAllRow, RoutineComplianceSeries } from './routine-compliance-report.js';

type PdfRecord = Record<string, any>;
type Column = { label: string; key: string; width: number; align?: 'left' | 'right' | 'center'; format?: (value: any, row: PdfRecord) => string };

const colors = { ink: '#493740', muted: '#7a6d73', rose: '#b66f8d', blush: '#f3dce5', pale: '#faf5f7', line: '#eadfe3', green: '#5d876f', amber: '#a97725' };
const brand = {
  plum: '#4b3943',
  pink: '#efbfd0',
  white: '#fffaf8',
  ePath: 'M29 33h48v13H44v16h28v12H44v18h35v13H29z',
  lPath: 'M75 59h15v33h22v13H75z'
};
const money = (value: unknown) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(value || 0));
const date = (value: unknown) => {
  if (!value) return '-';
  const text = String(value); const parsed = value instanceof Date
    ? value
    : /^\d{4}-\d{2}-\d{2}/.test(text) ? new Date(`${text.slice(0, 10)}T12:00:00-05:00`) : new Date(text);
  return Number.isNaN(parsed.getTime()) ? text.slice(0, 10) : new Intl.DateTimeFormat('es-PA', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Panama' }).format(parsed);
};
// Fecha para MOSTRAR en las facturas nuevas: dd-mm-aaaa, siempre (convención del
// proyecto). Una cadena aaaa-mm-dd se reordena tal cual (sin pasar por Date, para no
// correr un día); un instante se lleva a la fecha de Panamá.
const dmy = (value: unknown) => {
  if (!value) return '-';
  const text = value instanceof Date ? '' : String(value);
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (iso) return `${iso[3]}-${iso[2]}-${iso[1]}`;
  const parsed = value instanceof Date ? value : new Date(text);
  if (Number.isNaN(parsed.getTime())) return text.slice(0, 10) || '-';
  const [y, m, d] = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Panama', year: 'numeric', month: '2-digit', day: '2-digit' }).format(parsed).split('-');
  return `${d}-${m}-${y}`;
};
const clean = (value: unknown) => String(value ?? '').replace(/[\r\n]+/g, ' ').trim();
const status = (value: unknown) => value === 'confirmed' ? 'Pagada' : value === 'void' ? 'Anulada' : 'Pendiente';

function pdfBuffer(draw: (document: PDFKit.PDFDocument) => void, createdAt?: Date | string) {
  return new Promise<Buffer>((resolve, reject) => {
    const document = new PDFDocument({ size: 'LETTER', margin: 42, bufferPages: true, info: { Author: 'Eileen Lifestyle', Creator: 'Eileen Lifestyle', ...(createdAt ? { CreationDate: new Date(createdAt), ModDate: new Date(createdAt) } : {}) } });
    const chunks: Buffer[] = [];
    document.on('data', chunk => chunks.push(Buffer.from(chunk)));
    document.on('error', reject);
    document.on('end', () => resolve(Buffer.concat(chunks)));
    draw(document);
    const range = document.bufferedPageRange();
    for (let index = range.start; index < range.start + range.count; index += 1) {
      document.switchToPage(index);
      const bottomMargin = document.page.margins.bottom;
      document.page.margins.bottom = 0;
      document.font('Helvetica').fontSize(7).fillColor(colors.muted).text(`Eileen Lifestyle · Página ${index + 1} de ${range.count}`, 42, document.page.height - 27, { width: document.page.width - 84, align: 'center', lineBreak: false });
      document.page.margins.bottom = bottomMargin;
    }
    document.end();
  });
}

/** Documento interno de contrato. El texto ya fue congelado por el servidor;
 * este helper solo lo presenta, no vuelve a consultar ni recalcula el contrato. */
type ContractSignatureBox = {
  name: string;
  legalId?: string | null;
  image?: Buffer | null;
  signedAt?: string | null;
  method?: 'portal' | 'presencial' | 'papel' | null;
  role: 'Eileen' | 'Cliente' | 'Representante legal';
};

export function contractPdf(input: {
  title: string;
  subtitle: string;
  body: string;
  createdAt?: Date | string;
  signatures?: { owner: ContractSignatureBox; client: ContractSignatureBox };
}) {
  return pdfBuffer(document => {
    brandHeader(document, input.title, input.subtitle);
    input.body.split('\n').forEach(line => {
      ensureSpace(document, line ? 30 : 14, 'Contrato de servicios');
      if (/^\d+\./.test(line)) document.font('Helvetica-Bold').fontSize(10).fillColor(colors.ink);
      else document.font('Helvetica').fontSize(9).fillColor(colors.ink);
      document.text(line || ' ', 42, document.y, { width: document.page.width - 84, lineGap: 3 });
      document.y += line ? 5 : 2;
    });
    if (input.signatures) {
      ensureSpace(document, 190, 'Firmas del contrato');
      document.y += 10;
      document.font('Helvetica-Bold').fontSize(11).fillColor(colors.ink).text('FIRMAS', 42, document.y);
      document.y += 20;
      const gap = 18; const width = (document.page.width - 84 - gap) / 2; const top = document.y;
      const boxes = [input.signatures.owner, input.signatures.client];
      boxes.forEach((signature, index) => {
        const x = 42 + index * (width + gap);
        document.save().roundedRect(x, top, width, 145, 8).lineWidth(1).strokeColor(colors.line).stroke().restore();
        document.font('Helvetica-Bold').fontSize(8).fillColor(colors.muted).text(signature.role.toUpperCase(), x + 10, top + 10, { width: width - 20 });
        if (signature.image) {
          try { document.image(signature.image, x + 12, top + 29, { fit: [width - 24, 58], align: 'center', valign: 'center' }); }
          catch { document.font('Helvetica').fontSize(8).fillColor(colors.muted).text('Firma no disponible', x + 12, top + 50, { width: width - 24, align: 'center' }); }
        } else {
          document.save().rect(x + 12, top + 29, width - 24, 58).dash(3, { space: 2 }).strokeColor(colors.line).stroke().undash().restore();
          document.font('Helvetica').fontSize(8).fillColor(colors.muted).text('Pendiente de firma', x + 12, top + 53, { width: width - 24, align: 'center' });
        }
        document.font('Helvetica-Bold').fontSize(8).fillColor(colors.ink).text(signature.name || '-', x + 10, top + 94, { width: width - 20, align: 'center' });
        document.font('Helvetica').fontSize(7).fillColor(colors.muted).text(signature.legalId ? `Identificación: ${signature.legalId}` : 'Identificación no registrada', x + 10, top + 108, { width: width - 20, align: 'center' });
        if (signature.signedAt || signature.method) {
          const method = signature.method === 'presencial' ? 'presencial' : signature.method === 'papel' ? 'papel' : 'portal';
          document.text([signature.signedAt, signature.method ? `Método: ${method}` : null].filter(Boolean).join(' · '), x + 10, top + 122, { width: width - 20, align: 'center' });
        }
      });
      document.y = top + 160;
    }
  }, input.createdAt);
}

function brandMark(document: PDFKit.PDFDocument, x: number, y: number, size: number) {
  const scale = size / 128;
  document.save();
  document.roundedRect(x, y, size, size, 28 * scale).fill(brand.plum);
  document.translate(x, y).scale(scale);
  document.circle(93, 35, 13).fill(brand.pink);
  document.path(brand.ePath).fill(brand.white);
  document.path(brand.lPath).fill(brand.pink);
  document.restore();
}

function brandHeader(document: PDFKit.PDFDocument, title: string, subtitle: string) {
  // Keep PDF exports aligned with the canonical PWA artwork in /icon.svg.
  brandMark(document, 42, 38, 38);
  document.font('Helvetica-Bold').fontSize(15).fillColor(colors.ink).text('Eileen Lifestyle', 91, 43);
  document.font('Helvetica').fontSize(8).fillColor(colors.muted).text('Entrenamiento personal y bienestar', 91, 62);
  document.moveTo(42, 91).lineTo(document.page.width - 42, 91).strokeColor(colors.line).stroke();
  document.font('Helvetica-Bold').fontSize(23).fillColor(colors.ink).text(title, 42, 111);
  document.font('Helvetica').fontSize(9).fillColor(colors.muted).text(subtitle, 42, 142);
  document.y = 171;
}

function ensureSpace(document: PDFKit.PDFDocument, height: number, continuedTitle = 'Eileen Lifestyle') {
  if (document.y + height <= document.page.height - 48) return;
  document.addPage();
  document.font('Helvetica-Bold').fontSize(11).fillColor(colors.ink).text(continuedTitle, 42, 38);
  document.moveTo(42, 57).lineTo(document.page.width - 42, 57).strokeColor(colors.line).stroke();
  document.y = 72;
}

function infoPair(document: PDFKit.PDFDocument, label: string, value: string, x: number, y: number, width: number) {
  document.font('Helvetica-Bold').fontSize(7).fillColor(colors.muted).text(label.toUpperCase(), x, y, { width });
  document.font('Helvetica').fontSize(10).fillColor(colors.ink).text(value || '-', x, y + 12, { width });
}

function summaryBoxes(document: PDFKit.PDFDocument, values: Array<{ label: string; value: string }>) {
  const gap = 8; const width = (document.page.width - 84 - gap * (values.length - 1)) / values.length; const y = document.y;
  values.forEach((item, index) => {
    const x = 42 + index * (width + gap);
    document.save().roundedRect(x, y, width, 54, 8).fill(colors.pale).restore();
    document.font('Helvetica').fontSize(7).fillColor(colors.muted).text(item.label.toUpperCase(), x + 10, y + 10, { width: width - 20 });
    document.font('Helvetica-Bold').fontSize(14).fillColor(colors.ink).text(item.value, x + 10, y + 27, { width: width - 20 });
  });
  document.y = y + 70;
}

function table(document: PDFKit.PDFDocument, columns: Column[], rows: PdfRecord[], continuedTitle: string) {
  const startX = 42; const headerHeight = 24; const rowHeight = 29;
  const drawHeader = () => {
    ensureSpace(document, headerHeight + rowHeight, continuedTitle);
    const y = document.y;
    document.save().rect(startX, y, columns.reduce((sum, column) => sum + column.width, 0), headerHeight).fill(colors.blush).restore();
    let x = startX;
    columns.forEach(column => {
      document.font('Helvetica-Bold').fontSize(7).fillColor(colors.ink).text(column.label.toUpperCase(), x + 5, y + 8, { width: column.width - 10, align: column.align || 'left', lineBreak: false });
      x += column.width;
    });
    document.y = y + headerHeight;
  };
  drawHeader();
  rows.forEach((row, rowIndex) => {
    if (document.y + rowHeight > document.page.height - 48) drawHeader();
    const y = document.y; let x = startX;
    if (rowIndex % 2) document.save().rect(startX, y, columns.reduce((sum, column) => sum + column.width, 0), rowHeight).fill('#fdfafb').restore();
    columns.forEach(column => {
      const raw = row[column.key]; const text = column.format ? column.format(raw, row) : clean(raw);
      document.font('Helvetica').fontSize(7.5).fillColor(colors.ink).text(text || '-', x + 5, y + 9, { width: column.width - 10, align: column.align || 'left', height: 14, ellipsis: true, lineBreak: false });
      x += column.width;
    });
    document.moveTo(startX, y + rowHeight).lineTo(x, y + rowHeight).strokeColor(colors.line).lineWidth(.5).stroke();
    document.y = y + rowHeight;
  });
}

export function invoicePdf(invoice: PdfRecord, payments: PdfRecord[]) {
  return pdfBuffer(document => {
    const sinCargo = Number(invoice.amount || 0) === 0;
    const isPaid = !sinCargo && (invoice.status === 'confirmed' || Number(invoice.balance_amount || 0) === 0);
    const number = clean(invoice.invoice_number || `EIL-${String(invoice.id).slice(0, 8).toUpperCase()}`);
    brandHeader(document, sinCargo ? 'Resumen de sesiones' : isPaid ? 'Recibo de pago' : 'Factura', `${number} · Documento comercial no fiscal`);
    const metaY = document.y;
    infoPair(document, 'Cliente', clean(invoice.full_name), 42, metaY, 210);
    infoPair(document, 'Correo', clean(invoice.email || 'No registrado'), 42, metaY + 38, 210);
    infoPair(document, 'Fecha de emisión', date(invoice.issued_on || invoice.created_at), 322, metaY, 110);
    infoPair(document, 'Vencimiento', date(invoice.due_on), 445, metaY, 110);
    infoPair(document, 'Estado', sinCargo ? 'Sin cargo' : status(invoice.status), 322, metaY + 38, 110);
    infoPair(document, 'Origen', invoice.source_system === 'zoho_invoice' ? 'Zoho Invoice' : 'Eileen', 445, metaY + 38, 110);
    document.y = metaY + 91;
    const items = Array.isArray(invoice.line_items) && invoice.line_items.length ? invoice.line_items.map((item: PdfRecord) => ({
      concept: clean(item.name || item.description || invoice.concept), quantity: Number(item.quantity || 1), amount: Number(item.item_total ?? item.amount ?? item.rate ?? invoice.amount)
    })) : [{ concept: clean(invoice.concept), quantity: 1, amount: Number(invoice.amount) }];
    table(document, [
      { label: 'Concepto', key: 'concept', width: 330 }, { label: 'Cantidad', key: 'quantity', width: 75, align: 'center' }, { label: 'Importe', key: 'amount', width: 123, align: 'right', format: money }
    ], items, `Factura ${number}`);
    document.moveDown(1.2);
    const summaryX = 360; const summaryWidth = 195; const row = (label: string, value: string, bold = false) => {
      const y = document.y; document.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(bold ? 11 : 9).fillColor(colors.ink).text(label, summaryX, y, { width: 95 });
      document.text(value, summaryX + 95, y, { width: 100, align: 'right' }); document.y = y + (bold ? 21 : 17);
    };
    row('Subtotal', money(invoice.subtotal || invoice.amount));
    if (Number(invoice.tax_total || 0)) row('Impuesto', money(invoice.tax_total));
    row('Total', money(invoice.amount), true);
    row('Pagado', money(invoice.paid_amount));
    row('Saldo', money(invoice.balance_amount), true);
    document.y += 10;
    ensureSpace(document, 88, `Factura ${number}`);
    document.save().roundedRect(42, document.y, 513, 72, 9).fill(sinCargo ? '#f5f0f2' : isPaid ? '#eef6f1' : '#fff8e9').restore();
    const boxY = document.y;
    document.font('Helvetica-Bold').fontSize(9).fillColor(sinCargo ? colors.muted : isPaid ? colors.green : colors.amber).text(sinCargo ? 'SIN CARGO' : isPaid ? 'PAGO REGISTRADO' : 'SALDO PENDIENTE', 55, boxY + 12);
    const payment = payments[0] || {};
    const paymentDetail = sinCargo
      ? 'No se generó cargo: no hubo sesiones cobrables en este ciclo.'
      : `Método: ${clean(payment.method || invoice.payment_method || '-')}   ·   Referencia: ${clean(payment.reference || invoice.payment_reference || '-')}   ·   Fecha: ${date(payment.paid_on || invoice.confirmed_at)}`;
    document.font('Helvetica').fontSize(8).fillColor(colors.ink).text(paymentDetail, 55, boxY + 32, { width: 485 });
    document.fontSize(7).fillColor(colors.muted).text('Este comprobante documenta una operación comercial de Eileen Lifestyle y no constituye una factura fiscal.', 55, boxY + 51, { width: 485 });
    document.y = boxY + 88;
  });
}

const billingKindLabel: Record<string, string> = { mensual: 'Mensualidad', credito: 'A crédito', clase_suelta: 'Clase suelta', rutina_suelta: 'Rutina suelta', paquete: 'Paquete', manual: 'Manual' };
// Texto del concepto de una línea en el PDF (J-100): se quita la etiqueta "plan familiar" ("Ernesto, plan familiar (4 clases)" -> "Ernesto (4 clases)"); no cambia lo guardado.
export const lineConceptText = (value: unknown) => String(value ?? '').replace(/,?\s*plan familiar/gi, '').replace(/\s{2,}/g, ' ').trim();
const billingStatusLabel: Record<string, string> = { pendiente: 'Pago pendiente', parcial: 'Pago parcial', pagada: 'Pagada', anulada: 'Anulada' };

// Factura del módulo nuevo (1B-2): número FAC-, pagador, ciclo, una línea por
// beneficiario, cobros aplicados y saldo. Mismo formato visual que el comprobante.
export function billingInvoicePdf(invoice: PdfRecord, lines: PdfRecord[], applications: PdfRecord[]) {
  return pdfBuffer(document => {
    const number = `FAC-${String(invoice.number).padStart(4, '0')}`;
    const anulada = invoice.status === 'anulada';
    const total = Number(invoice.total || 0);
    const paid = applications.filter(item => !item.reversed_at).reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const balance = anulada ? 0 : Math.max(0, Math.round((total - paid) * 100) / 100);
    const settled = !anulada && balance === 0 && total > 0;
    brandHeader(document, anulada ? 'Factura anulada' : 'Factura', `${number} · Documento interno no fiscal`);
    const metaY = document.y;
    infoPair(document, 'Pagador', clean(invoice.payer_name), 42, metaY, 250);
    infoPair(document, 'Ciclo', `${dmy(invoice.cycle_start)} al ${dmy(invoice.cycle_end)}`, 322, metaY, 233);
    infoPair(document, 'Correo', clean(invoice.payer_email || 'No registrado'), 42, metaY + 38, 250);
    infoPair(document, 'Fecha de emisión', dmy(invoice.issued_on), 322, metaY + 38, 110);
    infoPair(document, 'Vencimiento', dmy(invoice.due_on), 445, metaY + 38, 110);
    infoPair(document, 'Estado', billingStatusLabel[String(invoice.status)] || clean(invoice.status), 42, metaY + 76, 110);
    infoPair(document, 'Tipo', billingKindLabel[String(invoice.kind)] || clean(invoice.kind), 322, metaY + 76, 110);
    document.y = metaY + 129;
    table(document, [
      { label: 'Beneficiario', key: 'beneficiary_name', width: 150 },
      { label: 'Concepto', key: 'description', width: 190, format: value => lineConceptText(value) },
      { label: 'Cantidad', key: 'quantity', width: 55, align: 'center', format: value => String(Number(value || 1)) },
      { label: 'Importe', key: 'amount', width: 128, align: 'right', format: money }
    ], lines, `Factura ${number}`);
    document.moveDown(1.2);
    const summaryX = 360;
    const row = (label: string, value: string, bold = false) => {
      ensureSpace(document, 24, `Factura ${number}`);
      const y = document.y; document.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(bold ? 11 : 9).fillColor(colors.ink).text(label, summaryX, y, { width: 95 });
      document.text(value, summaryX + 95, y, { width: 100, align: 'right' }); document.y = y + (bold ? 21 : 17);
    };
    row('Total', money(total), true);
    row('Pagado', money(anulada ? 0 : paid));
    row('Saldo', money(balance), true);
    const aplicados = applications.filter(item => !item.reversed_at);
    if (aplicados.length) {
      document.y += 6;
      ensureSpace(document, 80, `Factura ${number}`);
      document.font('Helvetica-Bold').fontSize(8).fillColor(colors.muted).text('COBROS APLICADOS', 42, document.y); document.y += 14;
      table(document, [
        { label: 'Fecha', key: 'paid_on', width: 80, format: dmy },
        { label: 'Método', key: 'method', width: 130 },
        { label: 'Referencia', key: 'reference', width: 178 },
        { label: 'Aplicado', key: 'amount', width: 125, align: 'right', format: money }
      ], aplicados, `Factura ${number}`);
    }
    document.y += 10;
    ensureSpace(document, 88, `Factura ${number}`);
    const boxY = document.y;
    document.save().roundedRect(42, boxY, 513, 72, 9).fill(anulada ? '#f5f0f2' : settled ? '#eef6f1' : '#fff8e9').restore();
    document.font('Helvetica-Bold').fontSize(9).fillColor(anulada ? colors.muted : settled ? colors.green : colors.amber)
      .text(anulada ? 'FACTURA ANULADA' : settled ? 'PAGADA' : 'SALDO PENDIENTE', 55, boxY + 13, { width: 485 });
    document.font('Helvetica').fontSize(8).fillColor(colors.ink).text(
      anulada ? `Motivo: ${clean(invoice.void_reason)}   ·   Anulada el ${dmy(invoice.voided_at)}` : (clean(invoice.notes) || 'Sin notas.'), 55, boxY + 32, { width: 485 });
    document.fontSize(7).fillColor(colors.muted).text('Documento interno de Eileen Lifestyle. No constituye una factura fiscal.', 55, boxY + 51, { width: 485 });
    document.y = boxY + 88;
  });
}

export function accountStatementPdf(client: PdfRecord, rows: PdfRecord[], from: string, to: string) {
  return pdfBuffer(document => {
    brandHeader(document, 'Estado de cuenta', `${date(from)} al ${date(to)} · Importes en USD`);
    infoPair(document, 'Cliente', clean(client.full_name), 42, document.y, 245);
    infoPair(document, 'Correo', clean(client.email || 'No registrado'), 310, document.y, 245);
    document.y += 48;
    const total = rows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
    const paid = rows.reduce((sum, row) => sum + Number(row.paid_amount || 0), 0);
    const balance = rows.reduce((sum, row) => sum + Number(row.balance_amount || 0), 0);
    summaryBoxes(document, [{ label: 'Facturado', value: money(total) }, { label: 'Pagado', value: money(paid) }, { label: 'Saldo', value: money(balance) }]);
    if (!rows.length) return void document.font('Helvetica').fontSize(10).fillColor(colors.muted).text('No hay movimientos en el período seleccionado.');
    table(document, [
      { label: 'Fecha', key: 'issued_on', width: 65, format: date }, { label: 'Factura', key: 'invoice_number', width: 75 }, { label: 'Concepto', key: 'concept', width: 178 },
      { label: 'Facturado', key: 'amount', width: 70, align: 'right', format: money }, { label: 'Pagado', key: 'paid_amount', width: 70, align: 'right', format: money }, { label: 'Saldo', key: 'balance_amount', width: 70, align: 'right', format: money }
    ], rows, `Estado de cuenta · ${clean(client.full_name)}`);
  });
}

export function accountsReceivablePdf(rows: PdfRecord[], asOf: string) {
  return pdfBuffer(document => {
    brandHeader(document, 'Cuentas por cobrar', `Saldos vigentes al ${date(asOf)} · Importes en USD`);
    const total = rows.reduce((sum, row) => sum + Number(row.balance_amount || 0), 0);
    const overdue = rows.filter(row => Number(row.days_overdue) > 0).reduce((sum, row) => sum + Number(row.balance_amount || 0), 0);
    const clients = new Set(rows.map(row => row.client_id)).size;
    summaryBoxes(document, [{ label: 'Saldo total', value: money(total) }, { label: 'Pago pendiente (fecha cumplida)', value: money(overdue) }, { label: 'Clientes', value: String(clients) }]);
    if (!rows.length) return void document.font('Helvetica').fontSize(10).fillColor(colors.muted).text('No existen cuentas por cobrar para la fecha seleccionada.');
    table(document, [
      { label: 'Cliente', key: 'full_name', width: 135 }, { label: 'Factura', key: 'invoice_number', width: 76 }, { label: 'Vence', key: 'due_on', width: 68, format: date },
      { label: 'Antigüedad', key: 'aging', width: 82 }, { label: 'Saldo', key: 'balance_amount', width: 80, align: 'right', format: money }, { label: 'Origen', key: 'source_label', width: 87 }
    ], rows, 'Cuentas por cobrar');
  });
}

export function monthlyFinancePdf(data: PdfRecord, categoryName: string | null) {
  return pdfBuffer(document => {
    const mesLabel = new Intl.DateTimeFormat('es-PA', { month: 'long', year: 'numeric', timeZone: 'America/Panama' })
      .format(new Date(`${data.month}-15T12:00:00Z`));
    brandHeader(document, 'Informe mensual', `${mesLabel.charAt(0).toUpperCase() + mesLabel.slice(1)}${categoryName ? ` · Categoría: ${categoryName}` : ''} · Importes en USD`);
    summaryBoxes(document, [
      { label: 'Ingresos', value: money(data.resumen.ingresos) },
      { label: 'Gastos', value: money(data.resumen.gastos) },
      { label: 'Margen', value: money(data.resumen.margen) }
    ]);
    document.font('Helvetica-Bold').fontSize(11).fillColor(colors.ink).text('Cobros recibidos', 42, document.y);
    document.y += 6;
    if (data.cobros.length) {
      table(document, [
        { label: 'Fecha', key: 'fecha', width: 70, format: date },
        { label: 'Cliente', key: 'cliente', width: 170 },
        { label: 'Concepto', key: 'concepto', width: 150 },
        { label: 'Método', key: 'metodo', width: 70 },
        { label: 'Monto', key: 'monto', width: 53, align: 'right', format: money }
      ], data.cobros, 'Informe mensual · cobros');
    } else document.font('Helvetica').fontSize(9).fillColor(colors.muted).text('Sin cobros en el mes.', 42, document.y);
    document.moveDown(1.6);
    document.font('Helvetica-Bold').fontSize(11).fillColor(colors.ink).text('Gastos', 42, document.y);
    document.y += 6;
    if (data.gastos.length) {
      table(document, [
        { label: 'Fecha', key: 'fecha', width: 70, format: date },
        { label: 'Descripción', key: 'descripcion', width: 180 },
        { label: 'Categoría', key: 'categoria', width: 130 },
        { label: 'Ámbito', key: 'ambito', width: 80, format: (v: unknown) => v === 'negocio' ? 'Negocio' : 'Personal' },
        { label: 'Monto', key: 'monto', width: 53, align: 'right', format: money }
      ], data.gastos, 'Informe mensual · gastos');
    } else document.font('Helvetica').fontSize(9).fillColor(colors.muted).text('Sin gastos en el mes.', 42, document.y);
  });
}

// Gráfica lineal de cumplimiento mes a mes. Se dibuja con primitivas de pdfkit
// en vez de incrustar una imagen: pesa nada, se imprime nítida a cualquier
// tamaño y no mete una dependencia sólo para esto.
function complianceChart(document: PDFKit.PDFDocument, timeline: PdfRecord[]) {
  const x = 42, ancho = 511, alto = 168;
  const y = document.y;
  const conDatos = timeline.filter(mes => mes.compliancePercent !== null);
  if (conDatos.length < 2) {
    document.font('Helvetica').fontSize(9).fillColor(colors.muted)
      .text('Se necesitan al menos dos meses con actividad para comparar.', x, y + 12, { width: ancho });
    document.y = y + 40;
    return;
  }

  document.roundedRect(x, y, ancho, alto, 10).fill(colors.pale);

  // Rejilla horizontal cada 25%
  for (let p = 0; p <= 100; p += 25) {
    const py = y + alto - 26 - ((alto - 46) * p) / 100;
    document.moveTo(x + 34, py).lineTo(x + ancho - 14, py).lineWidth(0.5).stroke(colors.line);
    document.font('Helvetica').fontSize(7).fillColor(colors.muted).text(`${p}%`, x + 8, py - 3, { width: 22, align: 'right' });
  }

  const paso = (ancho - 52) / Math.max(1, timeline.length - 1);
  const punto = (indice: number, porcentaje: number) => ({
    px: x + 34 + paso * indice,
    py: y + alto - 26 - ((alto - 46) * porcentaje) / 100
  });

  // La línea salta los meses sin actividad en vez de bajarlos a cero.
  let iniciado = false;
  timeline.forEach((mes, indice) => {
    if (mes.compliancePercent === null) { iniciado = false; return; }
    const { px, py } = punto(indice, Number(mes.compliancePercent));
    if (!iniciado) { document.moveTo(px, py); iniciado = true; } else { document.lineTo(px, py); }
  });
  document.lineWidth(2).stroke(colors.rose);

  timeline.forEach((mes, indice) => {
    const etiqueta = String(mes.month).slice(5) + '/' + String(mes.month).slice(2, 4);
    const { px } = punto(indice, 0);
    document.font('Helvetica').fontSize(7).fillColor(colors.muted)
      .text(etiqueta, px - 16, y + alto - 18, { width: 32, align: 'center' });
    if (mes.compliancePercent === null) return;
    const { py } = punto(indice, Number(mes.compliancePercent));
    document.circle(px, py, 3).fill(colors.rose);
    // El primero se alinea a la izquierda y el último a la derecha: centrados se
    // salían del área, y el del primer mes se encimaba con la escala del eje.
    const alineacion = indice === 0 ? 'left' : indice === timeline.length - 1 ? 'right' : 'center';
    const offset = indice === 0 ? 0 : indice === timeline.length - 1 ? -32 : -16;
    document.font('Helvetica-Bold').fontSize(7).fillColor(colors.ink)
      .text(`${mes.compliancePercent}%`, px + offset, py - 14, { width: 32, align: alineacion as 'left' | 'right' | 'center' });
  });

  document.y = y + alto + 14;
}

export function compliancePdf(client: PdfRecord | null, resumen: PdfRecord, timeline: PdfRecord[]) {
  return pdfBuffer(document => {
    const desde = timeline[0]?.month || '';
    const hasta = timeline[timeline.length - 1]?.month || '';
    brandHeader(document, 'Informe de cumplimiento', `${desde} al ${hasta} · Clases`);
    infoPair(document, 'Cliente', clean(client ? client.full_name : 'Todos los clientes'), 42, document.y, 245);
    infoPair(document, 'Emitido', date(new Date()), 310, document.y, 245);
    document.y += 48;

    summaryBoxes(document, [
      { label: 'Cumplimiento promedio', value: resumen.promedio === null ? 'Sin datos' : `${resumen.promedio}%` },
      { label: 'Clases', value: String(resumen.totalActividades) },
      { label: 'Sin hacer', value: String(resumen.totalIncumplidas) }
    ]);

    document.font('Helvetica-Bold').fontSize(11).fillColor(colors.ink).text('Evolución mes a mes', 42, document.y);
    document.y += 6;
    complianceChart(document, timeline);

    table(document, [
      { label: 'Mes', key: 'month', width: 96 },
      { label: 'Clases', key: 'activities', width: 90, align: 'right' },
      { label: 'Cumplidas', key: 'completed', width: 90, align: 'right' },
      { label: 'Sin hacer', key: 'missed', width: 80, align: 'right' },
      { label: 'Cumplimiento', key: 'compliancePercent', width: 95, align: 'right',
        format: value => (value === null ? 'Sin actividad' : `${value}%`) }
    ], timeline, 'Informe de cumplimiento');

    document.moveDown(1);
    document.font('Helvetica').fontSize(8).fillColor(colors.muted).text(
      'Las clases pendientes, futuras, pausadas y canceladas por la entrenadora no forman parte de la métrica.',
      42, document.y, { width: 511 });
  });
}

// ── Informes de cumplimiento de RUTINAS ───────────────────────────────────────────────────────────────────────────
// "Enviadas" y "hechas" son números distintos; hecha = ejecución cerrada con más de 0 %, completa o parcial, repeticiones incluidas.
// Cumplimiento = hechas ÷ cupo (puede pasar de 100 %). La calidad (promedio, completas/parciales, tiempo) va aparte.
const routineStatusText: Record<string, string> = { active: 'Vigente', upcoming: 'Aún no abre', expired: 'Vencida' };
const routineMinutes = (seconds: number) => (seconds > 0 ? `${Math.max(1, Math.round(seconds / 60))} min` : '-');
const routineFootnote = 'Hechas = ejecuciones cerradas con más de 0 %, completas o parciales (las repeticiones cuentan). Cumplimiento = hechas ÷ cupo del ciclo y puede superar 100 %. Enviadas = rutinas distintas asignadas al ciclo.';

export function routineCompliancePdf(series: RoutineComplianceSeries, audience: 'trainer' | 'client' = 'trainer') {
  return pdfBuffer(document => {
    const range = series.from && series.to ? `${dmy(series.from)} al ${dmy(series.to)} · ${series.totals.cycles} ciclo${series.totals.cycles === 1 ? '' : 's'}` : 'Rutinas sueltas';
    brandHeader(document, audience === 'client' ? 'Mi informe de rutinas' : 'Informe de rutinas', range);
    const top = document.y;
    infoPair(document, 'Cliente', clean(series.client.name), 42, top, 245);
    infoPair(document, 'Emitido', dmy(series.generatedOn), 310, top, 245);
    infoPair(document, 'Plan', clean(series.client.planName || 'Rutinas sueltas'), 42, top + 40, 245);
    infoPair(document, 'Cupo por ciclo', series.client.quota ? `${series.client.quota} rutinas` : '-', 310, top + 40, 245);
    document.y = top + 88;

    const t = series.totals;
    if (series.client.isRoutinePlan) {
      summaryBoxes(document, [
        { label: 'Cumplimiento promedio', value: t.complianceAverage === null ? 'Sin datos' : `${t.complianceAverage}%` },
        { label: 'Enviadas · hechas', value: `${t.sent} · ${t.done}` },
        { label: 'Repeticiones', value: String(t.repeats) },
        { label: '% completado promedio', value: t.averagePercent === null ? '-' : `${t.averagePercent}%` }
      ]);
      document.font('Helvetica-Bold').fontSize(11).fillColor(colors.ink).text('Ciclo por ciclo', 42, document.y);
      document.y += 6;
      table(document, [
        { label: 'Ciclo', key: 'period', width: 128 }, { label: 'Cupo', key: 'quota', width: 34, align: 'right', format: v => (v == null ? '-' : String(v)) },
        { label: 'Enviadas', key: 'sent', width: 50, align: 'right' }, { label: 'Hechas', key: 'done', width: 46, align: 'right' }, { label: 'Repet.', key: 'repeats', width: 42, align: 'right' },
        { label: 'Sin hacer', key: 'without', width: 50, align: 'right' }, { label: 'Cumplim.', key: 'compliancePercent', width: 58, align: 'right', format: v => (v == null ? 'Sin enviar' : `${v}%`) },
        { label: 'Compl.', key: 'averagePercent', width: 52, align: 'right', format: v => (v == null ? '-' : `${v}%`) }, { label: 'Tiempo', key: 'totalSeconds', width: 51, align: 'right', format: v => routineMinutes(Number(v)) }
      ], series.cycles.map(row => ({ ...row, period: `${dmy(row.start)} al ${dmy(row.end)}${row.current ? ' (actual)' : ''}`, without: row.pending + row.expired })), 'Informe de rutinas');
      document.moveDown(0.6);
      document.font('Helvetica').fontSize(8.5).fillColor(colors.ink).text(
        `Calidad: ${t.complete} completa${t.complete === 1 ? '' : 's'} y ${t.partial} parcial${t.partial === 1 ? '' : 'es'} · ${routineMinutes(t.totalSeconds) === '-' ? 'sin tiempo registrado' : `${routineMinutes(t.totalSeconds)} en total`}.${t.expired ? ` ${t.expired} rutina${t.expired === 1 ? '' : 's'} vencida${t.expired === 1 ? '' : 's'} sin hacer.` : ''}`, 42, document.y, { width: 511 });
      document.moveDown(1);
    }

    if (series.detail.length) {
      ensureSpace(document, 80, 'Informe de rutinas');
      const recent = series.detail.slice(-150);
      document.font('Helvetica-Bold').fontSize(11).fillColor(colors.ink).text('Detalle por fecha y hora', 42, document.y);
      document.y += 6;
      table(document, [
        { label: 'Fecha', key: 'date', width: 58, format: v => dmy(v) }, { label: 'Hora', key: 'time', width: 34 }, { label: 'Evento', key: 'event', width: 48 },
        { label: 'Rutina', key: 'title', width: 118 }, { label: 'Detalle', key: 'detail', width: 253 }
      ], recent, 'Informe de rutinas');
      if (series.detail.length > recent.length) document.font('Helvetica').fontSize(8).fillColor(colors.muted).text(`Se muestran los ${recent.length} eventos más recientes de ${series.detail.length}.`, 42, document.y + 4, { width: 511 });
      document.moveDown(1);
    }

    if (series.entitlements.length) {
      ensureSpace(document, 90, 'Informe de rutinas');
      document.font('Helvetica-Bold').fontSize(11).fillColor(colors.ink).text('Rutinas sueltas', 42, document.y);
      document.y += 6;
      table(document, [
        { label: 'Venta', key: 'quantity', width: 56, format: v => `${v} rutina${Number(v) === 1 ? '' : 's'}` }, { label: 'Ventana', key: 'window', width: 128 },
        { label: 'Enviadas', key: 'sent', width: 52, align: 'right' }, { label: 'Hechas', key: 'done', width: 48, align: 'right' }, { label: 'Estado', key: 'statusText', width: 62 },
        { label: audience === 'client' ? '' : 'Factura', key: 'invoice', width: 165 }
      ], series.entitlements.map(row => ({ ...row, window: `${dmy(row.from)} al ${dmy(row.until)}`, statusText: routineStatusText[row.status] || row.status,
        invoice: audience === 'client' || !row.invoiceCode ? '' : `${row.invoiceCode} · ${money(row.invoiceTotal)} · ${clean(row.invoiceStatus)}` })), 'Informe de rutinas');
      document.moveDown(1);
    }

    if (!series.cycles.length && !series.entitlements.length) {
      document.font('Helvetica').fontSize(10).fillColor(colors.muted).text('No hay rutinas en el período.', 42, document.y);
      document.moveDown(1);
    }
    ensureSpace(document, 40, 'Informe de rutinas');
    document.font('Helvetica').fontSize(8).fillColor(colors.muted).text(routineFootnote, 42, document.y, { width: 511 });
  });
}

export function routineComplianceAllPdf(data: { generatedOn: string; rows: RoutineComplianceAllRow[] }) {
  return pdfBuffer(document => {
    brandHeader(document, 'Informe de rutinas · todos los clientes', `Ciclo actual de cada cliente con plan de rutinas · ${dmy(data.generatedOn)}`);
    const sent = data.rows.reduce((sum, row) => sum + row.sent, 0); const done = data.rows.reduce((sum, row) => sum + row.done, 0);
    const withQuota = data.rows.filter(row => row.compliancePercent !== null);
    summaryBoxes(document, [
      { label: 'Clientes', value: String(data.rows.length) },
      { label: 'Enviadas · hechas', value: `${sent} · ${done}` },
      { label: 'Cumplimiento promedio', value: withQuota.length ? `${Math.round(withQuota.reduce((sum, row) => sum + (row.compliancePercent || 0), 0) / withQuota.length)}%` : 'Sin datos' }
    ]);
    if (!data.rows.length) return void document.font('Helvetica').fontSize(10).fillColor(colors.muted).text('No hay clientes con plan de rutinas activo.', 42, document.y);
    table(document, [
      { label: 'Cliente', key: 'name', width: 120 }, { label: 'Ciclo actual', key: 'period', width: 100 }, { label: 'Cupo', key: 'quota', width: 34, align: 'right', format: v => (v == null ? '-' : String(v)) },
      { label: 'Enviadas', key: 'sent', width: 50, align: 'right' }, { label: 'Hechas', key: 'done', width: 44, align: 'right' }, { label: 'Repet.', key: 'repeats', width: 40, align: 'right' },
      { label: 'Sin hacer', key: 'withoutDone', width: 54, align: 'right' }, { label: 'Cumplim.', key: 'compliancePercent', width: 69, align: 'right', format: v => (v == null ? 'Sin enviar' : `${v}%`) }
    ], data.rows.map(row => ({ ...row, period: `${dmy(row.cycleStart)} al ${dmy(row.cycleEnd)}` })), 'Informe de rutinas');
    document.moveDown(1);
    ensureSpace(document, 40, 'Informe de rutinas');
    document.font('Helvetica').fontSize(8).fillColor(colors.muted).text(routineFootnote, 42, document.y, { width: 511 });
  });
}

// ── Cotización (informativa) ──────────────────────────────────────────────────────────────────────────────────────
// Documento para el cliente: líneas, descuento, total, vigencia y las cláusulas que Eileen aplicó. No es una factura.
export function quotePdf(quote: PdfRecord) {
  return pdfBuffer(document => {
    const rose = colors.rose;
    brandHeader(document, `Cotización ${quote.code}`, `Emitida el ${dmy(quote.issuedOn)} · Válida hasta el ${dmy(quote.validUntil)}`);
    const top = document.y;
    infoPair(document, 'Para', clean(quote.recipient?.name), 42, top, 245);
    infoPair(document, 'Contacto', clean([quote.recipient?.phone, quote.recipient?.email].filter(Boolean).join(' · ') || '-'), 310, top, 245);
    document.y = top + 44;

    document.font('Helvetica-Bold').fontSize(15).fillColor(colors.ink).text(clean(quote.title), 42, document.y, { width: 511 });
    document.moveDown(0.4);
    if (quote.intro) {
      document.font('Helvetica').fontSize(10).fillColor(colors.ink).text(String(quote.intro), 42, document.y, { width: 511, lineGap: 2 });
      document.moveDown(0.9);
    } else document.moveDown(0.3);

    // Tabla de líneas, con el detalle debajo del concepto.
    const columns = [{ label: 'Concepto', x: 42, w: 286, align: 'left' as const }, { label: 'Cant.', x: 328, w: 50, align: 'right' as const }, { label: 'Precio', x: 378, w: 80, align: 'right' as const }, { label: 'Importe', x: 458, w: 95, align: 'right' as const }];
    const header = () => {
      ensureSpace(document, 60, `Cotización ${quote.code}`);
      const y = document.y;
      document.save().rect(42, y, 511, 22).fill(colors.blush).restore();
      columns.forEach(column => document.font('Helvetica-Bold').fontSize(7).fillColor(colors.ink).text(column.label.toUpperCase(), column.x + 6, y + 8, { width: column.w - 12, align: column.align, lineBreak: false }));
      document.y = y + 22;
    };
    header();
    (quote.items as PdfRecord[]).forEach((item, index) => {
      const detailHeight = item.detail ? document.heightOfString(String(item.detail), { width: 270 }) + 2 : 0;
      const height = Math.max(26, 14 + document.heightOfString(String(item.description), { width: 270 }) + detailHeight + 6);
      if (document.y + height > document.page.height - 70) { document.addPage(); document.y = 60; header(); }
      const y = document.y;
      if (index % 2) document.save().rect(42, y, 511, height).fill('#fdfafb').restore();
      document.font('Helvetica-Bold').fontSize(9.5).fillColor(colors.ink).text(clean(item.description), 48, y + 8, { width: 270 });
      if (item.detail) document.font('Helvetica').fontSize(8).fillColor(colors.muted).text(String(item.detail), 48, document.y + 1, { width: 270 });
      const qty = Number(item.quantity); const qtyText = Number.isInteger(qty) ? String(qty) : String(qty).replace('.', ',');
      document.font('Helvetica').fontSize(9).fillColor(colors.ink);
      document.text(qtyText, columns[1].x + 6, y + 8, { width: columns[1].w - 12, align: 'right', lineBreak: false });
      document.text(money(item.unitAmount), columns[2].x + 6, y + 8, { width: columns[2].w - 12, align: 'right', lineBreak: false });
      document.font('Helvetica-Bold').text(money(item.amount), columns[3].x + 6, y + 8, { width: columns[3].w - 12, align: 'right', lineBreak: false });
      document.moveTo(42, y + height).lineTo(553, y + height).strokeColor(colors.line).lineWidth(.5).stroke();
      document.y = y + height;
    });

    // Totales
    ensureSpace(document, 90, `Cotización ${quote.code}`);
    let y = document.y + 12;
    const line = (label: string, value: string, bold = false) => {
      document.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(bold ? 12 : 9.5).fillColor(bold ? colors.ink : colors.muted).text(label, 340, y, { width: 118, align: 'right', lineBreak: false });
      document.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(bold ? 13 : 9.5).fillColor(colors.ink).text(value, 458, y - (bold ? 1 : 0), { width: 95, align: 'right', lineBreak: false });
      y += bold ? 24 : 17;
    };
    if (quote.discount?.amount > 0) {
      line('Subtotal', money(quote.subtotal));
      line(quote.discount.kind === 'percent' ? `Descuento (${quote.discount.value}%)` : 'Descuento', `- ${money(quote.discount.amount)}`);
    }
    document.save().roundedRect(340, y - 4, 213, 30, 8).fill(colors.pale).restore();
    y += 3; line('Total', money(quote.total), true);
    document.y = y + 6;

    if (quote.notes) {
      ensureSpace(document, 60, `Cotización ${quote.code}`);
      document.font('Helvetica-Bold').fontSize(10).fillColor(colors.ink).text('Notas', 42, document.y);
      document.font('Helvetica').fontSize(9.5).fillColor(colors.ink).text(String(quote.notes), 42, document.y + 3, { width: 511, lineGap: 2 });
      document.moveDown(0.8);
    }

    if ((quote.clauses as PdfRecord[]).length) {
      ensureSpace(document, 70, `Cotización ${quote.code}`);
      document.moveDown(0.4);
      document.font('Helvetica-Bold').fontSize(11).fillColor(colors.ink).text('Condiciones y avisos', 42, document.y);
      document.moveTo(42, document.y + 3).lineTo(553, document.y + 3).strokeColor(rose).lineWidth(.8).stroke();
      document.y += 10;
      (quote.clauses as PdfRecord[]).forEach((clause, index) => {
        const need = 22 + document.heightOfString(String(clause.body), { width: 490 });
        ensureSpace(document, need, `Cotización ${quote.code}`);
        document.font('Helvetica-Bold').fontSize(9.5).fillColor(rose).text(`${index + 1}.`, 42, document.y, { width: 18, continued: false });
        document.font('Helvetica-Bold').fontSize(9.5).fillColor(colors.ink).text(clean(clause.title), 62, document.y - 11.5, { width: 490 });
        document.font('Helvetica').fontSize(8.8).fillColor(colors.ink).text(String(clause.body), 62, document.y + 1, { width: 490, lineGap: 1.5 });
        document.y += 8;
      });
    }
    ensureSpace(document, 34, `Cotización ${quote.code}`);
    document.moveDown(0.6);
    document.font('Helvetica').fontSize(8).fillColor(colors.muted).text('Documento informativo: no es una factura ni un contrato. Los precios están en dólares estadounidenses (USD).', 42, document.y, { width: 511 });
  });
}
