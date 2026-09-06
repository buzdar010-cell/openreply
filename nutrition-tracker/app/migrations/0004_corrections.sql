-- Lets a wrong AI match be corrected after the fact. original_dish_id
-- preserves what the AI actually guessed (only set on the first
-- correction, never overwritten by a second one) so accuracy can be
-- measured over time, not just fixed one row at a time.

ALTER TABLE logs ADD COLUMN original_dish_id TEXT;
ALTER TABLE logs ADD COLUMN corrected INTEGER NOT NULL DEFAULT 0;
