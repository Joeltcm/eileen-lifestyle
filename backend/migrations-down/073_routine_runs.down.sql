-- Quitar run_number fusionaría o destruiría ejecuciones distintas. La reversa
-- exige una orden expresa si ya se registró actividad posterior a la ejecución
-- histórica n.º 1, o si existen los nuevos metadatos de cierre/asignación.
BEGIN;

DO $$
BEGIN
  IF (
    EXISTS (SELECT 1 FROM routine_completions WHERE run_number <> 1 OR completed_at IS NOT NULL OR assignment_id IS NOT NULL)
    OR EXISTS (SELECT 1 FROM routine_exercise_completions WHERE run_number <> 1)
    OR EXISTS (SELECT 1 FROM routine_timer_sessions WHERE run_number <> 1)
    OR EXISTS (SELECT 1 FROM routine_activity_notifications WHERE run_number <> 1)
  ) AND COALESCE(current_setting('billing.allow_destructive_down', true), '') <> 'on' THEN
    RAISE EXCEPTION 'hay ejecuciones de rutina con número, hora o asignación; la reversa 073 exige orden expresa con billing.allow_destructive_down = on';
  END IF;
END $$;

ALTER TABLE routine_completions
  DROP CONSTRAINT IF EXISTS routine_completions_routine_client_day_run_key,
  ADD CONSTRAINT routine_completions_routine_id_client_id_completed_on_key UNIQUE (routine_id, client_id, completed_on);
ALTER TABLE routine_exercise_completions
  DROP CONSTRAINT IF EXISTS routine_exercise_run_unique,
  ADD CONSTRAINT routine_exercise_completions_routine_id_client_id_completed_key UNIQUE (routine_id, client_id, completed_on, exercise_index);
ALTER TABLE routine_timer_sessions
  DROP CONSTRAINT IF EXISTS routine_timer_sessions_routine_client_day_run_key,
  ADD CONSTRAINT routine_timer_sessions_routine_id_client_id_completed_on_key UNIQUE (routine_id, client_id, completed_on);
ALTER TABLE routine_activity_notifications
  DROP CONSTRAINT IF EXISTS routine_activity_run_unique,
  ADD CONSTRAINT routine_activity_notification_owner_id_routine_id_client_id_key UNIQUE (owner_id, routine_id, client_id, completed_on, kind);

DROP INDEX IF EXISTS routine_timer_sessions_client_day_run_idx;
DROP INDEX IF EXISTS routine_completions_client_day_run_idx;

ALTER TABLE routine_activity_notifications DROP CONSTRAINT IF EXISTS routine_activity_notifications_run_number_check;
ALTER TABLE routine_activity_notifications DROP COLUMN IF EXISTS run_number;
ALTER TABLE routine_timer_sessions DROP CONSTRAINT IF EXISTS routine_timer_sessions_run_number_check;
ALTER TABLE routine_timer_sessions DROP COLUMN IF EXISTS run_number;
ALTER TABLE routine_exercise_completions DROP CONSTRAINT IF EXISTS routine_exercise_completions_run_number_check;
ALTER TABLE routine_exercise_completions DROP COLUMN IF EXISTS run_number;
ALTER TABLE routine_completions DROP CONSTRAINT IF EXISTS routine_completions_run_number_check;
ALTER TABLE routine_completions DROP COLUMN IF EXISTS assignment_id;
ALTER TABLE routine_completions DROP COLUMN IF EXISTS completed_at;
ALTER TABLE routine_completions DROP COLUMN IF EXISTS run_number;

DELETE FROM schema_migrations WHERE name = '073_routine_runs.sql';
COMMIT;
