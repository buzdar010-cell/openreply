import { useState } from 'react';
import { OnboardingShell } from './onboarding/OnboardingShell';
import { IntroStep, INTRO_SLIDE_COUNT } from './onboarding/IntroStep';
import { GoalsStep, isGoalsDataValid, type GoalsData } from './onboarding/GoalsStep';
import { GamificationStep } from './onboarding/GamificationStep';
import { InstallStep } from './onboarding/InstallStep';
import { saveProfile, setGamification, type Gender, type ActivityLevel } from '../lib/api';
import { getDeviceId } from '../lib/device';

type Phase = 'intro' | 'goals' | 'gamification' | 'install';
const PHASE_ORDER: Phase[] = ['intro', 'goals', 'gamification', 'install'];
const TOTAL_STEPS = INTRO_SLIDE_COUNT + 3; // 3 intro slides + goals + gamification + install

const DEFAULT_GOALS: GoalsData = {
  weight_kg: '',
  height_cm: '',
  age: '',
  gender: '',
  activity_level: '',
  goal: 'maintain',
};

export function Onboarding({ onDone }: { onDone: () => void }) {
  const [phase, setPhase] = useState<Phase>('intro');
  const [introSlide, setIntroSlide] = useState(0);
  const [goals, setGoals] = useState<GoalsData>(DEFAULT_GOALS);
  const [gamificationEnabled, setGamificationEnabled] = useState(false);
  const [saving, setSaving] = useState(false);

  const stepIndex =
    phase === 'intro'
      ? introSlide
      : phase === 'goals'
        ? INTRO_SLIDE_COUNT
        : phase === 'gamification'
          ? INTRO_SLIDE_COUNT + 1
          : INTRO_SLIDE_COUNT + 2;

  function handleGamificationChange(enabled: boolean) {
    setGamificationEnabled(enabled);
    // Standalone save -- never gated on the rest of the profile being
    // complete (that coupling was exactly the bug: toggle it during
    // onboarding via "Skip this" on goals, and it used to silently never
    // persist). Fire-and-forget, no toast here -- this is mid-flow, not a
    // standalone user action, so a banner would just be noise.
    setGamification(getDeviceId(), enabled).catch(() => {});
  }

  async function finish() {
    setSaving(true);
    try {
      // Goals are optional -- if left blank, skip saving a profile rather
      // than send invalid numbers; the app falls back sensibly without one.
      // (Gamification itself is already saved independently above, so
      // skipping this never loses that choice.)
      if (isGoalsDataValid(goals)) {
        await saveProfile(getDeviceId(), {
          weight_kg: Number(goals.weight_kg),
          height_cm: Number(goals.height_cm),
          age: Number(goals.age),
          gender: goals.gender as Gender,
          activity_level: goals.activity_level as ActivityLevel,
          goal: goals.goal,
          gamification_enabled: gamificationEnabled,
        });
      }
    } catch {
      // Non-fatal -- onboarding shouldn't get stuck if the network hiccups;
      // Settings lets them set this up later regardless.
    } finally {
      setSaving(false);
      onDone();
    }
  }

  function goToNextPhase() {
    const idx = PHASE_ORDER.indexOf(phase);
    if (idx < PHASE_ORDER.length - 1) setPhase(PHASE_ORDER[idx + 1]);
    else finish();
  }

  if (phase === 'intro') {
    const isLastIntroSlide = introSlide === INTRO_SLIDE_COUNT - 1;
    return (
      <OnboardingShell
        stepIndex={stepIndex}
        totalSteps={TOTAL_STEPS}
        primaryLabel={isLastIntroSlide ? 'Next' : 'Next'}
        onPrimary={() => (isLastIntroSlide ? goToNextPhase() : setIntroSlide((s) => s + 1))}
        secondaryLabel="Skip setup"
        onSecondary={finish}
      >
        <IntroStep slide={introSlide} />
      </OnboardingShell>
    );
  }

  if (phase === 'goals') {
    return (
      <OnboardingShell
        stepIndex={stepIndex}
        totalSteps={TOTAL_STEPS}
        primaryLabel="Continue"
        onPrimary={goToNextPhase}
        primaryDisabled={!isGoalsDataValid(goals)}
        secondaryLabel="Skip this"
        onSecondary={goToNextPhase}
      >
        <GoalsStep data={goals} onChange={setGoals} />
      </OnboardingShell>
    );
  }

  if (phase === 'gamification') {
    return (
      <OnboardingShell stepIndex={stepIndex} totalSteps={TOTAL_STEPS} primaryLabel="Continue" onPrimary={goToNextPhase}>
        <GamificationStep enabled={gamificationEnabled} onChange={handleGamificationChange} />
      </OnboardingShell>
    );
  }

  return (
    <OnboardingShell
      stepIndex={stepIndex}
      totalSteps={TOTAL_STEPS}
      primaryLabel={saving ? 'Getting things ready…' : "Let's go"}
      onPrimary={finish}
      primaryDisabled={saving}
    >
      <InstallStep />
    </OnboardingShell>
  );
}
