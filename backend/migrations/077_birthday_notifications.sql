-- Aviso de cumpleaños de los clientes (dos días antes). Se registra con su propia clase en notification_deliveries
-- (clave idempotente por cliente y fecha de cumpleaños, así cada cumpleaños avisa una sola vez).
ALTER TABLE notification_deliveries DROP CONSTRAINT IF EXISTS notification_deliveries_kind_check;
ALTER TABLE notification_deliveries
  ADD CONSTRAINT notification_deliveries_kind_check
  CHECK (kind IN ('session', 'payment', 'pending', 'pause', 'routine_expiring', 'routine_cycle_prep', 'birthday'));
