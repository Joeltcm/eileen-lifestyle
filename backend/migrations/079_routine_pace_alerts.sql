-- Alertas de ritmo de rutinas: avisa a la entrenadora cuando un cliente con
-- plan de rutinas se atrasa en el cumplimiento, o cuando una rutina de viaje
-- lleva 3+ días sin completarse.
ALTER TABLE notification_deliveries DROP CONSTRAINT IF EXISTS notification_deliveries_kind_check;
ALTER TABLE notification_deliveries
  ADD CONSTRAINT notification_deliveries_kind_check
  CHECK (kind IN ('session', 'payment', 'pending', 'pause', 'routine_expiring',
                  'routine_cycle_prep', 'birthday', 'routine_pace', 'travel_overdue'));
