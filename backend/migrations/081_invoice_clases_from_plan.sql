-- Complemento de 080: actualizar descripciones de líneas que no tenían
-- sessions_reference, buscando desde la suscripción o el plan del cliente.

-- 1) Poblar sessions_reference en suscripciones que no lo tenían.
UPDATE billing_subscriptions bs
SET sessions_reference = COALESCE(sp.sessions_included, c.monthly_session_target)
FROM clients c
LEFT JOIN service_plans sp ON sp.id = c.plan_id
WHERE c.id = bs.beneficiary_client_id
  AND bs.sessions_reference IS NULL
  AND COALESCE(sp.sessions_included, c.monthly_session_target) IS NOT NULL
  AND COALESCE(sp.sessions_included, c.monthly_session_target) > 0;

-- 2) Poblar sessions_reference en líneas de factura que no lo tenían.
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

-- 3) Actualizar la descripción de las líneas que aún no dicen "clases".
UPDATE billing_invoice_lines
SET description = description || ' (' || sessions_reference || ' clases)'
WHERE sessions_reference IS NOT NULL
  AND description NOT LIKE '%clases%'
  AND line_type = 'plan';
