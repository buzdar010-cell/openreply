/** Regression test for goalCalc.ts -- locks in the Mifflin-St Jeor math and the safety floor. */
import { calculateDailyCalorieTarget, calculateMacroTargets } from "../src/goalCalc.ts";

let failures = 0;
function check(name: string, actual: number, expected: number, tolerance = 1) {
  const pass = Math.abs(actual - expected) <= tolerance;
  console.log(`${pass ? "PASS" : "FAIL"}: ${name} -- got ${actual}, expected ~${expected}`);
  if (!pass) failures++;
}

// 30yo male, 75kg, 175cm, moderate activity, maintain:
// BMR = 10*75 + 6.25*175 - 5*30 + 5 = 1698.75; TDEE = *1.55 = 2633.06
check(
  "male maintain",
  calculateDailyCalorieTarget({ weight_kg: 75, height_cm: 175, age: 30, gender: "male", activity_level: "moderate", goal: "maintain" }),
  2633,
);

check(
  "male lose (same profile, -500)",
  calculateDailyCalorieTarget({ weight_kg: 75, height_cm: 175, age: 30, gender: "male", activity_level: "moderate", goal: "lose" }),
  2133,
);

check(
  "male gain (same profile, +500)",
  calculateDailyCalorieTarget({ weight_kg: 75, height_cm: 175, age: 30, gender: "male", activity_level: "moderate", goal: "gain" }),
  3133,
);

// 25yo female, 60kg, 162cm, sedentary, lose:
// BMR = 600 + 1012.5 - 125 - 161 = 1326.5; TDEE = *1.2 = 1591.8; lose = 1091.8
check(
  "female sedentary lose",
  calculateDailyCalorieTarget({ weight_kg: 60, height_cm: 162, age: 25, gender: "female", activity_level: "sedentary", goal: "lose" }),
  1200, // hits the 1200 safety floor, not the raw 1091.8
);

// Extreme low-BMR case should never go below the 1200 floor
check(
  "safety floor never breached",
  calculateDailyCalorieTarget({ weight_kg: 40, height_cm: 145, age: 70, gender: "female", activity_level: "sedentary", goal: "lose" }),
  1200,
);

// Macro targets, same 75kg/2633kcal profile as "male maintain" above:
// protein = round(1.6*75) = 120g (480 kcal); fat = round(0.3*2633/9) = 88g (789.9 kcal);
// carbs = round((2633 - 480 - 789.9)/4) = 341g
const macros = calculateMacroTargets(2633, 75);
check("macro protein_g", macros.protein_g, 120, 0);
check("macro fat_g", macros.fat_g, 88, 0);
check("macro carbs_g", macros.carbs_g, 341, 0);

// Macro calories (at 4/4/9 kcal per g) should reconstruct close to the
// original calorie target -- independent rounding of each gram value
// means it won't be exact, but it should never drift far.
const reconstructedKcal = macros.protein_g * 4 + macros.carbs_g * 4 + macros.fat_g * 9;
check("macro kcal reconstructs the target", reconstructedKcal, 2633, 10);

console.log(`\n${failures === 0 ? "All checks passed" : `${failures} check(s) failed`}`);
if (failures > 0) process.exit(1);
