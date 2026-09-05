const SLIDES = [
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

export function IntroStep({ slide }: { slide: number }) {
  const current = SLIDES[slide];
  return (
    <div className="flex flex-1 flex-col items-center justify-center text-center">
      <div className="mb-8 text-6xl">{current.emoji}</div>
      <h1 className="text-ink-900 mb-3 text-2xl font-extrabold">{current.title}</h1>
      <p className="text-ink-600 max-w-xs leading-relaxed">{current.body}</p>
    </div>
  );
}

export const INTRO_SLIDE_COUNT = SLIDES.length;
