import React from 'react';

interface BrandHeaderProps {
  /** Whether to hide the subtitle on narrow viewports (topbar mode) */
  responsiveSubtitle?: boolean;
}

/**
 * Shared ForenSight header branding lockup (30x30 reference-inspired icon + wordmark).
 * Used identically across the authenticated topbar and the public login header.
 */
export const BrandHeader: React.FC<BrandHeaderProps> = ({ responsiveSubtitle = true }) => {
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '11px', flexShrink: 0 }}>
      <img
        src="/forensight-icon.svg"
        alt="ForenSight Emblem"
        width={30}
        height={30}
        className="topbar-logo"
      />
      <div className="topbar-brand-text">
        <span className="topbar-brand-title">ForenSight</span>
        <span className={responsiveSubtitle ? 'topbar-brand-subtitle' : ''} style={!responsiveSubtitle ? {
          fontFamily: 'var(--font-tech)',
          fontSize: '0.62rem',
          fontWeight: 700,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: 'var(--accent-text)',
        } : undefined}>
          Digital Forensic Platform
        </span>
      </div>
    </div>
  );
};

export default BrandHeader;

