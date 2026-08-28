import { useEffect, useState } from 'react';
import { getDeviceId } from '../lib/device';
import { getProfile, saveProfile, submitFeedback } from '../lib/api';
import { GoalsStep, isGoalsDataValid, type GoalsData } from './onboarding/GoalsStep';
import { GamificationStep } from './onboarding/GamificationStep';
import { ThemePicker } from './ThemePicker';

const ONBOARDED_KEY = 'nutrition-tracker-onboarded';
const DEVICE_KEY = 'nutrition-tracker-device-id';

const EMPTY_GOALS: GoalsData = {
  weight_kg: '',
  height_cm: '',
  age: '',
  gender: 'male',
  activity_level: 'moderate',
  goal: 'maintain',
};

export function SettingsScreen() {
  const [goals, setGoals] = useState<GoalsData>(EMPTY_GOALS);
  const [gamification, setGamification] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');

  const [feedback, setFeedback] = useState('');
  const [feedbackStatus, setFeedbackStatus] = useState<'idle' | 'sending' | 'sent'>('idle');

  useEffect(() => {
    getProfile(getDeviceId())
      .then((p) => {
        if (p) {
          setGoals({
            weight_kg: p.weight_kg?.toString() ?? '',
            height_cm: p.height_cm?.toString() ?? '',
            age: p.age?.toString() ?? '',
            gender: p.gender ?? 'male',
            activity_level: p.activity_level ?? 'moderate',
            goal: p.goal ?? 'maintain',
          });
          setGamification(p.gamification_enabled === 1);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  async function handleSaveGoals() {
    if (!isGoalsDataValid(goals)) return;
    setSaveStatus('saving');
    try {
      await saveProfile(getDeviceId(), {
        weight_kg: Number(goals.weight_kg),
        height_cm: Number(goals.height_cm),
        age: Number(goals.age),
        gender: goals.gender,
        activity_level: goals.activity_level,
        goal: goals.goal,
        gamification_enabled: gamification,
      });
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch {
      setSaveStatus('idle');
    }
  }

  async function handleSendFeedback() {
    if (!feedback.trim()) return;
    setFeedbackStatus('sending');
    try {
      await submitFeedback(getDeviceId(), feedback.trim(), 'settings');
      setFeedback('');
      setFeedbackStatus('sent');
      setTimeout(() => setFeedbackStatus('idle'), 2500);
    } catch {
      setFeedbackStatus('idle');
    }
  }

  function handleResetApp() {
    localStorage.removeItem(ONBOARDED_KEY);
    localStorage.removeItem(DEVICE_KEY);
    window.location.reload();
  }

  if (loading) {
    return <div className="text-ink-400 flex flex-1 items-center justify-center text-sm">Loading…</div>;
  }

  return (
    <div className="flex flex-1 flex-col overflow-y-auto px-5 pt-8 pb-24">
      <h1 className="text-ink-900 mb-6 text-2xl font-extrabold">Settings</h1>

      <h2 className="text-ink-900 mb-3 text-lg font-bold">Appearance</h2>
      <div className="mb-8">
        <ThemePicker />
      </div>

      <h2 className="text-ink-900 mb-3 text-lg font-bold">Your goal</h2>
      <div className="mb-3">
        <GoalsStep data={goals} onChange={setGoals} showHeading={false} />
      </div>
      <button
        onClick={handleSaveGoals}
        disabled={!isGoalsDataValid(goals) || saveStatus === 'saving'}
        className="bg-primary-500 hover:bg-primary-600 mb-8 rounded-2xl py-3 font-bold text-white shadow-sm transition-colors disabled:opacity-40"
      >
        {saveStatus === 'saved' ? 'Saved ✓' : saveStatus === 'saving' ? 'Saving…' : 'Save goal'}
      </button>

      <h2 className="text-ink-900 mb-3 text-lg font-bold">Gamification</h2>
      <div className="mb-8">
        <GamificationStep enabled={gamification} onChange={setGamification} />
      </div>

      <h2 className="text-ink-900 mb-3 text-lg font-bold">Feedback</h2>
      <textarea
        value={feedback}
        onChange={(e) => setFeedback(e.target.value)}
        placeholder="Something wrong, or an idea for the app? Let us know."
        rows={3}
        className="border-primary-100 focus:border-primary-500 text-ink-900 mb-3 resize-none rounded-2xl border-2 bg-surface p-4 text-base outline-none placeholder:text-ink-400/60"
      />
      <button
        onClick={handleSendFeedback}
        disabled={!feedback.trim() || feedbackStatus === 'sending'}
        className="bg-primary-500 hover:bg-primary-600 mb-8 rounded-2xl py-3 font-bold text-white shadow-sm transition-colors disabled:opacity-40"
      >
        {feedbackStatus === 'sent' ? 'Sent ✓' : feedbackStatus === 'sending' ? 'Sending…' : 'Send feedback'}
      </button>

      <h2 className="text-ink-900 mb-3 text-lg font-bold">Data</h2>
      <button onClick={handleResetApp} className="text-danger-500 border-danger-500/30 rounded-2xl border py-3 text-sm font-bold">
        Reset app (clears local data, re-shows onboarding)
      </button>
    </div>
  );
}
