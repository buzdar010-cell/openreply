import { TIPS, type Tip } from "./tips.ts";
import { ARTICLES, type Article } from "./articles.ts";
import type { Goal } from "../goalCalc.ts";

export interface ContentSignals {
  goal: Goal | null;
  highSodium: boolean; // avg sodium over the last 7 days exceeds the WHO daily guideline
  lowProtein: boolean; // avg protein under ~70% of target over the last 7 days
  topDishIds: string[]; // most-logged dishes recently, most-logged first
  noRecentExercise: boolean; // no exercise log in the last 3 days
}

const SODIUM_THRESHOLD_MG = 2000; // WHO's recommended daily ceiling
const PROTEIN_ADHERENCE_THRESHOLD = 0.7;
const RECENT_EXERCISE_WINDOW_SECONDS = 3 * 86400;

export function computeSignals(opts: {
  goal: Goal | null;
  avgSodiumMg: number;
  avgProteinG: number;
  proteinTargetG: number | null;
  topDishIds: string[];
  lastExerciseLogAt: number | null;
  nowUnix: number;
}): ContentSignals {
  return {
    goal: opts.goal,
    highSodium: opts.avgSodiumMg > SODIUM_THRESHOLD_MG,
    lowProtein: opts.proteinTargetG != null && opts.avgProteinG < opts.proteinTargetG * PROTEIN_ADHERENCE_THRESHOLD,
    topDishIds: opts.topDishIds,
    noRecentExercise: opts.lastExerciseLogAt == null || opts.nowUnix - opts.lastExerciseLogAt > RECENT_EXERCISE_WINDOW_SECONDS,
  };
}

/** Tiny seeded PRNG (mulberry32) -- deterministic per seed, so "today's" picks are stable across reloads but change day to day. No crypto needed, this isn't security-sensitive. */
function seededRandom(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

function shuffled<T>(items: T[], rand: () => number): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Picks a handful of tips matching the signals, seeded by (userId, date) so
 * the set is stable within a day but rotates day to day. Prioritizes the
 * most specific/personalized matches (dish, then the situational signals),
 * always includes one goal-based tip, and fills the rest from the general
 * pool -- never all from one category, and never empty even with no
 * signals firing (general pool alone is enough).
 */
export function selectTips(signals: ContentSignals, seed: string, count = 5): Tip[] {
  const rand = seededRandom(seed);
  const picked: Tip[] = [];
  const usedIds = new Set<string>();

  function take(pool: Tip[], max: number) {
    for (const tip of shuffled(pool, rand)) {
      if (picked.length >= count || max <= 0) return;
      if (usedIds.has(tip.id)) continue;
      picked.push(tip);
      usedIds.add(tip.id);
      max--;
    }
  }

  if (signals.topDishIds.length > 0) {
    const dishTips = TIPS.filter(
      (t) => t.condition.type === "dish" && t.condition.dishIds.some((id) => signals.topDishIds.includes(id)),
    );
    take(dishTips, 2);
  }
  if (signals.highSodium) take(TIPS.filter((t) => t.condition.type === "high_sodium"), 1);
  if (signals.lowProtein) take(TIPS.filter((t) => t.condition.type === "low_protein"), 1);
  if (signals.noRecentExercise) take(TIPS.filter((t) => t.condition.type === "no_recent_exercise"), 1);
  if (signals.goal) take(TIPS.filter((t) => t.condition.type === "goal" && t.condition.value === signals.goal), 1);

  take(TIPS.filter((t) => t.condition.type === "general"), count);

  return picked.slice(0, count);
}

export function selectArticles(seed: string, count = 3): Article[] {
  return shuffled(ARTICLES, seededRandom(seed)).slice(0, count);
}
