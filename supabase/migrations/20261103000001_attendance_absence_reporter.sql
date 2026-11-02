-- Add absence_reporter and absence_reported_at columns to attendance table
ALTER TABLE attendance
  ADD COLUMN IF NOT EXISTS absence_reporter text,
  ADD COLUMN IF NOT EXISTS absence_reported_at timestamptz;
