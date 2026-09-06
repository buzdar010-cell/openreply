export type Tab = 'home' | 'logs' | 'settings';

export function BottomNav({ tab, onChange }: { tab: Tab; onChange: (t: Tab) => void }) {
  const items: { id: Tab; label: string; emoji: string }[] = [
    { id: 'home', label: 'Home', emoji: '🏠' },
    { id: 'logs', label: 'Logs', emoji: '📋' },
    { id: 'settings', label: 'Settings', emoji: '⚙️' },
  ];

  return (
    <nav className="border-cream-200 fixed bottom-0 left-0 right-0 z-30 mx-auto flex max-w-[480px] border-t bg-surface pb-[env(safe-area-inset-bottom)]">
      {items.map((item) => (
        <button
          key={item.id}
          onClick={() => onChange(item.id)}
          className={`flex flex-1 flex-col items-center gap-0.5 py-3 text-xs font-semibold transition-colors ${
            tab === item.id ? 'text-primary-600' : 'text-ink-400'
          }`}
        >
          <span className="text-xl">{item.emoji}</span>
          {item.label}
        </button>
      ))}
    </nav>
  );
}
