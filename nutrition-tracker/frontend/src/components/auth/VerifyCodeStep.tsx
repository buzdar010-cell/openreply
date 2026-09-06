import { useState } from 'react';
import { verifySignup, verifyLogin, type AuthTokens } from '../../lib/api';
import { setSession } from '../../lib/session';
import { AuthField, AuthError, authInputClass, authPrimaryButtonClass } from './AuthShell';

/**
 * Only reached when email verification is turned back on server-side
 * (currently off, see REQUIRE_EMAIL_VERIFICATION in the backend) -- signup
 * and login otherwise complete without ever routing here.
 */
export function VerifyCodeStep({
  email,
  purpose,
  onSuccess,
  onBack,
}: {
  email: string;
  purpose: 'signup' | 'login';
  onSuccess: (tokens: AuthTokens) => void;
  onBack: () => void;
}) {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const tokens = purpose === 'signup' ? await verifySignup(email, code.trim()) : await verifyLogin(email, code.trim());
      setSession(tokens.sessionToken, tokens.deviceToken);
      onSuccess(tokens);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-1 flex-col">
      <h2 className="text-ink-900 mb-1 text-2xl font-extrabold">Check your email</h2>
      <p className="text-ink-600 mb-6 text-sm">
        We sent a 6-digit code to <span className="font-semibold">{email}</span>. Enter it below to continue.
      </p>

      <AuthError message={error} />

      <div className="mb-6">
        <AuthField label="Verification code">
          <input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            required
            className={`${authInputClass} text-center text-2xl font-bold tracking-[0.5em]`}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="000000"
          />
        </AuthField>
      </div>

      <button type="submit" disabled={loading || code.length !== 6} className={authPrimaryButtonClass}>
        {loading ? 'Verifying…' : 'Verify'}
      </button>

      <button type="button" onClick={onBack} className="text-ink-400 mt-4 self-center text-sm font-semibold">
        Didn't get a code? Go back
      </button>
    </form>
  );
}
