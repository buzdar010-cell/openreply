/**
 * Lightweight fire-and-forget toast system -- a plain module-level pub/sub
 * rather than React Context, since any component anywhere (including ones
 * with no shared parent) needs to be able to trigger one without prop
 * drilling or wrapping the whole app in a provider just for this.
 */

export type ToastType = 'success' | 'error';
export interface ToastMessage {
  id: number;
  message: string;
  type: ToastType;
}

let toasts: ToastMessage[] = [];
let listeners: ((t: ToastMessage[]) => void)[] = [];
let nextId = 0;

function notify() {
  for (const listener of listeners) listener(toasts);
}

export function showToast(message: string, type: ToastType = 'success', durationMs = 2500) {
  const id = nextId++;
  toasts = [...toasts, { id, message, type }];
  notify();
  setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== id);
    notify();
  }, durationMs);
}

export function subscribeToasts(listener: (t: ToastMessage[]) => void): () => void {
  listeners.push(listener);
  listener(toasts);
  return () => {
    listeners = listeners.filter((l) => l !== listener);
  };
}
