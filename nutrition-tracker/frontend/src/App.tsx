import { useState } from 'react';
import { Onboarding } from './components/Onboarding';
import { Home } from './components/Home';
import { LogsScreen } from './components/LogsScreen';
import { SettingsScreen } from './components/SettingsScreen';
import { AddLogSheet } from './components/AddLogSheet';
import { FloatingAddButton } from './components/FloatingAddButton';
import { BottomNav, type Tab } from './components/BottomNav';
import { ToastContainer } from './components/ToastContainer';

const ONBOARDED_KEY = 'nutrition-tracker-onboarded';
const TAB_KEY = 'nutrition-tracker-active-tab';

function isTab(v: string | null): v is Tab {
  return v === 'home' || v === 'logs' || v === 'settings';
}

export default function App() {
  const [onboarded, setOnboarded] = useState(() => localStorage.getItem(ONBOARDED_KEY) === '1');
  const [tab, setTab] = useState<Tab>(() => {
    const stored = localStorage.getItem(TAB_KEY);
    return isTab(stored) ? stored : 'home';
  });
  const [refreshKey, setRefreshKey] = useState(0);
  const [showAddSheet, setShowAddSheet] = useState(false);

  function changeTab(t: Tab) {
    setTab(t);
    localStorage.setItem(TAB_KEY, t);
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
