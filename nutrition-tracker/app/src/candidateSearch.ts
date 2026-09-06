/**
 * Local, zero-AI-cost candidate shortlist.
 *
 * The model never sees the full 228-dish database. Instead we do a cheap
 * keyword search here first (against D1 in production) and hand the model
 * only the ~10-15 dishes that plausibly match -- this is the main cost
 * lever, since it keeps the per-request prompt size roughly constant no
 * matter how large the database grows.
 *
 * Scoring is IDF-weighted (rare tokens count for more than common ones),
 * not flat token-overlap counting. This isn't a nicety -- flat counting was
 * tested against the real 228-dish database and failed a real query:
 * "chicken karahi and two rotis, chicken thigh" never shortlisted `roti` at
 * all, because "chicken" appears in dozens of dish names/labels and
 * "thigh"/"chicken" repeated in the query let chicken-dishes accumulate
 * huge scores that buried roti's one, decisive, rare-token match. A token
 * that only 1-2 dishes contain (like "roti") should count for MORE than one
 * that 40 dishes contain (like "chicken"), not the same amount -- that's
 * what IDF weighting fixes.
 */

export interface DishRecord {
  dish_id: string;
  category: string;
  serving_label: string;
}

export interface Candidate {
  dish_id: string;
  label: string; // short label shown to the model, not the full serving_label
}

/** Strip parenthetical sourcing/tier notes -- the model doesn't need "(sourced: ...)" */
function shortLabel(servingLabel: string): string {
  return servingLabel.replace(/\s*\([^)]*\)\s*$/, "").trim();
}

// Common English words that add no search signal but appear in enough dish
// labels/descriptions to meaningfully dilute real matches (see the "and"
// problem below). Not exhaustive -- just the ones that actually showed up
// polluting results when tested against the real database.
const STOPWORDS = new Set([
  "a", "an", "and", "or", "the", "this", "that", "in", "on", "of", "to",
  "with", "for", "not", "is", "are", "was", "were", "be", "been", "from",
  "as", "at", "by", "it", "its",
]);

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

interface IndexEntry {
  dish_id: string;
  label: string;
  tokens: Set<string>;
}

export interface SearchIndex {
  entries: IndexEntry[];
  idf: Map<string, number>;
}

export function buildSearchIndex(dishes: DishRecord[]): SearchIndex {
  const entries: IndexEntry[] = dishes.map((d) => {
    const label = shortLabel(d.serving_label);
    return {
      dish_id: d.dish_id,
      label,
      // Index the CLEANED label, not the raw serving_label -- the raw field
      // includes confidence-tier disclosure text ("predates the sourcing-tier
      // convention...", "not independently sourced...") on over 100 dishes,
      // which was flooding the index with dozens of irrelevant, near-
      // universal tokens that diluted every real match. shortLabel() only
      // strips the trailing parenthetical, so category (below) is added too,
      // for dishes whose food-relevant words live there instead.
      tokens: new Set([...tokenize(d.dish_id.replace(/_/g, " ")), ...tokenize(label), ...tokenize(d.category)]),
    };
  });

  // Document frequency: how many dishes contain each token.
  const df = new Map<string, number>();
  for (const entry of entries) {
    for (const token of entry.tokens) {
      df.set(token, (df.get(token) ?? 0) + 1);
    }
  }

  // Classic IDF: log(N / df). A token every dish shares (df == N) scores
  // ~0; a token only one dish has scores highest. Floor at a small positive
  // value so no token weight ever hits exactly zero or goes negative.
  const N = entries.length;
  const idf = new Map<string, number>();
  for (const [token, freq] of df) {
    idf.set(token, Math.max(0.1, Math.log(N / freq)));
  }

  return { entries, idf };
}

/**
 * Returns the top `limit` dishes by IDF-weighted token overlap with the
 * query. Still deliberately simple (no embeddings, no external call) -- this
 * runs synchronously in the Worker for every log, so it has to be near-free.
 */
export function shortlist(index: SearchIndex, query: string, limit = 12): Candidate[] {
  const queryTokens = new Set(tokenize(query)); // dedupe -- a repeated word shouldn't multiply its own weight
  if (queryTokens.size === 0) return [];

  const MIN_PARTIAL_LEN = 4; // below this, prefix matching is mostly false positives (e.g. "ka" prefixing "karahi")

  const scored = index.entries.map((entry) => {
    let score = 0;
    for (const qt of queryTokens) {
      if (entry.tokens.has(qt)) {
        // Exact match: idf.get(qt) is valid since qt IS an index token here.
        score += (index.idf.get(qt) ?? 1) * 2;
      } else if (qt.length >= MIN_PARTIAL_LEN) {
        // Partial match (e.g. query "rotis" vs indexed "roti"): weight by
        // the MATCHED index token's real rarity, not the query token's --
        // the query token itself was never indexed, so index.idf has no
        // entry for it and would silently fall back to a weak default.
        for (const t of entry.tokens) {
          if (t.length >= MIN_PARTIAL_LEN && (t.startsWith(qt) || qt.startsWith(t))) {
            score += (index.idf.get(t) ?? 1) * 1;
            break; // one credit per query token per dish
          }
        }
      }
    }
    return { entry, score };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => ({ dish_id: s.entry.dish_id, label: s.entry.label }));
}
