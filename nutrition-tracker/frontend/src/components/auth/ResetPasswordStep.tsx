import { useState } from 'react';
import { resetPassword } from '../../lib/api';
import { showToast } from '../../lib/toast';
import { AuthField, AuthError, authInputClass, authPrimaryButtonClass } from './AuthShell';

export function ResetPasswordStep({ email, onSuccess, onBack }: { email: string; onSuccess: () => void; onBack: () => void }) {
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const passwordsMatch = newPassword === confirmPassword;
  const canSubmit = code.length === 6 && newPassword.length >= 8 && passwordsMatch;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setLoading(true);
    setError(null);
    try {
      await resetPassword(email, code.trim(), newPassword);
      showToast('Password reset — log in with your new password');
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-1 flex-col">
      <h2 className="text-ink-900 mb-1 text-2xl font-extrabold">Enter your code</h2>
      <p className="text-ink-600 mb-6 text-sm">
        We sent a 6-digit code to <span className="font-semibold">{email}</span>. Enter it along with your new password.
      </p>

      <AuthError message={error} />

      <div className="mb-2 flex flex-col gap-3">
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
        <AuthField label="New password">
          <input
            type="password"
            autoComplete="new-password"
            required
            className={authInputClass}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="At least 8 characters"
          />
        </AuthField>
        <AuthField label="Confirm new password">
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

      <button type="submit" disabled={loading || !canSubmit} className={`${authPrimaryButtonClass} mt-4`}>
        {loading ? 'Resetting…' : 'Reset password'}
      </button>

      <button type="button" onClick={onBack} className="text-ink-400 mt-4 self-center text-sm font-semibold">
        Back
      </button>
    </form>
  );
}
