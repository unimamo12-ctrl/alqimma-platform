'use client';

import { createContext, useCallback, useContext, useMemo, useSyncExternalStore } from 'react';

type Theme = 'light' | 'dark';

const STORAGE_KEY = 'alqimma-theme';
const CHANGE_EVENT = 'alqimma-theme-change';

/**
 * Runs before first paint, from the root layout.
 *
 * React cannot prevent the flash: any effect runs after the browser has already
 * painted the light page. This script reads the same key and sets `.dark` on
 * <html> while the document is still parsing. The store below then reads the
 * class back, so the two can never disagree.
 *
 * It sets the *class* and nothing else. Writing `style.colorScheme` here instead
 * would put an inline style on <html> before hydration, and React reports a
 * hydration mismatch for every attribute it did not render — the class is enough,
 * since `.dark { color-scheme: dark }` lives in globals.css.
 */
export const themeScript = `(function(){try{var k='${STORAGE_KEY}';var s=localStorage.getItem(k);var d=s?s==='dark':window.matchMedia('(prefers-color-scheme: dark)').matches;document.documentElement.classList.toggle('dark',d);}catch(_){}})();`;

// --- the store: the theme is the class on <html>, not React state -------------

function subscribe(onChange: () => void) {
  // our own writes
  window.addEventListener(CHANGE_EVENT, onChange);
  // and the OS preference, so the site follows a system switch live
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  media.addEventListener('change', onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    media.removeEventListener('change', onChange);
  };
}

function getSnapshot(): Theme {
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}

// The server cannot know the visitor's choice, so it renders light and the
// inline script corrects it before paint. Returning a constant here is what
// keeps hydration from mismatching.
function getServerSnapshot(): Theme {
  return 'light';
}

function applyTheme(next: Theme) {
  // The class only: `color-scheme` comes from `.dark` in globals.css. Setting it
  // as an inline style too would desync <html>'s attributes from what React
  // rendered and produce a hydration warning on every load.
  document.documentElement.classList.toggle('dark', next === 'dark');
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // private mode: the toggle still works for this page load
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

interface ThemeContextValue {
  theme: Theme;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'light',
  toggle: () => undefined,
});

export function useTheme() {
  return useContext(ThemeContext);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const toggle = useCallback(() => {
    applyTheme(getSnapshot() === 'dark' ? 'light' : 'dark');
  }, []);

  const value = useMemo(() => ({ theme, toggle }), [theme, toggle]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}