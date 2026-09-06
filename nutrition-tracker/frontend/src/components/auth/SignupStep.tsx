import { useState } from 'react';
import { signup, type AuthTokens } from '../../lib/api';
import { setSession } from '../../lib/session';
import { AuthField, AuthError, authInputClass, authPrimaryButtonClass } from './AuthShell';

export function SignupStep({
  onSuccess,
  onNeedVerification,
  onSwitchToLogin,
}: {
  onSuccess: (tokens: AuthTokens) => void;
  onNeedVerification: (email: string) => void;
  onSwitchToLogin: () => void;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const passwordsMatch = password === confirmPassword;
  const canSubmit = email.trim() && password.length >= 8 && passwordsMatch;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setLoading(true);
    setError(null);
    try {
      const tokens = await signup(email.trim(), password);
      if (tokens) {
        setSession(tokens.sessionToken, tokens.deviceToken);
        onSuccess(tokens);
      } else {
        onNeedVerification(email.trim());
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-1 flex-col">
      <h2 className="text-ink-900 mb-1 text-2xl font-extrabold">Create your account</h2>
      <p className="text-ink-600 mb-6 text-sm">Track your meals and calories across every device.</p>

      <AuthError message={error} />

      <div className="mb-2 flex flex-col gap-3">
        <AuthField label="Email">
          <input
            type="email"
            autoComplete="email"
            required
            className={authInputClass}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
        </AuthField>
        <AuthField label="Password">
          <input
            type="password"
            autoComplete="new-password"
            required
            className={authInputClass}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 8 characters"
          />
        </AuthField>
        <AuthField label="Confirm password">
          <input
            type="password"
            autoComplete="new-password"
            required
            className={authInputClass}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="••••••••"
          />
        </AuthField>
        {confirmPassword && !passwordsMatch && <p className="text-danger-500 text-xs font-medium">Passwords don't match</p>}
      </div>

      <p className="text-ink-400 mb-6 text-xs">By continuing you agree to keep your account details accurate and secure.</p>

      <button type="submit" disabled={loading || !canSubmit} className={authPrimaryButtonClass}>
        {loading ? 'Creating account…' : 'Sign up'}
      </button>

      <p className="text-ink-600 mt-6 text-center text-sm">
        Already have an account?{' '}
        <button type="button" onClick={onSwitchToLogin} className="text-primary-600 font-semibold">
          Log in
        </button>
      </p>
    </form>
  );
}
