/**
 * Three-way theme: 'system' (default -- follows the phone's dark/light
 * setting via the CSS prefers-color-scheme media query in index.css),
 * or an explicit 'light'/'dark' override stored in localStorage. Applying
 * data-theme="light"|"dark" on <html> is what the CSS in index.css keys
 * off of; omitting the attribute entirely means "system."
 */

export type ThemePreference = 'system' | 'light' | 'dark';

const THEME_KEY = 'nutrition-tracker-theme';
const THEME_COLOR_LIGHT = '#2f6f4f';
const THEME_COLOR_DARK = '#18140f';

export function getThemePreference(): ThemePreference {
  const stored = localStorage.getItem(THEME_KEY);
  return stored === 'light' || stored === 'dark' ? stored : 'system';
}

function resolvedIsDark(pref: ThemePreference): boolean {
  if (pref === 'dark') return true;
  if (pref === 'light') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function applyThemePreference(pref: ThemePreference): void {
  const root = document.documentElement;
  if (pref === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', pref);

  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', resolvedIsDark(pref) ? THEME_COLOR_DARK : THEME_COLOR_LIGHT);
}

export function setThemePreference(pref: ThemePreference): void {
  localStorage.setItem(THEME_KEY, pref);
  applyThemePreference(pref);
}

/** Call once at app startup so the stored preference (or system default) applies before first paint. */
export function initTheme(): void {
  applyThemePreference(getThemePreference());
  // Keep the theme-color meta tag correct if the user changes their OS
  // setting while on 'system' -- the CSS media query already re-themes the
  // page automatically, this just keeps the browser-chrome color in sync.
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (getThemePreference() === 'system') applyThemePreference('system');
  });
}
