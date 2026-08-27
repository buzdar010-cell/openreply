/**
 * Turns a user's text description or food photo into a structured log entry
 * matched against our curated dish database.
 *
 * Model: gemini-3.1-flash-lite. Chosen after directly testing every
 * available Flash variant (see nutrition-tracker/data -- this file's sibling
 * conversation history): it matched the best RPM (15/min free tier) and the
 * lowest real token cost of anything actually available to a new account,
 * with no internal "thinking" tax the way gemini-3.5-flash and
 * gemini-3.6-flash both had.
 *
 * Calls the REST API directly via fetch() rather than a Google SDK -- this
 * exact request shape (generateContent + thinkingConfig + responseMimeType)
 * was verified working through direct test calls; Workers supports fetch()
 * natively, so there's no reason to add an SDK dependency of unverified
 * shape on top of a shape we've already confirmed correct.
 *
 * Cost/reliability design, in order of impact:
 *   1. Never send the full database. `shortlist()` (candidateSearch.ts) does
 *      a free local keyword search and hands the model ~10-15 candidates,
 *      not the full 200+.
 *   2. thinkingConfig.thinkingBudget is set low (128) -- this model can't
 *      fully disable thinking (thinkingBudget: 0 is rejected), but a small
 *      budget keeps the tax minimal for a task this simple.
 *   3. Every call is gated through the shared rate limiter (rateLimiter.ts)
 *      so the app never exceeds the real, measured 15 RPM free-tier ceiling.
 *   4. A 429 is retried automatically using the delay Gemini itself reports,
 *      capped at 3 attempts -- the caller never sees a raw rate-limit error.
 */

import { z } from "zod";
import { geminiFlashLiteBucket } from "./rateLimiter.ts";
import { type Candidate } from "./candidateSearch.ts";

const MODEL = "gemini-3.1-flash-lite";
const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const MAX_RETRIES = 3;

// ---- Static system prompt -- keep byte-identical across requests ----
const SYSTEM_PROMPT = `You are the food-log parser for a Pakistani nutrition tracking app.

You will be given a short list of candidate dishes (dish_id + label) that a local search already narrowed down, plus what the user actually said or a photo of their food. Your only job is to map that to ONE structured log entry.

Rules:
- Pick the single candidate dish_id that best matches. If genuinely none of the candidates match what was described or shown, set dish_id to "none_of_these" and fill free_text_description instead -- never invent a dish_id that isn't in the candidate list.
- Portion: if the matched dish lists portion_presets and the user's words or the photo clearly imply a size/count (e.g. "large", "2 pieces", "a small handful"), set portion_preset to that preset's name. If they gave an explicit quantity (grams, cups, a specific count with no matching preset), set custom_grams. If nothing about size is stated or visible, leave both null -- the app will use the dish's default serving. Do not guess a size from nothing.
- Swaps: some dishes have swappable ingredients (flour type, protein cut, fat type, dairy type). Only set a swap when the user's words or the photo give an explicit, specific signal (e.g. "roti with maida", "chicken thigh", "cooked in ghee"). Never set a swap from silence or a generic mention -- the dish's own default applies automatically when unset.
- Confidence: set "high" only when you're genuinely sure of the single best match. Several Pakistani curries look visually near-identical in a photo (e.g. chicken karahi vs. chicken curry vs. kali mirch chicken) -- when a photo could plausibly be more than one candidate, set confidence to "low" and list up to 2 alternates in alt_candidates, so the app can offer a one-tap confirmation instead of silently committing to a guess. Text descriptions are usually unambiguous once matched -- reserve "low" confidence there for genuinely vague input ("I had chicken" with no dish specified).

A single message often describes more than one food item (e.g. "chicken karahi and two rotis") -- when it does, return one entry per distinct item, not just the first one. When it describes only one item, still return an array, just with one entry in it.
- Quantity: many items are naturally counted rather than sized (e.g. "two rotis", "3 samosas", "a couple of kebabs"). Set quantity to that count. If nothing about count is stated, set quantity to 1 -- never null, since every logged item is at least one.

Respond with ONLY a JSON array of objects, each with these exact fields: dish_id (string), free_text_description (string or null), quantity (number, defaults to 1), portion_preset (string or null), custom_grams (number or null), swaps (object with flour, protein_cut, fat, dairy -- each string or null), confidence ("high" or "low"), alt_candidates (array of strings).`;

