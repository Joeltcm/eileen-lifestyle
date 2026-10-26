-- Aviso de novedades: cada usuaria del personal recuerda hasta qué novedad ya vio (así sale una sola vez aunque use varios aparatos).
ALTER TABLE users ADD COLUMN IF NOT EXISTS whats_new_seen text;
