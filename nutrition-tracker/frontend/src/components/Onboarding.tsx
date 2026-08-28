import { useState } from 'react';

const STEPS = [
  {
    title: 'Log food your way',
    body: 'Just type what you ate — "chicken karahi and two rotis" — or snap a photo. No searching through endless menus.',
    emoji: '📝',
  },
  {
    title: 'Built for Pakistani food',
    body: 'Karahi, biryani, nihari, daal chawal — real dishes with real portion sizes, not generic estimates.',
    emoji: '🍛',
  },
  {
    title: "See where you're at",
    body: 'Track calories, protein, carbs, and fat for the day at a glance.',
    emoji: '📊',
  },
];

export function Onboarding({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0);
  const isLast = step === STEPS.length - 1;
  const current = STEPS[step];

  return (
    <div className="flex flex-1 flex-col justify-between px-6 pt-16 pb-8">
      <div className="flex flex-col items-center text-center">
        <div className="mb-8 text-6xl">{current.emoji}</div>
        <h1 className="text-ink-900 mb-3 text-2xl font-extrabold">{current.title}</h1>
        <p className="text-ink-600 max-w-xs leading-relaxed">{current.body}</p>
      </div>

      <div>
        <div className="mb-6 flex justify-center gap-2">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={`h-2 rounded-full transition-all ${
                i === step ? 'bg-primary-500 w-6' : 'bg-primary-100 w-2'
              }`}
            />
          ))}
        </div>
        <button
          onClick={() => (isLast ? onDone() : setStep((s) => s + 1))}
          className="bg-primary-500 hover:bg-primary-600 w-full rounded-2xl py-4 text-lg font-bold text-white shadow-sm transition-colors"
        >
          {isLast ? "Let's go" : 'Next'}
        </button>
        {!isLast && (
          <button onClick={onDone} className="text-ink-400 mt-3 w-full py-2 text-sm font-medium">
            Skip
          </button>
        )}
      </div>
    </div>
  );
}
