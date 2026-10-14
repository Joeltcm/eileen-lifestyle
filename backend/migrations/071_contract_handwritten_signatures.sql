-- Evidencia privada de firmas manuscritas para contratos internos.
ALTER TABLE account_settings
  ADD COLUMN IF NOT EXISTS owner_signature_key text,
  ADD COLUMN IF NOT EXISTS owner_signature_updated_at timestamptz;

ALTER TABLE client_contracts
  ADD COLUMN IF NOT EXISTS client_signature_key text,
  ADD COLUMN IF NOT EXISTS client_signature_strokes_key text,
  ADD COLUMN IF NOT EXISTS signature_method text,
  ADD COLUMN IF NOT EXISTS signed_in_person_by uuid REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS owner_signature_key text;

ALTER TABLE client_contracts DROP CONSTRAINT IF EXISTS client_contracts_signature_method_check;
ALTER TABLE client_contracts ADD CONSTRAINT client_contracts_signature_method_check
  CHECK (signature_method IS NULL OR signature_method IN ('portal', 'presencial', 'papel'));

-- Incluye la nueva evidencia en la misma barrera de inmutabilidad del contrato.
DROP TRIGGER IF EXISTS client_contracts_immutable ON client_contracts;
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
    OR NEW.client_signature_key IS DISTINCT FROM OLD.client_signature_key
    OR NEW.client_signature_strokes_key IS DISTINCT FROM OLD.client_signature_strokes_key
    OR NEW.signature_method IS DISTINCT FROM OLD.signature_method
    OR NEW.signed_in_person_by IS DISTINCT FROM OLD.signed_in_person_by
    OR NEW.owner_signature_key IS DISTINCT FROM OLD.owner_signature_key
    OR NEW.status NOT IN ('firmado', 'reemplazado', 'anulado')
  ) THEN RAISE EXCEPTION 'Un contrato firmado es inmutable; genera otro contrato'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER client_contracts_immutable BEFORE UPDATE OR DELETE ON client_contracts
  FOR EACH ROW EXECUTE FUNCTION protect_signed_contract();
