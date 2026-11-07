-- Paso 1: Extender el CHECK de role para incluir superadmin
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('admin', 'trainer', 'client', 'superadmin'));

-- Paso 2: Promover la cuenta de Joel a superadmin (solo si ya existe)
UPDATE users SET role = 'superadmin', updated_at = now()
WHERE email = 'joelbmx22@gmail.com';

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
