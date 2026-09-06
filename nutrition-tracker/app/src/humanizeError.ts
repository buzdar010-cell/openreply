/**
 * Turns a raw exception message into a plain-English "what happened / what
 * it usually means" line for Slack, so a non-technical read of the alerts
 * channel is still useful. Deliberately pattern-matched rather than run
 * through an AI call -- errors are exactly the case where the monitoring
 * itself needs to stay simple and reliable (an AI call that also fails
 * doesn't help explain an outage), and this codebase already avoids adding
 * a dependency where a direct check does the job.
 *
 * Unrecognized errors still get labeled plainly rather than hidden --
 * nothing is silently dropped, it just says explanation isn't known yet.
 */
export function humanizeError(message: string): string {
  const m = message.toLowerCase();

  if (m.includes("json") && (m.includes("unexpected") || m.includes("expected property") || m.includes("position"))) {
    return "Something sent the server broken data (not valid JSON) — usually a bug in the app itself, not a server problem.";
  }
  if (m.includes("gemini") && (m.includes("429") || m.includes("rate limit"))) {
    return "The AI (Gemini) hit its rate limit. Should clear on its own; if this keeps happening a lot, it means real usage is bumping into the free-tier ceiling.";
  }
  if (m.includes("gemini") && (m.includes("503") || m.includes("unavailable") || m.includes("500"))) {
    return "The AI (Gemini) is temporarily down on Google's end. Nothing to fix here — should recover by itself.";
  }
  if (m.includes("sqlite_constraint") || m.includes("foreign key")) {
    return "A database save failed because it would have broken a data rule (e.g. referencing something that doesn't exist). Usually a bug in the code, needs a developer look.";
  }
  if (m.includes("no such table") || m.includes("no such column")) {
    return "The database is missing a table/column the code expects — almost always a migration that wasn't applied to the live database. Needs a developer look.";
  }
  if (m.includes("sqlite") || m.includes("d1")) {
    return "A database operation failed unexpectedly. Needs a developer look.";
  }
  if (m.includes("fetch failed") || m.includes("network") || m.includes("econnrefused") || m.includes("timeout")) {
    return "A call to an outside service failed (could be Gemini, Open Food Facts, Resend, or Paddle depending on which endpoint this is). Often temporary; worth watching if it repeats.";
  }
  if (m.includes("r2") || m.includes("photo")) {
    return "Saving or loading a photo failed.";
  }
  if (m.includes("resend")) {
    return "Sending an email failed (Resend). Check the Resend dashboard if this repeats.";
  }
  if (m.includes("failed to fetch dynamically imported module") || m.includes("chunkloaderror") || m.includes("loading chunk")) {
    return "A user's browser tried to load part of the app that no longer exists — almost always someone stuck on an old cached version mid-update. Usually resolves itself on their next refresh.";
  }
  if (m.includes("cannot read propert") || m.includes("is not a function") || m.includes("is not defined") || m.includes("undefined is not")) {
    return "A frontend bug — the app tried to use something that wasn't there. Needs a developer look at the specific page it happened on.";
  }
  if (m.includes("networkerror") || m.includes("failed to fetch")) {
    return "The app in someone's browser couldn't reach the server — could be their internet connection, or the server being briefly unreachable.";
  }

  return "Not a recognized error type yet — read the technical detail below, or ask for it to be explained.";
}
