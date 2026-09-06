/**
 * Posts a plain-text message to the Slack incoming webhook configured for
 * this app's alerts channel. Fire-and-forget by design: a monitoring
 * message failing to send must never break the actual request it's
 * reporting on, so every call site wraps this in its own try/catch (or
 * just doesn't await it via ctx.waitUntil) rather than letting a Slack
 * outage cascade into user-facing errors.
 */
export async function notifySlack(webhookUrl: string | undefined, text: string): Promise<void> {
  if (!webhookUrl) return; // not configured yet in this environment -- silently skip, don't throw
  await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
}
