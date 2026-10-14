BEGIN;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM client_contracts WHERE client_signature_key IS NOT NULL OR client_signature_strokes_key IS NOT NULL OR signature_method IS NOT NULL OR signed_in_person_by IS NOT NULL OR owner_signature_key IS NOT NULL)
     OR EXISTS (SELECT 1 FROM account_settings WHERE owner_signature_key IS NOT NULL)
     OR EXISTS (SELECT 1 FROM client_contracts WHERE template_key = 'credito')
  THEN
    IF COALESCE(current_setting('billing.allow_destructive_down', true), '') <> 'on' THEN
      RAISE EXCEPTION 'hay firmas manuscritas; la reversa 071 exige orden expresa con billing.allow_destructive_down = on';
    END IF;
  END IF;
END $$;

DROP TRIGGER IF EXISTS client_contracts_immutable ON client_contracts;
DROP FUNCTION IF EXISTS protect_signed_contract();
ALTER TABLE client_contracts DROP CONSTRAINT IF EXISTS client_contracts_signature_method_check;
DELETE FROM client_contracts WHERE template_key = 'credito' AND signed_at IS NULL;
ALTER TABLE client_contracts DROP CONSTRAINT IF EXISTS client_contracts_template_key_check;
ALTER TABLE client_contracts ADD CONSTRAINT client_contracts_template_key_check CHECK (template_key IN ('mensualidad', 'paquete', 'rutinas'));
ALTER TABLE client_contracts DROP COLUMN IF EXISTS owner_signature_key;
ALTER TABLE client_contracts DROP COLUMN IF EXISTS signed_in_person_by;
ALTER TABLE client_contracts DROP COLUMN IF EXISTS signature_method;
ALTER TABLE client_contracts DROP COLUMN IF EXISTS client_signature_strokes_key;
ALTER TABLE client_contracts DROP COLUMN IF EXISTS client_signature_key;
ALTER TABLE account_settings DROP COLUMN IF EXISTS owner_signature_updated_at;
ALTER TABLE account_settings DROP COLUMN IF EXISTS owner_signature_key;

CREATE OR REPLACE FUNCTION protect_signed_contract() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.signed_at IS NOT NULL THEN RAISE EXCEPTION 'Un contrato firmado no se borra'; END IF;
    RETURN OLD;
  END IF;
  IF OLD.signed_at IS NOT NULL AND (
    NEW.values IS DISTINCT FROM OLD.values OR NEW.body_text IS DISTINCT FROM OLD.body_text
    OR NEW.owner_id IS DISTINCT FROM OLD.owner_id OR NEW.client_id IS DISTINCT FROM OLD.client_id
    OR NEW.template_key IS DISTINCT FROM OLD.template_key OR NEW.template_version IS DISTINCT FROM OLD.template_version
    OR NEW.signed_at IS DISTINCT FROM OLD.signed_at OR NEW.signed_name IS DISTINCT FROM OLD.signed_name
    OR NEW.signed_ip IS DISTINCT FROM OLD.signed_ip OR NEW.signed_user_agent IS DISTINCT FROM OLD.signed_user_agent
    OR NEW.guardian_name IS DISTINCT FROM OLD.guardian_name OR NEW.guardian_id IS DISTINCT FROM OLD.guardian_id
    OR NEW.pdf_document_id IS DISTINCT FROM OLD.pdf_document_id OR NEW.pdf_sha256 IS DISTINCT FROM OLD.pdf_sha256
    OR NEW.status NOT IN ('firmado', 'reemplazado', 'anulado')
  ) THEN RAISE EXCEPTION 'Un contrato firmado es inmutable; genera otro contrato'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER client_contracts_immutable BEFORE UPDATE OR DELETE ON client_contracts
  FOR EACH ROW EXECUTE FUNCTION protect_signed_contract();

DELETE FROM schema_migrations WHERE name = '071_contract_handwritten_signatures.sql';
COMMIT;
