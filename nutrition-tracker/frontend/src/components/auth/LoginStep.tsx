import { useState } from 'react';
import { login, type AuthTokens } from '../../lib/api';
import { getDeviceToken, setSession } from '../../lib/session';
import { AuthField, AuthError, authInputClass, authPrimaryButtonClass } from './AuthShell';

export function LoginStep({
  onSuccess,
  onNeedVerification,
  onForgotPassword,
  onSwitchToSignup,
}: {
  onSuccess: (tokens: AuthTokens) => void;
  onNeedVerification: (email: string) => void;
  onForgotPassword: () => void;
  onSwitchToSignup: () => void;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const result = await login(email.trim(), password, getDeviceToken());
      if (result.status === 'logged_in') {
        setSession(result.sessionToken, result.deviceToken);
        onSuccess(result);
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
      <h2 className="text-ink-900 mb-1 text-2xl font-extrabold">Welcome back</h2>
      <p className="text-ink-600 mb-6 text-sm">Log in to pick up where you left off.</p>

      <AuthError message={error} />

      <div className="mb-4 flex flex-col gap-3">
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
            autoComplete="current-password"
            required
            className={authInputClass}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />
        </AuthField>
      </div>

      <button type="button" onClick={onForgotPassword} className="text-primary-600 mb-6 self-end text-sm font-semibold">
        Forgot password?
      </button>

      <button type="submit" disabled={loading || !email.trim() || !password} className={authPrimaryButtonClass}>
        {loading ? 'Logging in…' : 'Log in'}
      </button>

      <p className="text-ink-600 mt-6 text-center text-sm">
        Don't have an account?{' '}
        <button type="button" onClick={onSwitchToSignup} className="text-primary-600 font-semibold">
          Sign up
        </button>
      </p>
    </form>
  );
}
