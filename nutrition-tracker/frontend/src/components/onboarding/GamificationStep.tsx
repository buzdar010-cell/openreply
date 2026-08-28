export function GamificationStep({ enabled, onChange }: { enabled: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center text-center">
      <div className="mb-6 text-6xl">🔥</div>
      <h1 className="text-ink-900 mb-3 text-2xl font-extrabold">Streaks &amp; levels</h1>
      <p className="text-ink-600 mb-8 max-w-xs leading-relaxed">
        We can show a streak for consecutive days logged and a level that grows as you use the app — purely for fun, entirely
        optional, and never something to feel bad about missing.
      </p>

      <div className="border-cream-200 flex w-full items-center justify-between rounded-2xl border bg-surface p-4">
        <div className="text-left">
          <div className="text-ink-900 font-bold">{enabled ? 'Turned on' : 'Turned off'}</div>
          <div className="text-ink-400 text-xs">You can change this anytime in Settings</div>
        </div>
        <button
          type="button"
          onClick={() => onChange(!enabled)}
          className={`h-8 w-14 shrink-0 rounded-full p-1 transition-colors ${enabled ? 'bg-primary-500' : 'bg-cream-200'}`}
        >
          <div className={`h-6 w-6 rounded-full bg-surface shadow-sm transition-transform ${enabled ? 'translate-x-6' : ''}`} />
        </button>
      </div>
    </div>
  );
}
