import { useState } from 'react';
import { Onboarding } from './components/Onboarding';
import { LogFood } from './components/LogFood';
import { Dashboard } from './components/Dashboard';
import { BottomNav } from './components/BottomNav';

const ONBOARDED_KEY = 'nutrition-tracker-onboarded';

export default function App() {
  const [onboarded, setOnboarded] = useState(() => localStorage.getItem(ONBOARDED_KEY) === '1');
  const [tab, setTab] = useState<'log' | 'today'>('log');
  const [refreshKey, setRefreshKey] = useState(0);

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
      {tab === 'log' ? (
        <LogFood onLogged={() => setRefreshKey((k) => k + 1)} />
      ) : (
        <Dashboard refreshKey={refreshKey} />
      )}
      <BottomNav tab={tab} onChange={setTab} />
    </>
  );
}
