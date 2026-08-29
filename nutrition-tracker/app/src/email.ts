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

  const res = await fetch(RESEND_API_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: FROM_ADDRESS,
      to: [toEmail],
      subject,
      text: `${intro}\n\n${code}\n\nThis code expires in 10 minutes. If you didn't request this, you can safely ignore this email.`,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to send email via Resend (${res.status}): ${body}`);
  }
}
