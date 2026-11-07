import React, { useState, useRef, useEffect } from 'react';
import { Sun, Moon, Monitor, ChevronDown, Check } from 'lucide-react';
import { useTheme, type ThemePreference } from '../../contexts/ThemeContext';

interface ThemeToggleProps {
  variant?: 'compact' | 'segmented';
  className?: string;
}

export const ThemeToggle: React.FC<ThemeToggleProps> = ({ variant = 'compact', className = '' }) => {
  const { theme, resolvedTheme, setTheme, toggleTheme } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Close menu on click outside or Escape key
  useEffect(() => {
    if (!menuOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node)
      ) {
        setMenuOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMenuOpen(false);
        triggerRef.current?.focus();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [menuOpen]);

  const selectTheme = (newTheme: ThemePreference) => {
    setTheme(newTheme);
    setMenuOpen(false);
    triggerRef.current?.focus();
  };

  // Segmented control variant (e.g., explicit 3-option bar)
  if (variant === 'segmented') {
    const options: { value: ThemePreference; label: string; icon: React.ReactNode }[] = [
      { value: 'light', label: 'Light', icon: <Sun size={14} aria-hidden="true" /> },
      { value: 'dark', label: 'Dark', icon: <Moon size={14} aria-hidden="true" /> },
      { value: 'system', label: 'System', icon: <Monitor size={14} aria-hidden="true" /> },
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

  // Default compact variant:
  // - Direct 1-click toggle on the primary icon button (Sun/Moon flips immediately)
  // - Secondary chevron trigger opens popover menu for explicit System / Light / Dark selection
  const isDark = resolvedTheme === 'dark';
  const toggleActionLabel = isDark ? 'Switch to light theme' : 'Switch to dark theme';

  return (
    <div className={`theme-toggle-group ${className}`} ref={menuRef}>
      {/* Direct Light/Dark Toggle Button */}
      <button
        type="button"
        className="btn-theme-toggle"
        onClick={toggleTheme}
        aria-label={toggleActionLabel}
        title={toggleActionLabel}
      >
        {isDark ? (
          <Moon size={16} aria-hidden="true" />
        ) : (
          <Sun size={16} aria-hidden="true" />
        )}
        {theme === 'system' && (
          <span
            className="theme-system-dot"
            title="System preference active"
            aria-hidden="true"
          />
        )}
      </button>

      {/* Explicit Menu Trigger */}
      <button
        ref={triggerRef}
        type="button"
        className={`btn-theme-menu-trigger ${menuOpen ? 'active' : ''}`}
        onClick={() => setMenuOpen(!menuOpen)}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-label="Theme options: Light, Dark, System"
        title="Theme options"
      >
        <ChevronDown size={12} aria-hidden="true" />
      </button>

      {/* Accessible Theme Selection Popover Menu */}
      {menuOpen && (
        <div className="theme-dropdown-menu" role="menu" aria-label="Theme selection">
          <button
            type="button"
            role="menuitemradio"
            aria-checked={theme === 'light'}
            onClick={() => selectTheme('light')}
            className={`theme-menu-item ${theme === 'light' ? 'active' : ''}`}
          >
            <Sun size={14} aria-hidden="true" />
            <span>Light</span>
            {theme === 'light' && <Check size={14} className="theme-check-icon" aria-hidden="true" />}
          </button>

          <button
            type="button"
            role="menuitemradio"
            aria-checked={theme === 'dark'}
            onClick={() => selectTheme('dark')}
            className={`theme-menu-item ${theme === 'dark' ? 'active' : ''}`}
          >
            <Moon size={14} aria-hidden="true" />
            <span>Dark</span>
            {theme === 'dark' && <Check size={14} className="theme-check-icon" aria-hidden="true" />}
          </button>

          <button
            type="button"
            role="menuitemradio"
            aria-checked={theme === 'system'}
            onClick={() => selectTheme('system')}
            className={`theme-menu-item ${theme === 'system' ? 'active' : ''}`}
          >
            <Monitor size={14} aria-hidden="true" />
            <span>System</span>
            {theme === 'system' && <Check size={14} className="theme-check-icon" aria-hidden="true" />}
          </button>
        </div>
      )}
    </div>
  );
};

export default ThemeToggle;
