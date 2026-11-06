-- Paso 1: Extender el CHECK de role para incluir superadmin
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('admin', 'trainer', 'client', 'superadmin'));

-- Paso 2: Crear o promover la cuenta de Joel a superadmin
INSERT INTO users (email, password_hash, full_name, role)
VALUES (
  'joelbmx22@gmail.com',
  '$2b$12$ymbxB5rRrHmc/0oon3Pg0OpOLsgH/qLZaeOUWimTW6Q3bjEHB0Eie',
  'Joel',
  'superadmin'
) ON CONFLICT (email) DO UPDATE SET role = 'superadmin', updated_at = now();

-- Paso 3: Tabla de historial de ejecuciones de facturación automática
CREATE TABLE IF NOT EXISTS billing_runs (
  id serial PRIMARY KEY,
  trigger text NOT NULL CHECK (trigger IN ('cron', 'manual', 'startup')),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  candidates_found integer NOT NULL DEFAULT 0,
  invoices_generated integer NOT NULL DEFAULT 0,
  errors jsonb,
  detail jsonb
);
