-- Contratos de prueba (Joel, 14-10-2026): se marcan al generarlos y SOLO esos se pueden borrar aunque ya estén firmados.
-- Un contrato real firmado sigue siendo inmutable e imborrable. La marca misma tampoco puede cambiar tras la firma.
ALTER TABLE client_contracts ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION protect_signed_contract() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.signed_at IS NOT NULL AND NOT OLD.is_test THEN RAISE EXCEPTION 'Un contrato firmado no se borra'; END IF;
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
    OR NEW.is_test IS DISTINCT FROM OLD.is_test
    OR NEW.status NOT IN ('firmado', 'reemplazado', 'anulado')
  ) THEN RAISE EXCEPTION 'Un contrato firmado es inmutable; genera otro contrato'; END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION protect_contract_document() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM client_contracts WHERE pdf_document_id = OLD.id AND signed_at IS NOT NULL AND NOT is_test) THEN
    RAISE EXCEPTION 'El documento de un contrato firmado es inmutable';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
