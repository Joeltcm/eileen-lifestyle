-- Fix 1: Admitir 'viewed' en routine_activity_notifications
ALTER TABLE routine_activity_notifications
  DROP CONSTRAINT IF EXISTS routine_activity_notifications_kind_check;

ALTER TABLE routine_activity_notifications
  ADD CONSTRAINT routine_activity_notifications_kind_check
  CHECK (kind IN ('started', 'completed', 'feedback', 'expired', 'viewed'));

-- Fix 3: Garantizar superadmin en producción (la 084 editada no vuelve a correr)
UPDATE users SET role = 'superadmin', updated_at = now()
WHERE email = 'joelbmx22@gmail.com' AND role != 'superadmin';
