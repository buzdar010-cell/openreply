-- Testing/QA needs to judge whether the AI got a match right, not just see
-- the final resolved nutrition numbers. Adds the AI's actual decision
-- (confidence + what alternates it considered) and a photo reference to
-- both matched and unmatched logs, so every submission -- photo or text,
-- matched or not -- can be reviewed against what it was actually judging.

ALTER TABLE logs ADD COLUMN confidence TEXT;
ALTER TABLE logs ADD COLUMN alt_candidates_json TEXT;
ALTER TABLE logs ADD COLUMN photo_key TEXT;

ALTER TABLE unmatched_logs ADD COLUMN photo_key TEXT;
