-- Retroactivo: agregar cantidad de clases al concepto de facturas existentes.
-- Solo toca texto descriptivo, no montos ni estados.

-- Sistema nuevo: billing_invoice_lines con sessions_reference
UPDATE billing_invoice_lines
SET description = description || ' (' || sessions_reference || ' clases)'
WHERE sessions_reference IS NOT NULL
  AND description NOT LIKE '%clases%'
  AND line_type = 'plan';

-- Sistema legado: invoices.concept para mensualidades con paquete asociado
UPDATE invoices i
SET concept = i.concept || ' (' || sp.total_sessions || ' clases)'
FROM session_packages sp
WHERE sp.origin_invoice_id = i.id
  AND sp.total_sessions > 0
  AND i.concept NOT LIKE '%clases%'
  AND i.concept LIKE '%Mensualidad%';
