type Tab = 'log' | 'today';

export function BottomNav({ tab, onChange }: { tab: Tab; onChange: (t: Tab) => void }) {
  const items: { id: Tab; label: string; emoji: string }[] = [
    { id: 'log', label: 'Log', emoji: '📝' },
    { id: 'today', label: 'Today', emoji: '📊' },
  ];

  return (
    <nav className="border-cream-200 flex border-t bg-white pb-safe">
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
