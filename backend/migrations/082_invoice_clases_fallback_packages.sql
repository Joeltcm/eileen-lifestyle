-- Complemento de 081: para clientes sin sessions_included ni monthly_session_target,
-- buscar el total_sessions del session_package más reciente (kind = 'monthly').
-- Se desactiva el trigger de inmutabilidad porque este cambio es solo texto.

ALTER TABLE billing_invoice_lines DISABLE TRIGGER ALL;

-- 1) Poblar sessions_reference en suscripciones desde session_packages.
UPDATE billing_subscriptions bs
SET sessions_reference = paq.total_sessions
FROM (
  SELECT DISTINCT ON (sp2.client_id)
    sp2.client_id, sp2.total_sessions
  FROM session_packages sp2
  WHERE sp2.kind = 'monthly' AND sp2.total_sessions > 0
  ORDER BY sp2.client_id, sp2.purchased_on DESC, sp2.created_at DESC
) paq
WHERE paq.client_id = bs.beneficiary_client_id
  AND bs.sessions_reference IS NULL
  AND paq.total_sessions > 0;

-- 2) Poblar sessions_reference en líneas de factura desde session_packages.
UPDATE billing_invoice_lines l
SET sessions_reference = paq.total_sessions
FROM billing_invoices i,
LATERAL (
  SELECT sp2.total_sessions
  FROM session_packages sp2
  WHERE sp2.client_id = l.beneficiary_client_id
    AND sp2.kind = 'monthly'
    AND sp2.total_sessions > 0
  ORDER BY sp2.purchased_on DESC, sp2.created_at DESC
  LIMIT 1
) paq
WHERE i.id = l.invoice_id
  AND l.sessions_reference IS NULL
  AND l.line_type = 'plan';

-- 3) Actualizar la descripción de las líneas que ahora tienen sessions_reference.
UPDATE billing_invoice_lines
SET description = description || ' (' || sessions_reference || ' clases)'
WHERE sessions_reference IS NOT NULL
  AND description NOT LIKE '%clases%'
  AND line_type = 'plan';

ALTER TABLE billing_invoice_lines ENABLE TRIGGER ALL;
