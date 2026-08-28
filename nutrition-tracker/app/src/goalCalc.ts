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
