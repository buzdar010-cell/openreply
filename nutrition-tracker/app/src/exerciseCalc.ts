/**
 * Calories burned from a logged activity -- the standard MET formula
 * (calories = MET x weight_kg x hours), same well-established method
 * fitness apps use, not something invented here. One representative MET
 * value per category rather than a huge picklist: this is a reasonable
 * estimate, not a lab measurement, and a short list is what makes logging
 * fast enough that people actually do it.
 *
 * No AI call involved -- unlike food logging, this never touches Gemini or
 * its rate-limited budget.
 */

export type ActivityType = "walk" | "run" | "cycling" | "gym" | "sports" | "yoga" | "housework";

const MET_VALUES: Record<ActivityType, number> = {
  walk: 3.5, // brisk walk
  run: 9.8, // running/jogging, moderate pace
  cycling: 7.5, // moderate cycling
  gym: 6.0, // general weight training
  sports: 8.0, // moderate-vigorous sport (cricket, football, badminton, etc.)
  yoga: 3.0, // yoga/stretching
  housework: 3.3, // general household chores
};

export const ACTIVITY_LABELS: Record<ActivityType, string> = {
  walk: "Walking",
  run: "Running / jogging",
  cycling: "Cycling",
  gym: "Gym / weights",
  sports: "Sports",
  yoga: "Yoga / stretching",
  housework: "Housework / chores",
};

export function isValidActivityType(value: unknown): value is ActivityType {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(MET_VALUES, value);
}

export function calculateCaloriesBurned(activityType: ActivityType, weightKg: number, durationMinutes: number): number {
  return Math.round(MET_VALUES[activityType] * weightKg * (durationMinutes / 60));
}
