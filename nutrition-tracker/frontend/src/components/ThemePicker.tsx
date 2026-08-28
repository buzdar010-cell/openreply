import { useState } from 'react';
import { getThemePreference, setThemePreference, type ThemePreference } from '../lib/theme';

const OPTIONS: { value: ThemePreference; label: string; emoji: string }[] = [
  { value: 'system', label: 'Match phone', emoji: '📱' },
  { value: 'light', label: 'Light', emoji: '☀️' },
  { value: 'dark', label: 'Dark', emoji: '🌙' },
];

export function ThemePicker() {
  const [pref, setPref] = useState<ThemePreference>(getThemePreference);

  return (
    <div className="grid grid-cols-3 gap-2">
      {OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => {
            setPref(opt.value);
            setThemePreference(opt.value);
          }}
          className={`rounded-xl border-2 py-3 text-center text-xs font-semibold transition-colors ${
            pref === opt.value ? 'border-primary-500 bg-primary-50 text-primary-600' : 'border-cream-200 bg-surface text-ink-600'
          }`}
        >
          <div className="mb-1 text-lg">{opt.emoji}</div>
          {opt.label}
        </button>
      ))}
    </div>
  );
}
