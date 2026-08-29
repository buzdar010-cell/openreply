import { useEffect, useRef, useState, type ReactNode } from 'react';
import { getProfile, saveProfile, setGamification as setGamificationApi, submitFeedback, logout, getLogs, type Gender, type ActivityLevel } from '../lib/api';
import { GoalsStep, isGoalsDataValid, GOAL_OPTIONS, type GoalsData } from './onboarding/GoalsStep';
import { ThemePicker } from './ThemePicker';
import { ToggleSwitch } from './ToggleSwitch';
import { SettingsSubScreen } from './SettingsSubScreen';
import { showToast } from '../lib/toast';
import { buildFullDataExportJson } from '../lib/dataExport';
import { isPushSupported, getCurrentSubscription, enableWeightReminders, disableWeightReminders } from '../lib/push';

const ONBOARDED_KEY = 'nutrition-tracker-onboarded';

const EMPTY_GOALS: GoalsData = {
  weight_kg: '',
  height_cm: '',
  age: '',
  gender: '',
  activity_level: '',
  goal: 'maintain',
};

type View = 'main' | 'goals' | 'feedback' | 'gamification';

function SettingsCard({ children }: { children: ReactNode }) {
  return <div className="border-cream-200 divide-cream-200 mb-6 divide-y overflow-hidden rounded-2xl border bg-surface">{children}</div>;
}

function SettingsRow({
  icon,
  label,
  value,
  onClick,
  trailing,
}: {
  icon: string;
  label: string;
  value?: string;
  onClick?: () => void;
  trailing?: ReactNode;
}) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag onClick={onClick} className="flex w-full items-center justify-between gap-3 p-4 text-left">
      <div className="flex items-center gap-3">
        <span className="text-xl">{icon}</span>
        <div>
          <div className="text-ink-900 text-sm font-bold">{label}</div>
          {value && <div className="text-ink-400 text-xs">{value}</div>}
        </div>
      </div>
      {trailing ?? (onClick && <span className="text-ink-400 text-lg">›</span>)}
    </Tag>
  );
}

