/** datetime-local inputs work in the browser's local time, not UTC -- format/parse accordingly. */
export function toDatetimeLocalValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function datetimeLocalValueToUnix(value: string): number {
  return Math.floor(new Date(value).getTime() / 1000);
}

/** Shared backdating control -- defaults to "now", only touched when logging something that happened earlier. */
export function WhenField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <label className="border-cream-200 mb-3 flex items-center justify-between gap-2 rounded-xl border bg-surface px-3 py-2">
      <span className="text-ink-600 text-xs font-semibold">🕐 When</span>
      <input
        type="datetime-local"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="text-ink-900 bg-transparent text-xs outline-none"
      />
    </label>
  );
}
