/**
 * The session token (bearer credential for every API call) and device
 * token (lets a recognized device skip step-up verification, when it's
 * enabled) issued by /auth/*. Replaces the old per-device UUID model --
 * identity now comes from the server-verified session, never a
 * client-generated id.
 */

const SESSION_KEY = 'nutrition-tracker-session-token';
const DEVICE_TOKEN_KEY = 'nutrition-tracker-device-token';

export function getSessionToken(): string | null {
  return localStorage.getItem(SESSION_KEY);
}

export function getDeviceToken(): string | null {
  return localStorage.getItem(DEVICE_TOKEN_KEY);
}

export function setSession(sessionToken: string, deviceToken: string): void {
  localStorage.setItem(SESSION_KEY, sessionToken);
  localStorage.setItem(DEVICE_TOKEN_KEY, deviceToken);
}

export function clearSession(): void {
  localStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(DEVICE_TOKEN_KEY);
}

export function isAuthenticated(): boolean {
  return getSessionToken() !== null;
}

/** Fired by api.ts when a request comes back 401 -- session expired or was invalidated (e.g. password reset elsewhere). */
export const UNAUTHORIZED_EVENT = 'nutrition-tracker:unauthorized';
