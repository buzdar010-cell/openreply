/**
 * Sends verification/reset codes via Resend's REST API -- called directly
 * via fetch(), same pattern as the Gemini integration, no SDK dependency
 * for a single API call. Requires the RESEND_API_KEY secret and a
 * verified sending domain/address in the Resend account.
 */

const RESEND_API_URL = "https://api.resend.com/emails";

// Resend requires a verified sending address; falls back to their shared
// testing domain until a real domain is verified in the account -- swap
// this once that's set up, since onboarding@resend.dev won't deliver to
// arbitrary recipients on a free account either.
const FROM_ADDRESS = "Nutrition Tracker <onboarding@resend.dev>";

export async function sendOtpEmail(
  apiKey: string,
  toEmail: string,
  code: string,
  purpose: "signup" | "login" | "reset",
): Promise<void> {
  const subject =
    purpose === "signup"
      ? "Verify your email"
      : purpose === "login"
        ? "Your sign-in code"
        : "Reset your password";
  const intro =
    purpose === "signup"
      ? "Use this code to verify your email and finish creating your account:"
      : purpose === "login"
        ? "We noticed a sign-in from a new device or location. Use this code to confirm it's you:"
        : "Use this code to reset your password:";

  // Plain-text-only emails reflow inconsistently across clients (the code
  // ends up above or below the intro depending on how each client wraps
  // it) -- an HTML body with the code in its own fixed block renders the
  // same everywhere. `text` stays as a fallback for clients that prefer it.
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px; color: #1a1a1a;">
      <p style="font-size: 16px; line-height: 1.5; margin: 0 0 24px;">${intro}</p>
      <div style="font-size: 32px; font-weight: 700; letter-spacing: 8px; text-align: center; background: #f5f5f5; border-radius: 8px; padding: 20px 8px; margin: 0 0 24px;">${code}</div>
      <p style="font-size: 14px; line-height: 1.5; color: #666; margin: 0;">This code expires in 10 minutes. If you didn't request this, you can safely ignore this email.</p>
    </div>
  `.trim();

  const res = await fetch(RESEND_API_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: FROM_ADDRESS,
      to: [toEmail],
      subject,
      html,
      text: `${intro}\n\n${code}\n\nThis code expires in 10 minutes. If you didn't request this, you can safely ignore this email.`,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to send email via Resend (${res.status}): ${body}`);
  }
}
