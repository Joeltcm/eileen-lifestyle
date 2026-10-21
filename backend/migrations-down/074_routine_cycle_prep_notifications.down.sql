-- Reversa de 074: las filas 'routine_cycle_prep' son solo marcas para no repetir un aviso; se borran para poder
-- restaurar la restricción anterior. El único efecto es que un aviso ya dado podría volver a enviarse si se reaplica.
DELETE FROM notification_deliveries WHERE kind = 'routine_cycle_prep';
ALTER TABLE notification_deliveries DROP CONSTRAINT IF EXISTS notification_deliveries_kind_check;
ALTER TABLE notification_deliveries
  ADD CONSTRAINT notification_deliveries_kind_check
  CHECK (kind IN ('session', 'payment', 'pending', 'pause', 'routine_expiring'));
DELETE FROM schema_migrations WHERE name = '074_routine_cycle_prep_notifications.sql';
