-- Macro targets on Home: protein/carbs/fat previously showed raw totals
-- with nothing to compare against, unlike calories which already had
-- daily_calorie_target. Computed and stored the same way and at the same
-- time as daily_calorie_target (profile save), not recomputed on every
-- fetch.

ALTER TABLE user_profiles ADD COLUMN protein_target_g INTEGER;
ALTER TABLE user_profiles ADD COLUMN carbs_target_g INTEGER;
ALTER TABLE user_profiles ADD COLUMN fat_target_g INTEGER;
