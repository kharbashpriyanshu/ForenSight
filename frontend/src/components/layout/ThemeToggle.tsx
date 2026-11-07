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
  const cycleTheme = () => {
    const cycleMap: Record<ThemePreference, ThemePreference> = {
      light: 'dark',
      dark: 'system',
      system: 'light',
    };
    setTheme(cycleMap[theme]);
  };

  const getThemeLabel = (pref: ThemePreference): string => {
    switch (pref) {
      case 'light':
        return 'Light appearance';
      case 'dark':
        return 'Dark appearance';
      case 'system':
        return 'System appearance';
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
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          background: 'var(--surface-sunken)',
          border: '1px solid var(--border-default)',
          borderRadius: 'var(--radius-md)',
          padding: '2px',
          gap: '2px',
        }}
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
              title={option.label}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: '4px 8px',
                fontSize: 'var(--text-xs)',
                fontWeight: isSelected ? 600 : 500,
                color: isSelected ? 'var(--text-main)' : 'var(--text-muted)',
                background: isSelected ? 'var(--surface-base)' : 'transparent',
                border: 'none',
                borderRadius: 'calc(var(--radius-md) - 2px)',
                cursor: 'pointer',
                boxShadow: isSelected ? 'var(--shadow-sm)' : 'none',
                transition: 'all var(--duration-fast) var(--ease-snappy)',
              }}
            >
              {option.icon}
              <span>{option.label}</span>
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

  return (
    <button
      type="button"
      className={`btn-theme-toggle ${className}`}
      onClick={cycleTheme}
      aria-label={`Appearance: ${getThemeLabel(theme)}. Click to switch.`}
      title={`Appearance: ${getThemeLabel(theme)} (Click to switch)`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '32px',
        height: '32px',
        padding: '0',
        borderRadius: 'var(--radius-md)',
        background: 'var(--surface-sunken)',
        border: '1px solid var(--border-default)',
        color: 'var(--text-main)',
        cursor: 'pointer',
        transition: 'all var(--duration-fast) var(--ease-snappy)',
      }}
    >
      {currentIcon()}
    </button>
  );
};

export default ThemeToggle;
