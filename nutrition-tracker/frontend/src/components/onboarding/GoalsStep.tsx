import type { ActivityLevel, Gender, Goal } from '../../lib/api';

export interface GoalsData {
  weight_kg: string;
  height_cm: string;
  age: string;
  gender: Gender | '';
  activity_level: ActivityLevel | '';
  goal: Goal;
}

const ACTIVITY_OPTIONS: { value: ActivityLevel; label: string }[] = [
  { value: 'sedentary', label: 'Sedentary (little/no exercise)' },
  { value: 'light', label: 'Light (1-3 days/week)' },
  { value: 'moderate', label: 'Moderate (3-5 days/week)' },
  { value: 'active', label: 'Active (6-7 days/week)' },
  { value: 'very_active', label: 'Very active (physical job or 2x/day)' },
];

export const GOAL_OPTIONS: { value: Goal; label: string; emoji: string }[] = [
  { value: 'lose', label: 'Lose weight', emoji: '📉' },
  { value: 'maintain', label: 'Maintain weight', emoji: '⚖️' },
  { value: 'gain', label: 'Gain weight', emoji: '📈' },
];

function field(label: string, input: React.ReactNode, required = false) {
  return (
    <label className="block">
      <span className="text-ink-600 mb-1 block text-xs font-semibold">
        {label} {required && <span className="text-danger-500">*</span>}
      </span>
      {input}
    </label>
  );
}

const inputClass =
  'border-primary-100 focus:border-primary-500 text-ink-900 w-full rounded-xl border-2 bg-surface px-3 py-2.5 text-base outline-none';

export function GoalsStep({
  data,
  onChange,
  showHeading = true,
}: {
  data: GoalsData;
  onChange: (d: GoalsData) => void;
  showHeading?: boolean;
}) {
  return (
    <div className="flex flex-1 flex-col">
      {showHeading && (
        <>
          <h1 className="text-ink-900 mb-1 text-2xl font-extrabold">Let's set your goal</h1>
          <p className="text-ink-600 mb-1 text-sm">This tunes your daily calorie target — you can change it anytime in Settings.</p>
        </>
      )}
      <p className="text-ink-400 mb-4 text-xs">
        Weight, height, age, gender, and activity level (<span className="text-danger-500">*</span>) are all required to calculate it.
      </p>

      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-3 gap-2">
          {GOAL_OPTIONS.map((g) => (
            <button
              key={g.value}
              type="button"
              onClick={() => onChange({ ...data, goal: g.value })}
              className={`rounded-xl border-2 py-3 text-center text-xs font-semibold transition-colors ${
                data.goal === g.value ? 'border-primary-500 bg-primary-50 text-primary-600' : 'border-cream-200 bg-surface text-ink-600'
              }`}
            >
              <div className="mb-1 text-lg">{g.emoji}</div>
              {g.label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3">
          {field(
            'Weight (kg)',
            <input
              type="number"
              inputMode="decimal"
              required
              className={inputClass}
              value={data.weight_kg}
              onChange={(e) => onChange({ ...data, weight_kg: e.target.value })}
              placeholder="70"
            />,
            true,
          )}
          {field(
            'Height (cm)',
            <input
              type="number"
              inputMode="decimal"
              required
              className={inputClass}
              value={data.height_cm}
              onChange={(e) => onChange({ ...data, height_cm: e.target.value })}
              placeholder="170"
            />,
            true,
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          {field(
            'Age',
            <input
              type="number"
              inputMode="numeric"
              required
              className={inputClass}
              value={data.age}
              onChange={(e) => onChange({ ...data, age: e.target.value })}
              placeholder="30"
            />,
            true,
          )}
          {field(
            'Gender',
            <select
              className={inputClass}
              value={data.gender}
              onChange={(e) => onChange({ ...data, gender: e.target.value as Gender | '' })}
            >
              <option value="">Please select</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
            </select>,
            true,
          )}
        </div>

        {field(
          'Activity level',
          <select
            className={inputClass}
            value={data.activity_level}
            onChange={(e) => onChange({ ...data, activity_level: e.target.value as ActivityLevel | '' })}
          >
            <option value="">Please select</option>
            {ACTIVITY_OPTIONS.map((a) => (
              <option key={a.value} value={a.value}>
                {a.label}
              </option>
            ))}
          </select>,
          true,
        )}
      </div>
    </div>
  );
}

export function isGoalsDataValid(d: GoalsData): boolean {
  const weight = Number(d.weight_kg);
  const height = Number(d.height_cm);
  const age = Number(d.age);
  return (
    weight > 0 &&
    weight < 500 &&
    height > 0 &&
    height < 300 &&
    age > 0 &&
    age < 120 &&
    d.gender !== '' &&
    d.activity_level !== ''
  );
}
