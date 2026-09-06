import { useState } from 'react';
import { AuthShell } from './auth/AuthShell';
import { LoginStep } from './auth/LoginStep';
import { SignupStep } from './auth/SignupStep';
import { VerifyCodeStep } from './auth/VerifyCodeStep';
import { ForgotPasswordStep } from './auth/ForgotPasswordStep';
import { ResetPasswordStep } from './auth/ResetPasswordStep';
import type { AuthTokens } from '../lib/api';

type Mode = 'login' | 'signup' | 'verify' | 'forgot' | 'reset';

export function AuthFlow({ onAuthenticated }: { onAuthenticated: (tokens: AuthTokens) => void }) {
  const [mode, setMode] = useState<Mode>('login');
  const [pendingEmail, setPendingEmail] = useState('');
  const [pendingPurpose, setPendingPurpose] = useState<'signup' | 'login'>('signup');

  return (
    <AuthShell>
      {mode === 'login' && (
        <LoginStep
          onSuccess={onAuthenticated}
          onNeedVerification={(email) => {
            setPendingEmail(email);
            setPendingPurpose('login');
            setMode('verify');
          }}
          onForgotPassword={() => setMode('forgot')}
          onSwitchToSignup={() => setMode('signup')}
        />
      )}

      {mode === 'signup' && (
        <SignupStep
          onSuccess={onAuthenticated}
          onNeedVerification={(email) => {
            setPendingEmail(email);
            setPendingPurpose('signup');
            setMode('verify');
          }}
          onSwitchToLogin={() => setMode('login')}
        />
      )}

      {mode === 'verify' && (
        <VerifyCodeStep
          email={pendingEmail}
          purpose={pendingPurpose}
          onSuccess={onAuthenticated}
          onBack={() => setMode(pendingPurpose === 'signup' ? 'signup' : 'login')}
        />
      )}

      {mode === 'forgot' && (
        <ForgotPasswordStep
          onSubmitted={(email) => {
            setPendingEmail(email);
            setMode('reset');
          }}
          onBack={() => setMode('login')}
        />
      )}

      {mode === 'reset' && <ResetPasswordStep email={pendingEmail} onSuccess={() => setMode('login')} onBack={() => setMode('forgot')} />}
    </AuthShell>
  );
}
