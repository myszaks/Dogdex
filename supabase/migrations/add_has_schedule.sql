-- Add has_schedule flag to events table
-- Controls whether the "Grafik" (schedule) button is shown for an event

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS has_schedule boolean NOT NULL DEFAULT false;
