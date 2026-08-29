/** Regression test for weightTrend.ts -- trend math and goal-mismatch detection. */
import { computeWeightTrend } from "../src/weightTrend.ts";

let failures = 0;
function check(name: string, pass: boolean) {
  console.log(`${pass ? "PASS" : "FAIL"}: ${name}`);
  if (!pass) failures++;
}

check(
  "no data in either window -> no_data",
  computeWeightTrend({ goal: "lose", latestWeightKg: 80, recentAvgKg: null, priorAvgKg: null }).status === "no_data",
);
check(
  "data in only one window -> still no_data (need both to compute a rate)",
  computeWeightTrend({ goal: "lose", latestWeightKg: 80, recentAvgKg: 79.5, priorAvgKg: null }).status === "no_data",
);

// Losing at roughly the expected 0.5kg/week for a "lose" goal -> on track.
const losingOnPace = computeWeightTrend({ goal: "lose", latestWeightKg: 79, recentAvgKg: 79.5, priorAvgKg: 80 });
check("losing ~0.5kg/week on a lose goal -> on_track", losingOnPace.status === "on_track");
check("weeklyRateKg is negative (recent lower than prior)", (losingOnPace.weeklyRateKg ?? 0) < 0);

// Flat weight despite a lose goal -> mismatch.
const flatOnLoseGoal = computeWeightTrend({ goal: "lose", latestWeightKg: 80, recentAvgKg: 80, priorAvgKg: 80 });
check("flat trend on a lose goal -> mismatch", flatOnLoseGoal.status === "mismatch");

// Gaining weight despite a lose goal -> definitely a mismatch.
const gainingOnLoseGoal = computeWeightTrend({ goal: "lose", latestWeightKg: 81, recentAvgKg: 80.5, priorAvgKg: 80 });
check("gaining weight on a lose goal -> mismatch", gainingOnLoseGoal.status === "mismatch");

// Gaining at roughly the expected rate for a "gain" goal -> on track.
const gainingOnPace = computeWeightTrend({ goal: "gain", latestWeightKg: 71, recentAvgKg: 70.5, priorAvgKg: 70 });
check("gaining ~0.5kg/week on a gain goal -> on_track", gainingOnPace.status === "on_track");

// Flat weight on a gain goal -> mismatch.
check(
  "flat trend on a gain goal -> mismatch",
  computeWeightTrend({ goal: "gain", latestWeightKg: 70, recentAvgKg: 70, priorAvgKg: 70 }).status === "mismatch",
);

// Maintain goal: small drift is fine, big drift either direction is a mismatch.
check(
  "small drift on a maintain goal -> on_track",
  computeWeightTrend({ goal: "maintain", latestWeightKg: 70.1, recentAvgKg: 70.1, priorAvgKg: 70 }).status === "on_track",
);
check(
  "big upward drift on a maintain goal -> mismatch",
  computeWeightTrend({ goal: "maintain", latestWeightKg: 71, recentAvgKg: 70.6, priorAvgKg: 70 }).status === "mismatch",
);
check(
  "big downward drift on a maintain goal -> mismatch",
  computeWeightTrend({ goal: "maintain", latestWeightKg: 69, recentAvgKg: 69.4, priorAvgKg: 70 }).status === "mismatch",
);

// No goal set at all -- can't judge against an expectation, but still on_track (not a false mismatch).
check(
  "no goal set -> on_track regardless of trend (nothing to compare against)",
  computeWeightTrend({ goal: null, latestWeightKg: 80, recentAvgKg: 80, priorAvgKg: 75 }).status === "on_track",
);

console.log(`\n${failures === 0 ? "All checks passed" : `${failures} check(s) failed`}`);
if (failures > 0) process.exit(1);
