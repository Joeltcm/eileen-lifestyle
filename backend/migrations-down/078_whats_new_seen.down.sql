-- Quitar la marca de novedades vistas: solo es una comodidad; al volver a subir, se vuelven a mostrar las novedades.
BEGIN;
ALTER TABLE users DROP COLUMN IF EXISTS whats_new_seen;
COMMIT;
