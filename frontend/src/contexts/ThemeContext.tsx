import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';

export type ThemePreference = 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

interface ThemeContextValue {
  theme: ThemePreference;
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: ThemePreference) => void;
  toggleTheme: () => void;
  isDark: boolean;
}

const THEME_STORAGE_KEY = 'forensight-theme';

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

function getStoredPreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === 'dark') {
      return 'dark';
    }
  } catch {
    // Local storage access denied (private browsing / iframe restriction)
  }
  // Default to Light theme for users without a saved preference
  return 'light';
}

function applyThemeAttribute(theme: ResolvedTheme) {
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-theme', theme);
    // Also update style color-scheme for native inputs and scrollbars
    document.documentElement.style.colorScheme = theme;
  }
}

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<ThemePreference>(getStoredPreference);

  const setTheme = useCallback((newTheme: ThemePreference) => {
    setThemeState(newTheme);
    applyThemeAttribute(newTheme);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, newTheme);
    } catch {
      // Local storage unavailable
    }
  }, []);

  // Direct toggle between light and dark (1-click immediate action)
  const toggleTheme = useCallback(() => {
    setThemeState((current) => {
      const nextTheme: ThemePreference = current === 'dark' ? 'light' : 'dark';
      applyThemeAttribute(nextTheme);
      try {
        localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
      } catch {
        // Local storage unavailable
      }
      return nextTheme;
    });
  }, []);

  // Sync data-theme attribute on root element whenever theme changes or mounts
  useEffect(() => {
    applyThemeAttribute(theme);
  }, [theme]);

  return (
    <ThemeContext.Provider
      value={{
        theme,
        resolvedTheme: theme,
        setTheme,
        toggleTheme,
        isDark: theme === 'dark',
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
};

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
