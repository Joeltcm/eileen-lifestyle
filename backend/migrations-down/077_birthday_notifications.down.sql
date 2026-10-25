-- Quitar la clase 'birthday': se borran las entregas de esa clase (solo son marcas para no repetir un aviso) y se
-- restablece la restricción anterior.
BEGIN;
DELETE FROM notification_deliveries WHERE kind = 'birthday';
ALTER TABLE notification_deliveries DROP CONSTRAINT IF EXISTS notification_deliveries_kind_check;
ALTER TABLE notification_deliveries
  ADD CONSTRAINT notification_deliveries_kind_check
  CHECK (kind IN ('session', 'payment', 'pending', 'pause', 'routine_expiring', 'routine_cycle_prep'));
COMMIT;
