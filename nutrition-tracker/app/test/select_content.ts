/** Regression test for content/selectContent.ts -- personalized tip/article selection. */
import { computeSignals, selectTips, selectArticles } from "../src/content/selectContent.ts";
import { TIPS } from "../src/content/tips.ts";
import { ARTICLES } from "../src/content/articles.ts";

let failures = 0;
function check(name: string, pass: boolean) {
  console.log(`${pass ? "PASS" : "FAIL"}: ${name}`);
  if (!pass) failures++;
}

const noSignals = computeSignals({
  goal: null,
  avgSodiumMg: 500,
  avgProteinG: 100,
  proteinTargetG: null,
  topDishIds: [],
  lastExerciseLogAt: Math.floor(Date.now() / 1000),
  nowUnix: Math.floor(Date.now() / 1000),
});

const withNoSignals = selectTips(noSignals, "seed-a", 5);
check("returns the requested count even with no signals firing", withNoSignals.length === 5);
check("no duplicate tips in one selection", new Set(withNoSignals.map((t) => t.id)).size === withNoSignals.length);

const now = Math.floor(Date.now() / 1000);
const goalSignals = computeSignals({
  goal: "lose",
  avgSodiumMg: 2500, // above the WHO threshold
  avgProteinG: 20, // well under any reasonable target
  proteinTargetG: 120,
  topDishIds: ["chicken_karahi"],
  lastExerciseLogAt: now - 10 * 86400, // 10 days ago -- stale
  nowUnix: now,
});

check("high sodium signal fires above the WHO threshold", goalSignals.highSodium === true);
check("low protein signal fires when well under target", goalSignals.lowProtein === true);
check("no-recent-exercise fires when last log was 10 days ago", goalSignals.noRecentExercise === true);

const personalized = selectTips(goalSignals, "seed-b", 5);
check("includes at least one goal=lose tip", personalized.some((t) => t.condition.type === "goal" && t.condition.value === "lose"));
check(
  "includes the chicken_karahi dish tip",
  personalized.some((t) => t.condition.type === "dish" && t.condition.dishIds.includes("chicken_karahi")),
);
check("includes a high-sodium tip", personalized.some((t) => t.condition.type === "high_sodium"));
check("includes a low-protein tip", personalized.some((t) => t.condition.type === "low_protein"));
check("includes a no-recent-exercise tip", personalized.some((t) => t.condition.type === "no_recent_exercise"));

const repeat = selectTips(goalSignals, "seed-b", 5);
check(
  "same seed produces the same selection (deterministic, not random per request)",
  JSON.stringify(personalized.map((t) => t.id)) === JSON.stringify(repeat.map((t) => t.id)),
);

const differentDay = selectTips(goalSignals, "seed-c", 5);
check(
  "a different seed can produce a different general-pool mix (not hardcoded to one fixed order)",
  JSON.stringify(personalized.map((t) => t.id)) !== JSON.stringify(differentDay.map((t) => t.id)),
);

check("every tip library entry has a non-empty title and body", TIPS.every((t) => t.title.length > 0 && t.body.length > 0));
check("tip ids are all unique", new Set(TIPS.map((t) => t.id)).size === TIPS.length);
check("tips library has exactly 78 entries as scoped", TIPS.length === 78);

const articles = selectArticles("seed-a", 3);
check("selectArticles returns the requested count", articles.length === 3);
check("no duplicate articles in one selection", new Set(articles.map((a) => a.id)).size === articles.length);
check("article ids are all unique", new Set(ARTICLES.map((a) => a.id)).size === ARTICLES.length);
check("articles library has exactly 9 entries as scoped", ARTICLES.length === 9);

console.log(`\n${failures === 0 ? "All checks passed" : `${failures} check(s) failed`}`);
if (failures > 0) process.exit(1);
