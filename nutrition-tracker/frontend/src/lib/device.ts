const KEY = 'nutrition-tracker-device-id';

/** No login system exists yet -- the backend keys everything off a per-device UUID, so generate and persist one locally. */
export function getDeviceId(): string {
  let id = localStorage.getItem(KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(KEY, id);
  }
  return id;
}
