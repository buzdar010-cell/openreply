import { useState } from 'react';
import { Onboarding } from './components/Onboarding';
import { Home } from './components/Home';
import { LogsScreen } from './components/LogsScreen';
import { SettingsScreen } from './components/SettingsScreen';
import { AddLogSheet } from './components/AddLogSheet';
import { FloatingAddButton } from './components/FloatingAddButton';
import { BottomNav, type Tab } from './components/BottomNav';

const ONBOARDED_KEY = 'nutrition-tracker-onboarded';

export default function App() {
  const [onboarded, setOnboarded] = useState(() => localStorage.getItem(ONBOARDED_KEY) === '1');
  const [tab, setTab] = useState<Tab>('home');
  const [refreshKey, setRefreshKey] = useState(0);
  const [showAddSheet, setShowAddSheet] = useState(false);

  if (!onboarded) {
    return (
      <Onboarding
        onDone={() => {
          localStorage.setItem(ONBOARDED_KEY, '1');
          setOnboarded(true);
        }}
      />
    );
  }

  return (
    <>
      {tab === 'home' && <Home refreshKey={refreshKey} />}
      {tab === 'logs' && <LogsScreen refreshKey={refreshKey} />}
      {tab === 'settings' && <SettingsScreen />}

      <FloatingAddButton onClick={() => setShowAddSheet(true)} />
      <BottomNav tab={tab} onChange={setTab} />

      {showAddSheet && (
        <AddLogSheet onClose={() => setShowAddSheet(false)} onLogged={() => setRefreshKey((k) => k + 1)} />
      )}
    </>
  );
}
