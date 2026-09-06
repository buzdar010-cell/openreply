import type { ReactNode } from 'react';

/** Shared frame for every screen in the signup/login flow -- brand mark up top, scrollable form area below, consistent with the rest of the app's theme. */
export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-1 flex-col overflow-y-auto px-6 pt-14 pb-10">
      <div className="mb-8 flex flex-col items-center">
        <div className="mb-3 text-5xl">🍛</div>
        <h1 className="text-ink-900 text-xl font-extrabold">Nutrition Tracker</h1>
      </div>
      {children}
    </div>
  );
}

export const authInputClass =
  'border-primary-100 focus:border-primary-500 text-ink-900 w-full rounded-xl border-2 bg-surface px-3 py-2.5 text-base outline-none';

export const authPrimaryButtonClass =
  'bg-primary-500 hover:bg-primary-600 w-full rounded-2xl py-4 text-lg font-bold text-white shadow-sm transition-colors disabled:opacity-40';

export function AuthField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="text-ink-600 mb-1 block text-xs font-semibold">{label}</span>
      {children}
    </label>
  );
}

export function AuthError({ message }: { message: string | null }) {
  if (!message) return null;
  return <div className="bg-danger-500/10 text-danger-500 mb-4 rounded-xl px-4 py-3 text-sm font-medium">{message}</div>;
}
