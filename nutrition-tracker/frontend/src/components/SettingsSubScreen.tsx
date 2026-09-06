import { type ReactNode } from 'react';

/** Shared shell for every Settings sub-screen (Profile & Goals, Feedback, Gamification detail) -- back arrow + title, optional header action like the gamification toggle. */
export function SettingsSubScreen({
  title,
  onBack,
  headerAction,
  children,
}: {
  title: string;
  onBack: () => void;
  headerAction?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-1 flex-col overflow-y-auto pb-24">
      <div className="flex items-center justify-between px-5 pt-8 pb-4">
        <button onClick={onBack} className="text-primary-600 flex items-center gap-1 text-sm font-bold">
          <span className="text-lg">←</span> Settings
        </button>
        {headerAction}
      </div>
      <h1 className="text-ink-900 mb-4 px-5 text-2xl font-extrabold">{title}</h1>
      <div className="flex flex-1 flex-col px-5">{children}</div>
    </div>
  );
}
