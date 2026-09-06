/**
 * Fallback for a barcode that matched nothing in our own table or Open Food
 * Facts: read the product's own nutrition-facts label photo instead. Same
 * model/call shape as parseLog.ts's photo path (see that file for the
 * reasoning on model choice, retry policy, and rate limiting) -- this is a
 * separate, self-contained module rather than a shared abstraction because
 * the task itself is different (no candidate list, no dish matching, just
 * extracting what's printed on a label), matching how weightTrend.ts,
 * exerciseCalc.ts etc. are each their own small module in this codebase.
 */

import { z } from "zod";
import { geminiFlashLiteBucket } from "./rateLimiter.ts";

type AcquireFn = () => Promise<void>;
const defaultAcquire: AcquireFn = () => geminiFlashLiteBucket.acquire();

const MODEL = "gemini-3.1-flash-lite";
const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const MAX_RETRIES = 3;

const SYSTEM_PROMPT = `You are reading a nutrition-facts label photo from a packaged food or drink product sold in Pakistan.

Extract, from what's actually printed on the label:
- product_name: the product's name/brand as printed.
- serving_size_g: the serving size in grams, if stated. Null if not stated or not given in grams.
- Nutrition values, normalized to PER 100g. Many labels show values per-serving instead -- if so, and you know the serving size in grams, convert (value / serving_grams * 100). If you cannot determine grams-per-serving and the label doesn't already give per-100g values directly, do not guess -- set readable to false instead.
- readable: true only if you can confidently read the actual printed numeric nutrition values, including calories, from the photo. If the photo is blurry, cropped, not a nutrition label at all, or missing the calorie value, set readable to false and leave every other field null. Never estimate or invent numbers that aren't legible in the photo.

Respond with ONLY a JSON object with these exact fields: readable (boolean), product_name (string or null), serving_size_g (number or null), kcal_per_100g (number or null), protein_per_100g (number or null), carbs_per_100g (number or null), fat_per_100g (number or null), fiber_per_100g (number or null), sugar_per_100g (number or null), sodium_per_100g_mg (number or null).`;

const LabelExtraction = z.object({
  readable: z.boolean(),
  product_name: z.string().nullable(),
  serving_size_g: z.number().nullable(),
  kcal_per_100g: z.number().nullable(),
  protein_per_100g: z.number().nullable(),
  carbs_per_100g: z.number().nullable(),
  fat_per_100g: z.number().nullable(),
  fiber_per_100g: z.number().nullable(),
  sugar_per_100g: z.number().nullable(),
  sodium_per_100g_mg: z.number().nullable(),
});

export type LabelExtractionResult = z.infer<typeof LabelExtraction>;

/** Parses Gemini's "Please retry in 24s" style message out of a 429 body. */
function extractRetryDelayMs(errorBody: any): number {
  const details = errorBody?.error?.details ?? [];
  const retryInfo = details.find((d: any) => d["@type"]?.includes("RetryInfo"));
  const raw = retryInfo?.retryDelay as string | undefined;
  if (raw) {
    const seconds = parseFloat(raw.replace("s", ""));
    if (!Number.isNaN(seconds)) return Math.ceil(seconds * 1000);
  }
  return 5000;
}

export async function parseBarcodeLabel(
  imageBase64: string,
  mimeType: "image/jpeg" | "image/png" | "image/webp",
  apiKey: string,
  acquire: AcquireFn = defaultAcquire,
): Promise<LabelExtractionResult> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    await acquire();

    const response = await fetch(`${API_BASE}/${MODEL}:generateContent?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ inline_data: { mime_type: mimeType, data: imageBase64 } }, { text: SYSTEM_PROMPT }] }],
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
      continue;
    }

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Gemini API error ${response.status}: ${body}`);
    }

    const data = (await response.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error(`Gemini returned no text content: ${JSON.stringify(data)}`);

    const parsed = LabelExtraction.safeParse(JSON.parse(text));
    if (!parsed.success) {
      throw new Error(`Gemini output didn't match expected schema: ${parsed.error.message}`);
    }
    return parsed.data;
  }
  throw new Error("unreachable");
}
