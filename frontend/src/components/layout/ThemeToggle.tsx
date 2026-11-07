import React from 'react';
import { Sun, Moon, Monitor } from 'lucide-react';
import { useTheme, type ThemePreference } from '../../contexts/ThemeContext';

interface ThemeToggleProps {
  variant?: 'compact' | 'segmented';
  className?: string;
}

export const ThemeToggle: React.FC<ThemeToggleProps> = ({ variant = 'compact', className = '' }) => {
  const { theme, resolvedTheme, setTheme } = useTheme();

  // Cycle through themes: light -> dark -> system -> light
  const cycleMap: Record<ThemePreference, ThemePreference> = {
    light: 'dark',
    dark: 'system',
    system: 'light',
  };

  const cycleTheme = () => {
    setTheme(cycleMap[theme]);
  };

  const getThemeLabel = (pref: ThemePreference): string => {
    switch (pref) {
      case 'light':
        return 'Light';
      case 'dark':
        return 'Dark';
      case 'system':
        return 'System';
    }
  };

  if (variant === 'segmented') {
    const options: { value: ThemePreference; label: string; icon: React.ReactNode }[] = [
      { value: 'light', label: 'Light', icon: <Sun size={14} aria-hidden="true" /> },
      { value: 'dark', label: 'Dark', icon: <Moon size={14} aria-hidden="true" /> },
      { value: 'system', label: 'Auto', icon: <Monitor size={14} aria-hidden="true" /> },
    ];

    return (
      <div
        className={`theme-segmented-control ${className}`}
        role="radiogroup"
        aria-label="Appearance selection"
      >
        {options.map((option) => {
          const isSelected = theme === option.value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={isSelected}
              onClick={() => setTheme(option.value)}
              className={`theme-segment-btn ${isSelected ? 'active' : ''}`}
              title={`Switch to ${option.label} theme`}
            >
              {option.icon}
              <span className="theme-segment-label">{option.label}</span>
            </button>
          );
        })}
      </div>
    );
  }

  // Compact single-button toggle
  const currentIcon = () => {
    if (theme === 'system') {
      return <Monitor size={16} aria-hidden="true" />;
    }
    return resolvedTheme === 'dark' ? <Moon size={16} aria-hidden="true" /> : <Sun size={16} aria-hidden="true" />;
  };

  const nextTheme = cycleMap[theme];
  const activeDescription = theme === 'system' ? `System (${resolvedTheme})` : getThemeLabel(theme);

  return (
    <button
      type="button"
      className={`btn-theme-toggle ${className}`}
      onClick={cycleTheme}
      aria-label={`Appearance: ${activeDescription}. Click to switch to ${getThemeLabel(nextTheme)}.`}
      title={`Appearance: ${activeDescription}. Click to switch to ${getThemeLabel(nextTheme)}.`}
    >
      {currentIcon()}
    </button>
  );
};

export default ThemeToggle;
