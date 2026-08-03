import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

interface ThemeContextValue {
  isLight: boolean;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);
const STORAGE_KEY = 'raptor_theme_light';

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [isLight, setIsLight] = useState(() => localStorage.getItem(STORAGE_KEY) === '1');

  useEffect(() => {
    document.body.classList.toggle('light-mode', isLight);
    localStorage.setItem(STORAGE_KEY, isLight ? '1' : '0');
  }, [isLight]);

  return (
    <ThemeContext.Provider value={{ isLight, toggle: () => setIsLight((v) => !v) }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
