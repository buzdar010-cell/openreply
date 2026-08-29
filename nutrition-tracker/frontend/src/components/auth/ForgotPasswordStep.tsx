import { useState } from 'react';
import { forgotPassword } from '../../lib/api';
import { AuthField, AuthError, authInputClass, authPrimaryButtonClass } from './AuthShell';

export function ForgotPasswordStep({ onSubmitted, onBack }: { onSubmitted: (email: string) => void; onBack: () => void }) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await forgotPassword(email.trim());
      onSubmitted(email.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-1 flex-col">
      <h2 className="text-ink-900 mb-1 text-2xl font-extrabold">Reset your password</h2>
      <p className="text-ink-600 mb-6 text-sm">Enter your account email and we'll send you a code to reset it.</p>

      <AuthError message={error} />

      <div className="mb-6">
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
      </div>

      <button type="submit" disabled={loading || !email.trim()} className={authPrimaryButtonClass}>
        {loading ? 'Sending code…' : 'Send reset code'}
      </button>

      <button type="button" onClick={onBack} className="text-ink-400 mt-4 self-center text-sm font-semibold">
        Back to login
      </button>
    </form>
  );
}
