/**
 * Turns a user's text description or food photo into a structured log entry
 * matched against our curated dish database. Model: Claude Haiku 4.5 --
 * chosen for cost, not capability; this task (pick from a short list,
 * extract a portion, detect explicit swaps) doesn't need a frontier model.
 *
 * Cost design, in order of impact:
 *   1. Never send the full database. `shortlist()` (candidateSearch.ts) does
 *      a free local keyword search and hands Haiku ~10-15 candidates, not 228.
 *   2. The system prompt is static across every request -> cache it. Cached
 *      reads are ~0.1x the cost of fresh input tokens (see README below).
 *   3. Structured output (Zod schema via messages.parse) instead of free-text
 *      + a second parsing pass -- one call, no back-and-forth.
 *   4. max_tokens kept small (output is a handful of fields, never prose).
 */

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { type Candidate } from "./candidateSearch";

const MODEL = "claude-haiku-4-5";

// ---- Static system prompt (cached -- see cache_control below) ----
// Keep this frozen and byte-identical across requests. Any change
// (including whitespace) invalidates the cache for every user.
const SYSTEM_PROMPT = `You are the food-log parser for a Pakistani nutrition tracking app.

You will be given a short list of candidate dishes (dish_id + label) that a local search already narrowed down, plus what the user actually said or a photo of their food. Your only job is to map that to ONE structured log entry.

Rules:
- Pick the single candidate dish_id that best matches. If genuinely none of the candidates match what was described or shown, set dish_id to "none_of_these" and fill free_text_description instead -- never invent a dish_id that isn't in the candidate list.
- Portion: if the matched dish lists portion_presets and the user's words or the photo clearly imply a size/count (e.g. "large", "2 pieces", "a small handful"), set portion_preset to that preset's name. If they gave an explicit quantity (grams, cups, a specific count with no matching preset), set custom_grams. If nothing about size is stated or visible, leave both null -- the app will use the dish's default serving. Do not guess a size from nothing.
- Swaps: some dishes have swappable ingredients (flour type, protein cut, fat type, dairy type). Only set a swap when the user's words or the photo give an explicit, specific signal (e.g. "roti with maida", "chicken thigh", "cooked in ghee"). Never set a swap from silence or a generic mention -- the dish's own default applies automatically when unset.
- Confidence: set "high" only when you're genuinely sure of the single best match. Several Pakistani curries look visually near-identical in a photo (e.g. chicken karahi vs. chicken curry vs. kali mirch chicken) -- when a photo could plausibly be more than one candidate, set confidence to "low" and list up to 2 alternates in alt_candidates, so the app can offer a one-tap confirmation instead of silently committing to a guess. Text descriptions are usually unambiguous once matched -- reserve "low" confidence there for genuinely vague input ("I had chicken" with no dish specified).
- Output the structured fields only. No prose, no explanation.`;

const ParsedLog = z.object({
  dish_id: z.string().describe("One of the candidate dish_ids, or \"none_of_these\""),
  free_text_description: z
    .string()
    .nullable()
    .describe("Only set when dish_id is none_of_these -- plain description of what was eaten"),
  portion_preset: z.string().nullable().describe("A preset name from the matched dish, if applicable"),
  custom_grams: z.number().nullable().describe("Explicit gram quantity, if the user stated one"),
  swaps: z
    .object({
      flour: z.string().nullable(),
      protein_cut: z.string().nullable(),
      fat: z.string().nullable(),
      dairy: z.string().nullable(),
    })
    .describe("Only set fields with an explicit signal from the input; leave the rest null"),
  confidence: z.enum(["high", "low"]),
  alt_candidates: z.array(z.string()).describe("Up to 2 alternate dish_ids, only when confidence is low"),
});

export type ParsedLogResult = z.infer<typeof ParsedLog>;

function candidateListText(candidates: Candidate[]): string {
  return candidates.map((c) => `${c.dish_id}: ${c.label}`).join("\n");
}

/** Text-only log, e.g. "chicken karahi and two rotis" */
export async function parseTextLog(
  client: Anthropic,
  userText: string,
  candidates: Candidate[],
): Promise<ParsedLogResult> {
  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 512,
    system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
    messages: [
      {
        role: "user",
        content: `Candidates:\n${candidateListText(candidates)}\n\nUser said: "${userText}"`,
      },
    ],
    output_config: { format: zodOutputFormat(ParsedLog) },
  });
  return response.parsed_output!;
}

/** Photo log -- base64 image plus optional caption text */
export async function parsePhotoLog(
  client: Anthropic,
  imageBase64: string,
  mediaType: "image/jpeg" | "image/png" | "image/webp",
  candidates: Candidate[],
  caption?: string,
): Promise<ParsedLogResult> {
  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 512,
    system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType, data: imageBase64 } },
          {
            type: "text",
            text: `Candidates:\n${candidateListText(candidates)}${caption ? `\n\nUser's caption: "${caption}"` : ""}`,
          },
        ],
      },
    ],
    output_config: { format: zodOutputFormat(ParsedLog) },
  });
  return response.parsed_output!;
}