export function SettingsScreen({ resetSignal }: { resetSignal: number }) {
  const [view, setView] = useState<View>('main');
  // Kept in sync with `view` after every render (refs don't trigger
  // re-renders) so the popstate cleanup below always sees the latest
  // value, not the one from whenever its effect first ran.
  const viewRef = useRef(view);
  useEffect(() => {
    viewRef.current = view;
  }, [view]);

  // A sub-screen push a real history entry, so the browser/iOS-native
  // swipe-back gesture (which operates on browser history, not React
  // state) actually has something to go back to -- without this, the app
  // never touched window.history, so there was nothing for the gesture
  // to act on and only the in-app back button worked.
  useEffect(() => {
    function handlePopState(e: PopStateEvent) {
      setView((e.state as { settingsView?: View } | null)?.settingsView ?? 'main');
    }
    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
      // Leaving Settings (switching tabs) while a sub-screen pushed an
      // entry -- pop it now so it doesn't sit there as a stale forward
      // step the next swipe-back would land on unexpectedly.
      if (viewRef.current !== 'main') window.history.back();
    };
  }, []);

  // Tapping the Settings tab again while already on it doesn't remount
  // this component (the tab doesn't change), so nothing would otherwise
  // reset a sub-screen back to the main list. Routes through the same
  // history.back() as the in-app back button so browser history and
  // `view` never drift apart.
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    if (viewRef.current !== 'main') window.history.back();
  }, [resetSignal]);

  function navigateToView(v: View) {
    window.history.pushState({ settingsView: v }, '');
    setView(v);
  }

  function goBack() {
    window.history.back();
  }

  const [goals, setGoals] = useState<GoalsData>(EMPTY_GOALS);
  const [savedGoals, setSavedGoals] = useState<GoalsData>(EMPTY_GOALS);
  const [dailyTarget, setDailyTarget] = useState<number | null>(null);
  const [gamification, setGamificationState] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [feedback, setFeedback] = useState('');
  const [sendingFeedback, setSendingFeedback] = useState(false);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [exporting, setExporting] = useState(false);

  const [remindersEnabled, setRemindersEnabled] = useState(false);
  const [remindersBusy, setRemindersBusy] = useState(false);

  useEffect(() => {
    getCurrentSubscription()
      .then((sub) => setRemindersEnabled(sub !== null))
      .catch(() => {});
  }, []);

  useEffect(() => {
    getProfile()
      .then((p) => {
        if (p) {
          const loaded: GoalsData = {
            weight_kg: p.weight_kg?.toString() ?? '',
            height_cm: p.height_cm?.toString() ?? '',
            age: p.age?.toString() ?? '',
            gender: p.gender ?? '',
            activity_level: p.activity_level ?? '',
            goal: p.goal ?? 'maintain',
          };
          setGoals(loaded);
          setSavedGoals(loaded);
          setDailyTarget(p.daily_calorie_target);
          setGamificationState(p.gamification_enabled === 1);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const isDirty = JSON.stringify(goals) !== JSON.stringify(savedGoals);
  const goalLabel = GOAL_OPTIONS.find((g) => g.value === goals.goal)?.label;

  async function handleSaveGoals() {
    if (!isGoalsDataValid(goals) || !isDirty) return;
    setSaving(true);
    try {
      const result = await saveProfile({
        weight_kg: Number(goals.weight_kg),
        height_cm: Number(goals.height_cm),
        age: Number(goals.age),
        gender: goals.gender as Gender,
        activity_level: goals.activity_level as ActivityLevel,
        goal: goals.goal,
        gamification_enabled: gamification,
      });
      setSavedGoals(goals);
      setDailyTarget(result.daily_calorie_target);
      showToast('Profile updated');
      goBack();
    } catch {
      showToast('Failed to save — try again', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleGamificationToggle(enabled: boolean) {
    setGamificationState(enabled); // optimistic
    try {
      await setGamificationApi(enabled);
      showToast(enabled ? 'Gamification turned on' : 'Gamification turned off');
    } catch {
      setGamificationState(!enabled); // revert on failure
      showToast('Failed to update — try again', 'error');
    }
  }

  async function handleRemindersToggle(enabled: boolean) {
    setRemindersBusy(true);
    try {
      if (enabled) {
        const granted = await enableWeightReminders();
        setRemindersEnabled(granted);
        if (!granted) showToast('Notifications permission is needed for reminders', 'error');
      } else {
        await disableWeightReminders();
        setRemindersEnabled(false);
      }
    } catch {
      showToast('Failed to update — try again', 'error');
    } finally {
      setRemindersBusy(false);
    }
  }

  async function handleSendFeedback() {
    if (!feedback.trim()) return;
    setSendingFeedback(true);
    try {
      await submitFeedback(feedback.trim(), 'settings');
      setFeedback('');
      showToast('Feedback sent — thank you!');
      goBack();
    } catch {
      showToast('Failed to send — try again', 'error');
    } finally {
      setSendingFeedback(false);
    }
  }

  function handleResetApp() {
    showToast('App reset');
    localStorage.removeItem(ONBOARDED_KEY);
    setTimeout(() => window.location.reload(), 500);
  }

  async function handleLogout() {
    await logout();
    // Clear the onboarding cache too -- otherwise a different account
    // logging in on this same device would skip onboarding based on
    // this account's history.
    localStorage.removeItem(ONBOARDED_KEY);
    window.location.reload();
  }

  async function handleExportData() {
    setExporting(true);
    try {
      // Real accounts already make cross-device recovery a non-issue --
      // this is for taking your own data out of the app entirely, so it
      // needs everything: profile/goals/streak state, not just logs (the
      // Logs screen's CSV export deliberately stays food-log-only, for
      // opening in a spreadsheet).
      const now = Math.floor(Date.now() / 1000);
      const [profileData, logs] = await Promise.all([getProfile(), getLogs(0, now)]);
      const json = buildFullDataExportJson(profileData, logs);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'nutrition-tracker-data-export.json';
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      showToast('Failed to export — try again', 'error');
    } finally {
      setExporting(false);
    }
  }

  if (loading) {
    return <div className="text-ink-400 flex flex-1 items-center justify-center text-sm">Loading…</div>;
  }

  if (view === 'goals') {
    return (
      <SettingsSubScreen title="Profile & Goals" onBack={goBack}>
        <GoalsStep data={goals} onChange={setGoals} showHeading={false} />
        <button
          onClick={handleSaveGoals}
          disabled={!isGoalsDataValid(goals) || !isDirty || saving}
          className="bg-primary-500 hover:bg-primary-600 mt-4 rounded-2xl py-3 font-bold text-white shadow-sm transition-colors disabled:opacity-40"
        >
          {saving ? 'Saving…' : 'Save goal'}
        </button>
      </SettingsSubScreen>
    );
  }

  if (view === 'feedback') {
    return (
      <SettingsSubScreen title="Send Feedback" onBack={goBack}>
        <p className="text-ink-600 mb-3 text-sm">Something wrong, or an idea for the app? Let us know.</p>
        <textarea
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          placeholder="Type your feedback here…"
          rows={5}
          className="border-primary-100 focus:border-primary-500 text-ink-900 mb-3 resize-none rounded-2xl border-2 bg-surface p-4 text-base outline-none placeholder:text-ink-400/60"
        />
        <button
          onClick={handleSendFeedback}
          disabled={!feedback.trim() || sendingFeedback}
          className="bg-primary-500 hover:bg-primary-600 rounded-2xl py-3 font-bold text-white shadow-sm transition-colors disabled:opacity-40"
        >
          {sendingFeedback ? 'Sending…' : 'Send feedback'}
        </button>
      </SettingsSubScreen>
    );
  }

  if (view === 'gamification') {
    return (
      <SettingsSubScreen
        title="Streaks & Levels"
        onBack={goBack}
        headerAction={<ToggleSwitch enabled={gamification} onChange={handleGamificationToggle} />}
      >
        <div className="text-center">
          <div className="mb-4 text-6xl">🔥</div>
          <p className="text-ink-600 mx-auto max-w-xs leading-relaxed">
            When turned on, the Home screen shows a streak for consecutive days you've logged food, and a level that grows the
            more you use the app.
          </p>
          <p className="text-ink-600 mx-auto mt-3 max-w-xs leading-relaxed">
            It's purely for fun and entirely optional — turning it off any time never affects your food logs or your calorie
            target, and missing a day is never something to feel bad about.
          </p>
          <p className="text-ink-900 mt-6 font-bold">Currently {gamification ? 'on' : 'off'}</p>
        </div>
      </SettingsSubScreen>
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-y-auto px-5 pt-8 pb-24">
      <h1 className="text-ink-900 mb-6 text-2xl font-extrabold">Settings</h1>

      <SettingsCard>
        <SettingsRow
          icon="🎯"
          label="Profile & Goals"
          value={dailyTarget ? `${dailyTarget} kcal/day • ${goalLabel}` : 'Not set up yet'}
          onClick={() => navigateToView('goals')}
        />
      </SettingsCard>

      <SettingsCard>
        <div className="p-4">
          <div className="mb-3 flex items-center gap-3">
            <span className="text-xl">🎨</span>
            <div className="text-ink-900 text-sm font-bold">Theme</div>
          </div>
          <ThemePicker />
        </div>
      </SettingsCard>

      <SettingsCard>
        <SettingsRow
          icon="🔥"
          label="Gamification"
          value={gamification ? 'On' : 'Off'}
          onClick={() => navigateToView('gamification')}
          trailing={<ToggleSwitch enabled={gamification} onChange={handleGamificationToggle} />}
        />
      </SettingsCard>

      {isPushSupported() && (
        <SettingsCard>
          <SettingsRow
            icon="🔔"
            label="Weight log reminders"
            value={remindersEnabled ? 'On' : 'Off'}
            trailing={<ToggleSwitch enabled={remindersEnabled} onChange={remindersBusy ? () => {} : handleRemindersToggle} />}
          />
        </SettingsCard>
      )}

      <SettingsCard>
        <SettingsRow icon="💬" label="Send feedback" onClick={() => navigateToView('feedback')} />
      </SettingsCard>

      <SettingsCard>
        <SettingsRow
          icon="📦"
          label={exporting ? 'Preparing export…' : 'Export my data'}
          value="Profile, goals, streaks, and every log"
          onClick={exporting ? undefined : handleExportData}
        />
      </SettingsCard>

      <SettingsCard>
        <SettingsRow icon="🚪" label="Log out" onClick={handleLogout} />
      </SettingsCard>

      <SettingsCard>
        {confirmingReset ? (
          <div className="p-4">
            <p className="text-ink-900 mb-3 text-sm font-semibold">Reset the app and clear all local data?</p>
            <p className="text-ink-400 mb-3 text-xs">This can't be undone. You'll go through onboarding again.</p>
            <div className="flex gap-2">
              <button onClick={handleResetApp} className="bg-danger-500 flex-1 rounded-xl py-2 text-sm font-bold text-white">
                Yes, reset
              </button>
              <button
                onClick={() => setConfirmingReset(false)}
                className="border-cream-200 text-ink-600 flex-1 rounded-xl border py-2 text-sm font-bold"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <SettingsRow icon="🗑️" label="Reset app" value="Clears local data" onClick={() => setConfirmingReset(true)} />
        )}
      </SettingsCard>

      <p className="text-ink-400 mt-2 text-center text-xs">Nutrition Tracker · v1.0</p>
    </div>
  );
}
