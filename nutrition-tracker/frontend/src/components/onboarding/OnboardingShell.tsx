import { type ReactNode } from 'react';

/** Shared visual frame for every onboarding step -- progress dots + a primary action, consistent across steps. */
export function OnboardingShell({
  stepIndex,
  totalSteps,
  children,
  primaryLabel,
  onPrimary,
  primaryDisabled,
  secondaryLabel,
  onSecondary,
}: {
  stepIndex: number;
  totalSteps: number;
  children: ReactNode;
  primaryLabel: string;
  onPrimary: () => void;
  primaryDisabled?: boolean;
  secondaryLabel?: string;
  onSecondary?: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col justify-between px-6 pt-12 pb-8">
      <div className="flex flex-1 flex-col">{children}</div>

      <div>
        <div className="mb-6 flex justify-center gap-2">
          {Array.from({ length: totalSteps }).map((_, i) => (
            <div
              key={i}
              className={`h-2 rounded-full transition-all ${
                i === stepIndex ? 'bg-primary-500 w-6' : 'bg-primary-100 w-2'
              }`}
            />
          ))}
        </div>
        <button
          onClick={onPrimary}
          disabled={primaryDisabled}
          className="bg-primary-500 hover:bg-primary-600 w-full rounded-2xl py-4 text-lg font-bold text-white shadow-sm transition-colors disabled:opacity-40"
        >
          {primaryLabel}
        </button>
        {secondaryLabel && onSecondary && (
          <button onClick={onSecondary} className="text-ink-400 mt-3 w-full py-2 text-sm font-medium">
            {secondaryLabel}
          </button>
        )}
      </div>
    </div>
  );
}
