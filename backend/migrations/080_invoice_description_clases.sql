-- Retroactivo: agregar cantidad de clases al concepto de facturas existentes.
-- Solo toca texto descriptivo, no montos ni estados.
-- Se reemplaza el trigger de inmutabilidad temporalmente.

-- 0) Reemplazar la función del trigger por un no-op.
CREATE OR REPLACE FUNCTION billing_line_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RETURN NEW; END $$;

-- 1) Sistema nuevo: líneas que ya tienen sessions_reference
UPDATE billing_invoice_lines
SET description = description || ' (' || sessions_reference || ' clases)'
WHERE sessions_reference IS NOT NULL
  AND description NOT LIKE '%clases%'
  AND line_type = 'plan';

-- 2) Sistema nuevo: líneas SIN sessions_reference — buscar desde la
--    suscripción de facturación del beneficiario o desde su plan.
UPDATE billing_invoice_lines l
SET description = l.description || ' (' || sesiones.n || ' clases)'
FROM (
  SELECT l2.id AS line_id,
    COALESCE(
      bs.sessions_reference,
      sp.sessions_included,
      c.monthly_session_target
    ) AS n
  FROM billing_invoice_lines l2
  JOIN billing_invoices i ON i.id = l2.invoice_id
  JOIN clients c ON c.id = l2.beneficiary_client_id
  LEFT JOIN billing_subscriptions bs
    ON bs.beneficiary_client_id = l2.beneficiary_client_id
    AND bs.payer_client_id = i.payer_client_id
    AND bs.starts_on <= i.cycle_start
    AND (bs.ends_on IS NULL OR bs.ends_on >= i.cycle_start)
  LEFT JOIN service_plans sp ON sp.id = c.plan_id
  WHERE l2.sessions_reference IS NULL
    AND l2.description NOT LIKE '%clases%'
    AND l2.line_type = 'plan'
    AND COALESCE(bs.sessions_reference, sp.sessions_included, c.monthly_session_target) IS NOT NULL
    AND COALESCE(bs.sessions_reference, sp.sessions_included, c.monthly_session_target) > 0
) sesiones
WHERE l.id = sesiones.line_id;

-- 3) Además, poblar sessions_reference en las líneas que no lo tenían
--    para que futuras regeneraciones lo conserven.
UPDATE billing_invoice_lines l
SET sessions_reference = sesiones.n
FROM (
  SELECT l2.id AS line_id,
    COALESCE(
      bs.sessions_reference,
      sp.sessions_included,
      c.monthly_session_target
    ) AS n
  FROM billing_invoice_lines l2
  JOIN billing_invoices i ON i.id = l2.invoice_id
  JOIN clients c ON c.id = l2.beneficiary_client_id
  LEFT JOIN billing_subscriptions bs
    ON bs.beneficiary_client_id = l2.beneficiary_client_id
    AND bs.payer_client_id = i.payer_client_id
    AND bs.starts_on <= i.cycle_start
    AND (bs.ends_on IS NULL OR bs.ends_on >= i.cycle_start)
  LEFT JOIN service_plans sp ON sp.id = c.plan_id
  WHERE l2.sessions_reference IS NULL
    AND l2.line_type = 'plan'
    AND COALESCE(bs.sessions_reference, sp.sessions_included, c.monthly_session_target) IS NOT NULL
    AND COALESCE(bs.sessions_reference, sp.sessions_included, c.monthly_session_target) > 0
) sesiones
WHERE l.id = sesiones.line_id;

-- 4) Restaurar la función original del trigger.
CREATE OR REPLACE FUNCTION billing_line_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Las líneas de una factura emitida no se editan' USING ERRCODE = 'restrict_violation';
END $$;

-- 5) Poblar sessions_reference en suscripciones que no lo tenían,
--    para que el generador futuro produzca descripciones con clases.
UPDATE billing_subscriptions bs
SET sessions_reference = COALESCE(sp.sessions_included, c.monthly_session_target)
FROM clients c
LEFT JOIN service_plans sp ON sp.id = c.plan_id
WHERE c.id = bs.beneficiary_client_id
  AND bs.sessions_reference IS NULL
  AND COALESCE(sp.sessions_included, c.monthly_session_target) IS NOT NULL
  AND COALESCE(sp.sessions_included, c.monthly_session_target) > 0;

-- 6) Sistema legado: invoices.concept para mensualidades con paquete asociado
UPDATE invoices i
SET concept = i.concept || ' (' || sp.total_sessions || ' clases)'
FROM session_packages sp
WHERE sp.origin_invoice_id = i.id
  AND sp.total_sessions > 0
  AND i.concept NOT LIKE '%clases%'
  AND i.concept LIKE '%Mensualidad%';
