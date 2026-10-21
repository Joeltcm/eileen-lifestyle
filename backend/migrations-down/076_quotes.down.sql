-- Quitar el cotizador borra las cotizaciones y la biblioteca de cláusulas. Exige orden expresa si existe alguna cotización
-- o cláusula propia (las de ejemplo sin tocar no cuentan como pérdida, pero se valida con la misma orden para no adivinar).
BEGIN;
DO $$
BEGIN
  IF (EXISTS (SELECT 1 FROM quotes) OR EXISTS (SELECT 1 FROM quote_clauses))
     AND COALESCE(current_setting('billing.allow_destructive_down', true), '') <> 'on' THEN
    RAISE EXCEPTION 'hay cotizaciones o cláusulas guardadas; la reversa 076 exige orden expresa con billing.allow_destructive_down = on';
  END IF;
END $$;
ALTER TABLE account_settings DROP COLUMN IF EXISTS quote_clauses_seeded_at;
DROP TABLE IF EXISTS quotes;
DROP TABLE IF EXISTS quote_clauses;
DELETE FROM schema_migrations WHERE name = '076_quotes.sql';
COMMIT;
