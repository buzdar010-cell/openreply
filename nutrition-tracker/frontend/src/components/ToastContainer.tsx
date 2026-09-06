import { useEffect, useState } from 'react';
import { subscribeToasts, type ToastMessage } from '../lib/toast';

export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  useEffect(() => subscribeToasts(setToasts), []);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-3 left-0 right-0 z-[60] mx-auto flex max-w-[480px] flex-col items-center gap-2 px-4">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`w-full rounded-xl px-4 py-3 text-center text-sm font-semibold text-white shadow-lg ${
            t.type === 'error' ? 'bg-danger-500' : 'bg-primary-500'
          }`}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}
