-- Quitar el bono desvincula las asignaciones (pierden su ventana) y las facturas 'rutina_suelta' no caben en la
-- restricción anterior. Exige orden expresa si ya existe algún bono o alguna factura de esa clase.
BEGIN;
DO $$
BEGIN
  IF (EXISTS (SELECT 1 FROM routine_entitlements) OR EXISTS (SELECT 1 FROM billing_invoices WHERE kind = 'rutina_suelta'))
     AND COALESCE(current_setting('billing.allow_destructive_down', true), '') <> 'on' THEN
    RAISE EXCEPTION 'hay rutinas sueltas vendidas o facturadas; la reversa 075 exige orden expresa con billing.allow_destructive_down = on';
  END IF;
END $$;
-- La clase de una factura emitida está protegida por billing_invoices_guard; con la orden expresa se reclasifica a 'manual'
-- (solo cambia su etiqueta: importe, número, líneas y cobros quedan intactos) y se vuelve a activar la guarda.
ALTER TABLE billing_invoices DISABLE TRIGGER billing_invoices_guard;
UPDATE billing_invoices SET kind = 'manual' WHERE kind = 'rutina_suelta';
ALTER TABLE billing_invoices ENABLE TRIGGER billing_invoices_guard;
ALTER TABLE billing_invoices DROP CONSTRAINT IF EXISTS billing_invoices_kind_check;
ALTER TABLE billing_invoices ADD CONSTRAINT billing_invoices_kind_check
  CHECK (kind IN ('mensual', 'credito', 'clase_suelta', 'paquete', 'manual'));
ALTER TABLE routine_assignments DROP CONSTRAINT IF EXISTS routine_assignments_entitlement_due_check;
DROP INDEX IF EXISTS routine_assignments_entitlement_idx;
ALTER TABLE routine_assignments DROP COLUMN IF EXISTS entitlement_id;
DROP TABLE IF EXISTS routine_entitlements;
DELETE FROM schema_migrations WHERE name = '075_routine_entitlements.sql';
COMMIT;
