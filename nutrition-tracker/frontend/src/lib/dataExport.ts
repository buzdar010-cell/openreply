import type { Profile, LogListItem } from './api';

/**
 * The full-fidelity backup, distinct from the CSV export in Logs (which is
 * deliberately just food-log rows, for opening in a spreadsheet). This is
 * "everything an account holds" -- profile, goals, streak/XP state, and the
 * complete log history -- as one portable JSON file. Real accounts already
 * make cross-device recovery a non-issue (just log back in), so this covers
 * what's left: taking your own data out of the app entirely if you want it.
 */
export function buildFullDataExportJson(profile: Profile | null, logs: LogListItem[]): string {
  const payload = {
    exportedAt: new Date().toISOString(),
    profile: profile
      ? {
          weight_kg: profile.weight_kg,
          height_cm: profile.height_cm,
          age: profile.age,
          gender: profile.gender,
          activity_level: profile.activity_level,
          goal: profile.goal,
          daily_calorie_target: profile.daily_calorie_target,
          gamification_enabled: profile.gamification_enabled === 1,
          current_streak: profile.current_streak,
          longest_streak: profile.longest_streak,
          last_logged_date: profile.last_logged_date,
          xp: profile.xp,
        }
      : null,
    logs: logs.map((l) => ({
      loggedAt: new Date(l.logged_at * 1000).toISOString(),
      dish: l.free_text_description ?? l.dish_id,
      quantity: l.quantity,
      kcal: l.kcal,
      protein_g: l.protein_g,
      carbs_g: l.carbs_g,
      fat_g: l.fat_g,
      fiber_g: l.fiber_g,
      sugar_g: l.sugar_g,
      sodium_mg: l.sodium_mg,
    })),
  };
  return JSON.stringify(payload, null, 2);
}
