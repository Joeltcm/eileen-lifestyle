-- A2: una misma rutina puede realizarse más de una vez en el mismo día.
-- Las filas existentes siguen siendo la ejecución 1; no se reconstruye ni se
-- altera su actividad histórica. `completed_at` sólo se escribe en cierres
-- nuevos por el servidor y assignment_id conserva la asignación efectiva.
ALTER TABLE routine_completions
  ADD COLUMN IF NOT EXISTS run_number smallint NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS assignment_id uuid REFERENCES routine_assignments(id) ON DELETE SET NULL;
ALTER TABLE routine_completions
  ADD CONSTRAINT routine_completions_run_number_check CHECK (run_number >= 1);

ALTER TABLE routine_exercise_completions
  ADD COLUMN IF NOT EXISTS run_number smallint NOT NULL DEFAULT 1;
ALTER TABLE routine_exercise_completions
  ADD CONSTRAINT routine_exercise_completions_run_number_check CHECK (run_number >= 1);

ALTER TABLE routine_timer_sessions
  ADD COLUMN IF NOT EXISTS run_number smallint NOT NULL DEFAULT 1;
ALTER TABLE routine_timer_sessions
  ADD CONSTRAINT routine_timer_sessions_run_number_check CHECK (run_number >= 1);

ALTER TABLE routine_activity_notifications
  ADD COLUMN IF NOT EXISTS run_number smallint NOT NULL DEFAULT 1;
ALTER TABLE routine_activity_notifications
  ADD CONSTRAINT routine_activity_notifications_run_number_check CHECK (run_number >= 1);

-- Estos son los nombres reales que PostgreSQL asignó a los UNIQUE sin nombre
-- explícito de las migraciones 007, 057, 058 y 059. Los dos más largos se
-- acortaron al crearse; por eso se usan los nombres efectivos de pg_constraint.
-- Todo ocurre en la misma transacción: no existe una ventana sin una llave de
-- idempotencia.
ALTER TABLE routine_completions
  DROP CONSTRAINT routine_completions_routine_id_client_id_completed_on_key,
  ADD CONSTRAINT routine_completions_routine_client_day_run_key UNIQUE (routine_id, client_id, completed_on, run_number);
ALTER TABLE routine_exercise_completions
  DROP CONSTRAINT routine_exercise_completions_routine_id_client_id_completed_key,
  ADD CONSTRAINT routine_exercise_run_unique UNIQUE (routine_id, client_id, completed_on, run_number, exercise_index);
ALTER TABLE routine_timer_sessions
  DROP CONSTRAINT routine_timer_sessions_routine_id_client_id_completed_on_key,
  ADD CONSTRAINT routine_timer_sessions_routine_client_day_run_key UNIQUE (routine_id, client_id, completed_on, run_number);
ALTER TABLE routine_activity_notifications
  DROP CONSTRAINT routine_activity_notification_owner_id_routine_id_client_id_key,
  ADD CONSTRAINT routine_activity_run_unique UNIQUE (owner_id, routine_id, client_id, completed_on, run_number, kind);

CREATE INDEX IF NOT EXISTS routine_completions_client_day_run_idx
  ON routine_completions(client_id, completed_on DESC, run_number DESC);
CREATE INDEX IF NOT EXISTS routine_timer_sessions_client_day_run_idx
  ON routine_timer_sessions(client_id, completed_on DESC, run_number DESC);
