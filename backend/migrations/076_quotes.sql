-- Cotizador de Eileen: propuestas informativas para clientes (o personas que aún no lo son) con cláusulas aplicables.
-- Una cotización NO es una factura ni un contrato y no se convierte en factura. Las cláusulas viven en una biblioteca
-- editable (quote_clauses); cada cotización guarda una FOTO del texto de las que aplicó, de modo que editar la biblioteca
-- no cambia lo que ya se le mostró a un cliente.
CREATE TABLE IF NOT EXISTS quote_clauses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (char_length(title) BETWEEN 2 AND 120),
  body text NOT NULL CHECK (char_length(body) BETWEEN 2 AND 2000),
  category text NOT NULL DEFAULT 'general' CHECK (category IN ('general', 'pago', 'servicio', 'cancelaciones', 'salud', 'datos')),
  icon text NOT NULL DEFAULT '📌' CHECK (char_length(icon) BETWEEN 1 AND 8),
  default_on boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS quote_clauses_owner_idx ON quote_clauses(owner_id, active, sort_order);

CREATE TABLE IF NOT EXISTS quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  number integer NOT NULL CHECK (number > 0),
  client_id uuid REFERENCES clients(id) ON DELETE SET NULL,
  prospect_name text CHECK (prospect_name IS NULL OR char_length(prospect_name) BETWEEN 1 AND 120),
  prospect_email text CHECK (prospect_email IS NULL OR char_length(prospect_email) <= 160),
  prospect_phone text CHECK (prospect_phone IS NULL OR char_length(prospect_phone) <= 40),
  title text NOT NULL DEFAULT 'Propuesta de entrenamiento' CHECK (char_length(title) BETWEEN 2 AND 140),
  intro text CHECK (intro IS NULL OR char_length(intro) <= 1500),
  notes text CHECK (notes IS NULL OR char_length(notes) <= 1500),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'accepted', 'declined')),
  issued_on date NOT NULL,
  valid_until date NOT NULL,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  discount_kind text NOT NULL DEFAULT 'none' CHECK (discount_kind IN ('none', 'percent', 'amount')),
  discount_value numeric(12, 2) NOT NULL DEFAULT 0 CHECK (discount_value >= 0),
  subtotal numeric(12, 2) NOT NULL DEFAULT 0,
  discount_amount numeric(12, 2) NOT NULL DEFAULT 0,
  total numeric(12, 2) NOT NULL DEFAULT 0,
  clauses jsonb NOT NULL DEFAULT '[]'::jsonb,
  share_token text UNIQUE,   -- enlace público de solo lectura; se guarda para poder volver a copiarlo (192 bits, no adivinable)
  shared_at timestamptz,
  viewed_at timestamptz,
  view_count integer NOT NULL DEFAULT 0,
  sent_at timestamptz,
  responded_at timestamptz,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, number),
  CHECK (valid_until >= issued_on),
  CHECK (client_id IS NOT NULL OR prospect_name IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS quotes_owner_idx ON quotes(owner_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS quotes_client_idx ON quotes(client_id) WHERE client_id IS NOT NULL;

-- Las cláusulas de ejemplo se siembran una sola vez por cuenta (la primera vez que se abre el cotizador).
ALTER TABLE account_settings ADD COLUMN IF NOT EXISTS quote_clauses_seeded_at timestamptz;
