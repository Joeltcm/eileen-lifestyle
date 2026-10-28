-- Complemento de 081: para clientes sin sessions_included ni monthly_session_target,
-- buscar el total_sessions del session_package más reciente (kind = 'monthly').

-- 0) Reemplazar la función del trigger por un no-op.
CREATE OR REPLACE FUNCTION billing_line_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RETURN NEW; END $$;

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
FROM (
  SELECT DISTINCT ON (sp2.client_id)
    sp2.client_id, sp2.total_sessions
  FROM session_packages sp2
  WHERE sp2.kind = 'monthly' AND sp2.total_sessions > 0
  ORDER BY sp2.client_id, sp2.purchased_on DESC, sp2.created_at DESC
) paq
WHERE paq.client_id = l.beneficiary_client_id
  AND l.sessions_reference IS NULL
  AND l.line_type = 'plan';

-- 3) Actualizar la descripción de las líneas que ahora tienen sessions_reference.
UPDATE billing_invoice_lines
SET description = description || ' (' || sessions_reference || ' clases)'
WHERE sessions_reference IS NOT NULL
  AND description NOT LIKE '%clases%'
  AND line_type = 'plan';

-- 4) Restaurar la función original del trigger.
CREATE OR REPLACE FUNCTION billing_line_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Las líneas de una factura emitida no se editan' USING ERRCODE = 'restrict_violation';
END $$;
