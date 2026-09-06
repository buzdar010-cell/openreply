/** Shared toggle UI -- used both inline in list rows and in a sub-screen header, so it needs to look identical wherever it appears. */
export function ToggleSwitch({ enabled, onChange }: { enabled: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onChange(!enabled);
      }}
      aria-label={enabled ? 'Turn off' : 'Turn on'}
      className={`h-8 w-14 shrink-0 rounded-full p-1 transition-colors ${enabled ? 'bg-primary-500' : 'bg-cream-200'}`}
    >
      <div className={`h-6 w-6 rounded-full bg-white shadow-sm transition-transform ${enabled ? 'translate-x-6' : ''}`} />
    </button>
  );
}
