/**
 * Turns a profile (weight/height/age/gender/activity/goal) into a daily
 * calorie target -- replaces the hardcoded 2000 kcal every user previously
 * saw regardless of who they are.
 *
 * Standard, well-established formula (Mifflin-St Jeor for BMR, activity
 * multiplier for TDEE, +/-500 kcal for a ~1lb/week goal) -- not something
 * this app invented, and not something to change without a real reason.
 */

export type Gender = "male" | "female";
export type ActivityLevel = "sedentary" | "light" | "moderate" | "active" | "very_active";
export type Goal = "lose" | "maintain" | "gain";

export interface ProfileInput {
  weight_kg: number;
  height_cm: number;
  age: number;
  gender: Gender;
  activity_level: ActivityLevel;
  goal: Goal;
}

const ACTIVITY_MULTIPLIER: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

const GOAL_ADJUSTMENT_KCAL: Record<Goal, number> = {
  lose: -500,
  maintain: 0,
  gain: 500,
};

export function calculateDailyCalorieTarget(p: ProfileInput): number {
  const bmr =
    p.gender === "male"
      ? 10 * p.weight_kg + 6.25 * p.height_cm - 5 * p.age + 5
      : 10 * p.weight_kg + 6.25 * p.height_cm - 5 * p.age - 161;

  const tdee = bmr * ACTIVITY_MULTIPLIER[p.activity_level];
  const target = tdee + GOAL_ADJUSTMENT_KCAL[p.goal];

  // Never return an unsafely low target regardless of inputs -- a floor
  // matching the generally-recognized minimum safe intake.
  return Math.round(Math.max(1200, target));
}

export interface MacroTargets {
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

/**
 * Protein by bodyweight (1.6 g/kg -- a standard general-purpose target,
 * not just an athlete's number) rather than a fixed % of calories, since
 * protein need tracks body mass more than it tracks total energy intake.
 * Fat at 30% of calories (within the commonly-recommended 20-35% range).
 * Carbs get whatever's left -- the same "remainder" approach used by
 * every mainstream macro calculator, not something invented here.
 */
export function calculateMacroTargets(dailyCalorieTarget: number, weightKg: number): MacroTargets {
  const protein_g = Math.round(1.6 * weightKg);
  const proteinKcal = protein_g * 4;

  const fatKcal = 0.3 * dailyCalorieTarget;
  const fat_g = Math.round(fatKcal / 9);

  const carbsKcal = Math.max(0, dailyCalorieTarget - proteinKcal - fatKcal);
  const carbs_g = Math.round(carbsKcal / 4);

  return { protein_g, carbs_g, fat_g };
}

export function isValidProfileInput(body: unknown): body is ProfileInput {
  if (typeof body !== "object" || body === null) return false;
  const p = body as Record<string, unknown>;
  return (
    typeof p.weight_kg === "number" &&
    p.weight_kg > 0 &&
    p.weight_kg < 500 &&
    typeof p.height_cm === "number" &&
    p.height_cm > 0 &&
    p.height_cm < 300 &&
    typeof p.age === "number" &&
    p.age > 0 &&
    p.age < 120 &&
    (p.gender === "male" || p.gender === "female") &&
    ["sedentary", "light", "moderate", "active", "very_active"].includes(p.activity_level as string) &&
    ["lose", "maintain", "gain"].includes(p.goal as string)
  );
}
