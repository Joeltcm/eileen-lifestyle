-- Rutinas sueltas: Eileen vende 1 o un grupo de rutinas con una ventana de disponibilidad (desde-hasta), como una
-- venta puntual (igual que la clase suelta) y sin cambiar el plan del cliente. El "bono" (routine_entitlements)
-- guarda cuántas rutinas y de cuándo a cuándo; las rutinas que se le asignan con cargo al bono llevan su
-- entitlement_id y viven solo dentro de esa ventana.
CREATE TABLE IF NOT EXISTS routine_entitlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  quantity integer NOT NULL CHECK (quantity BETWEEN 1 AND 100),
  available_from date NOT NULL,
  available_until date NOT NULL,
  unit_amount numeric(12, 2) NOT NULL DEFAULT 0 CHECK (unit_amount >= 0),
  invoice_id uuid REFERENCES billing_invoices(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled')),
  notes text,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (available_until >= available_from)
);
CREATE INDEX IF NOT EXISTS routine_entitlements_client_idx ON routine_entitlements(client_id, status, available_until);
CREATE INDEX IF NOT EXISTS routine_entitlements_invoice_idx ON routine_entitlements(invoice_id) WHERE invoice_id IS NOT NULL;

ALTER TABLE routine_assignments ADD COLUMN IF NOT EXISTS entitlement_id uuid REFERENCES routine_entitlements(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS routine_assignments_entitlement_idx ON routine_assignments(entitlement_id) WHERE entitlement_id IS NOT NULL;
ALTER TABLE routine_assignments ADD CONSTRAINT routine_assignments_entitlement_due_check CHECK (entitlement_id IS NULL OR due_on IS NOT NULL);

-- La factura de una venta de rutinas sueltas es una factura puntual con su propia clase.
ALTER TABLE billing_invoices DROP CONSTRAINT IF EXISTS billing_invoices_kind_check;
ALTER TABLE billing_invoices ADD CONSTRAINT billing_invoices_kind_check
  CHECK (kind IN ('mensual', 'credito', 'clase_suelta', 'paquete', 'manual', 'rutina_suelta'));
