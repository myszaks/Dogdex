-- Migration: features 7 and 11 (auto_confirm, max_participants)
-- Run this in Supabase SQL Editor

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS auto_confirm boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS max_participants integer;
