import { useEffect, useState } from 'react';
import { AuthFlow } from './components/AuthFlow';
import { Onboarding } from './components/Onboarding';
import { Home } from './components/Home';
import { LogsScreen } from './components/LogsScreen';
import { SettingsScreen } from './components/SettingsScreen';
import { AddLogSheet } from './components/AddLogSheet';
import { FloatingAddButton } from './components/FloatingAddButton';
import { BottomNav, type Tab } from './components/BottomNav';
import { ToastContainer } from './components/ToastContainer';
import { isAuthenticated, UNAUTHORIZED_EVENT } from './lib/session';
import { getProfile, type AuthTokens } from './lib/api';

const ONBOARDED_KEY = 'nutrition-tracker-onboarded';
const TAB_KEY = 'nutrition-tracker-active-tab';

function isTab(v: string | null): v is Tab {
  return v === 'home' || v === 'logs' || v === 'settings';
}

export default function App() {
  const [authed, setAuthed] = useState(() => isAuthenticated());
  const [onboarded, setOnboarded] = useState(() => localStorage.getItem(ONBOARDED_KEY) === '1');
  const [checkingOnboarded, setCheckingOnboarded] = useState(false);
  const [tab, setTab] = useState<Tab>(() => {
    const stored = localStorage.getItem(TAB_KEY);
    return isTab(stored) ? stored : 'home';
  });
  const [refreshKey, setRefreshKey] = useState(0);
  const [showAddSheet, setShowAddSheet] = useState(false);

  useEffect(() => {
    function handleUnauthorized() {
      setAuthed(false);
    }
    window.addEventListener(UNAUTHORIZED_EVENT, handleUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, handleUnauthorized);
  }, []);

  function changeTab(t: Tab) {
    setTab(t);
    localStorage.setItem(TAB_KEY, t);
  }

  function handleAuthenticated(_tokens: AuthTokens) {
    setAuthed(true);
    // A returning user logging in on a new device already has a profile
    // server-side -- the onboarding flag is per-device local storage and
    // would otherwise wrongly send them through onboarding again there.
    setCheckingOnboarded(true);
    getProfile()
      .then((p) => {
        const done = p !== null && p.daily_calorie_target !== null;
        if (done) localStorage.setItem(ONBOARDED_KEY, '1');
        setOnboarded(done);
      })
      .catch(() => setOnboarded(localStorage.getItem(ONBOARDED_KEY) === '1'))
      .finally(() => setCheckingOnboarded(false));
  }

  if (!authed) {
    return (
      <>
        <ToastContainer />
        <AuthFlow onAuthenticated={handleAuthenticated} />
      </>
    );
  }

  if (checkingOnboarded) {
    return (
      <>
        <ToastContainer />
        <div className="text-ink-400 flex flex-1 items-center justify-center text-sm">Loading…</div>
      </>
    );
  }

  if (!onboarded) {
    return (
      <>
        <ToastContainer />
        <Onboarding
          onDone={() => {
            localStorage.setItem(ONBOARDED_KEY, '1');
            setOnboarded(true);
          }}
        />
      </>
    );
  }

  return (
    <>
      <ToastContainer />
      {tab === 'home' && <Home refreshKey={refreshKey} />}
      {tab === 'logs' && <LogsScreen refreshKey={refreshKey} />}
      {tab === 'settings' && <SettingsScreen />}

      <FloatingAddButton onClick={() => setShowAddSheet(true)} />
      <BottomNav tab={tab} onChange={changeTab} />

      {showAddSheet && (
        <AddLogSheet onClose={() => setShowAddSheet(false)} onLogged={() => setRefreshKey((k) => k + 1)} />
      )}
    </>
  );
}
