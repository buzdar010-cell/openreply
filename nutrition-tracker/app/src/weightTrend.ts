import type { Goal } from "./goalCalc.ts";

/**
 * Turns raw weight entries into a trend, and compares that trend against
 * what the profile's goal implies -- the same "adaptive coaching" idea as
 * the roadmap describes, done with plain arithmetic (no AI): a 500kcal/day
 * deficit or surplus is the same math daily_calorie_target is already built
 * from (see goalCalc.ts), and roughly maps to +/-0.5kg/week. If the actual
 * trend doesn't match that, the target's assumptions might not hold for
 * this person -- worth a nudge to recheck, never an automatic change.
 */

export type WeightTrendStatus = "no_data" | "on_track" | "mismatch";

export interface WeightTrendResult {
  status: WeightTrendStatus;
  latestWeightKg: number | null;
  recentAvgKg: number | null; // average over the last 7 days
  priorAvgKg: number | null; // average over the 7 days before that
  weeklyRateKg: number | null; // recentAvg - priorAvg
  expectedWeeklyRateKg: number | null;
}

const EXPECTED_WEEKLY_RATE_KG: Record<Goal, number> = {
  lose: -0.5,
  gain: 0.5,
  maintain: 0,
};

// How far the actual rate can differ from the expected one before it's
// flagged as a mismatch -- generous enough that normal week-to-week
// variance in adherence doesn't trigger false alarms, tight enough to
// still catch a genuinely flat trend against a lose/gain goal.
const MISMATCH_TOLERANCE_KG = 0.35;

export function computeWeightTrend(opts: {
  goal: Goal | null;
  latestWeightKg: number | null;
  recentAvgKg: number | null;
  priorAvgKg: number | null;
}): WeightTrendResult {
  const expectedWeeklyRateKg = opts.goal ? EXPECTED_WEEKLY_RATE_KG[opts.goal] : null;

  if (opts.recentAvgKg == null || opts.priorAvgKg == null) {
    return {
      status: "no_data",
      latestWeightKg: opts.latestWeightKg,
      recentAvgKg: opts.recentAvgKg,
      priorAvgKg: opts.priorAvgKg,
      weeklyRateKg: null,
      expectedWeeklyRateKg,
    };
  }

  const weeklyRateKg = opts.recentAvgKg - opts.priorAvgKg;
  let status: WeightTrendStatus = "on_track";
  if (expectedWeeklyRateKg != null) {
    if (expectedWeeklyRateKg < 0) {
      if (weeklyRateKg > expectedWeeklyRateKg + MISMATCH_TOLERANCE_KG) status = "mismatch";
    } else if (expectedWeeklyRateKg > 0) {
      if (weeklyRateKg < expectedWeeklyRateKg - MISMATCH_TOLERANCE_KG) status = "mismatch";
    } else if (Math.abs(weeklyRateKg) > MISMATCH_TOLERANCE_KG) {
      status = "mismatch";
    }
  }

  return {
    status,
    latestWeightKg: opts.latestWeightKg,
    recentAvgKg: opts.recentAvgKg,
    priorAvgKg: opts.priorAvgKg,
    weeklyRateKg,
    expectedWeeklyRateKg,
  };
}
