/**
 * Local, zero-AI-cost candidate shortlist.
 *
 * Haiku never sees the full 228-dish database. Instead we do a cheap keyword
 * search here first (against D1 in production; against dishes.json for this
 * prototype) and hand Haiku only the ~10-15 dishes that plausibly match --
 * this is the main cost lever, since it keeps the per-request prompt size
 * roughly constant no matter how large the database grows.
 */

export interface DishRecord {
  dish_id: string;
  category: string;
  serving_label: string;
}

export interface Candidate {
  dish_id: string;
  label: string; // short label shown to Haiku, not the full serving_label
}

/** Strip parenthetical sourcing/tier notes -- Haiku doesn't need "(sourced: ...)" */
function shortLabel(servingLabel: string): string {
  return servingLabel.replace(/\s*\([^)]*\)\s*$/, "").trim();
}

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1);
}

export function buildSearchIndex(dishes: DishRecord[]) {
  return dishes.map((d) => ({
    dish_id: d.dish_id,
    label: shortLabel(d.serving_label),
    tokens: new Set([...tokenize(d.dish_id.replace(/_/g, " ")), ...tokenize(d.serving_label)]),
  }));
}

export type SearchIndex = ReturnType<typeof buildSearchIndex>;

/**
 * Returns the top `limit` dishes by token overlap with the query.
 * Deliberately simple (no embeddings, no external call) -- this runs
 * synchronously in the Worker for every log, so it has to be near-free.
 */
export function shortlist(index: SearchIndex, query: string, limit = 12): Candidate[] {
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) return [];

  const scored = index.map((entry) => {
    let score = 0;
    for (const qt of queryTokens) {
      if (entry.tokens.has(qt)) score += 2;
      else if ([...entry.tokens].some((t) => t.startsWith(qt) || qt.startsWith(t))) score += 1;
    }
    return { entry, score };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => ({ dish_id: s.entry.dish_id, label: s.entry.label }));
}