const ParsedLogEntry = z.object({
  dish_id: z.string(),
  free_text_description: z.string().nullable(),
  quantity: z.number(),
  portion_preset: z.string().nullable(),
  custom_grams: z.number().nullable(),
  swaps: z.object({
    flour: z.string().nullable(),
    protein_cut: z.string().nullable(),
    fat: z.string().nullable(),
    dairy: z.string().nullable(),
  }),
  confidence: z.enum(["high", "low"]),
  alt_candidates: z.array(z.string()),
});

const ParsedLog = z.array(ParsedLogEntry);

export type ParsedLogEntryResult = z.infer<typeof ParsedLogEntry>;
export type ParsedLogResult = z.infer<typeof ParsedLog>;

function candidateListText(candidates: Candidate[]): string {
  return candidates.map((c) => `${c.dish_id}: ${c.label}`).join("\n");
}

interface GeminiPart {
  text?: string;
  inline_data?: { mime_type: string; data: string };
}

/** Parses Gemini's "Please retry in 24s" style message out of a 429 body. */
function extractRetryDelayMs(errorBody: any): number {
  const details = errorBody?.error?.details ?? [];
  const retryInfo = details.find((d: any) => d["@type"]?.includes("RetryInfo"));
  const raw = retryInfo?.retryDelay as string | undefined; // e.g. "24s"
  if (raw) {
    const seconds = parseFloat(raw.replace("s", ""));
    if (!Number.isNaN(seconds)) return Math.ceil(seconds * 1000);
  }
  return 5000; // fallback if the API didn't tell us -- don't hammer it
}

async function callGemini(parts: GeminiPart[], apiKey: string): Promise<ParsedLogResult> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    await geminiFlashLiteBucket.acquire(); // never exceed the real 15 RPM ceiling

    const response = await fetch(`${API_BASE}/${MODEL}:generateContent?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: {
          thinkingConfig: { thinkingBudget: 128 },
          responseMimeType: "application/json",
        },
      }),
    });

    if (response.status === 429) {
      const body = await response.json();
      if (attempt === MAX_RETRIES) {
        throw new Error(`Gemini rate limit exceeded after ${MAX_RETRIES} retries: ${JSON.stringify(body)}`);
      }
      const waitMs = extractRetryDelayMs(body);
      await new Promise((resolve) => setTimeout(resolve, waitMs));
      continue; // retry -- the user never sees this happen
    }

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Gemini API error ${response.status}: ${body}`);
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error(`Gemini returned no text content: ${JSON.stringify(data)}`);

    const parsed = ParsedLog.safeParse(JSON.parse(text));
    if (!parsed.success) {
      throw new Error(`Gemini output didn't match expected schema: ${parsed.error.message}`);
    }
    return parsed.data;
  }
  throw new Error("unreachable"); // loop always returns or throws above
}

/** Text-only log, e.g. "chicken karahi and two rotis" */
export async function parseTextLog(
  userText: string,
  candidates: Candidate[],
  apiKey: string,
): Promise<ParsedLogResult> {
  const prompt = `${SYSTEM_PROMPT}\n\nCandidates:\n${candidateListText(candidates)}\n\nUser said: "${userText}"`;
  return callGemini([{ text: prompt }], apiKey);
}

/** Photo log -- base64 image plus optional caption text */
export async function parsePhotoLog(
  imageBase64: string,
  mimeType: "image/jpeg" | "image/png" | "image/webp",
  candidates: Candidate[],
  apiKey: string,
  caption?: string,
): Promise<ParsedLogResult> {
  const prompt = `${SYSTEM_PROMPT}\n\nCandidates:\n${candidateListText(candidates)}${caption ? `\n\nUser's caption: "${caption}"` : ""}`;
  return callGemini(
    [{ inline_data: { mime_type: mimeType, data: imageBase64 } }, { text: prompt }],
    apiKey,
  );
}
