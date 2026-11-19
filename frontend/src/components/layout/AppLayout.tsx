import React, { Suspense, useState, useEffect } from 'react';
import { NavLink, Link, Outlet, useLocation } from 'react-router-dom';
import { Activity, FolderOpen, FlaskConical, Menu, X, Sparkles } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import AccountSecurityPanel from '../auth/AccountSecurityPanel';
import ThemeToggle from './ThemeToggle';
import Breadcrumbs from './Breadcrumbs';
import BrandHeader from './BrandHeader';
import DemoGuidedTour from '../demo/DemoGuidedTour';
import { PageShellSkeleton } from '../common/LoadingStates';

interface AppLayoutProps {
  children?: React.ReactNode;
}

export interface AppLayoutContext {
  mobileNavOpen: boolean;
  setMobileNavOpen: React.Dispatch<React.SetStateAction<boolean>>;
}

const AppLayout: React.FC<AppLayoutProps> = ({ children }) => {
  const { logout, user } = useAuth();
  const location = useLocation();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [tourOpen, setTourOpen] = useState(false);

  const isDemoUser = user?.username === 'demo_instructor';

  // Automatically launch demo guided tour only once on first demo login
  useEffect(() => {
    if (isDemoUser) {
      try {
        const dismissed = localStorage.getItem('forensight_demo_tour_dismissed');
        if (!dismissed) {
          localStorage.setItem('forensight_demo_tour_dismissed', 'true');
          setTourOpen(true);
        }
      } catch {}
    }
  }, [isDemoUser]);

  // Close mobile drawer on route change
  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname]);

  // Determine if currently in a case workspace route (excluding global /cases/intake)
  const isCaseWorkspace = Boolean(
    location.pathname.match(/^\/cases\/[^/]+/) && !location.pathname.match(/^\/cases\/intake(?:\/|$)/)
  );

  return (
    <div className="app-container">
      {/* Skip to Content for Keyboard Accessibility */}
      <a href={isCaseWorkspace ? "#case-content" : "#main-content"} className="skip-to-content">
        Skip to main content
      </a>

      {/* UNIFIED GLOBAL TOPBAR */}
      <header className="topbar">
        <div className="topbar-left">
          <Link to="/cases" className="topbar-brand" title="ForenSight Station Directory">
            <BrandHeader />
          </Link>

          <div className="topbar-divider" aria-hidden="true" />

          {/* Contextual dynamic breadcrumb trail */}
          <Breadcrumbs />
        </div>

        <div className="topbar-right">
          {/* Workspace Context Badge */}
          <span className={`context-pill ${isCaseWorkspace ? 'context-pill-case' : 'context-pill-station'}`}>
            {isCaseWorkspace ? 'INVESTIGATION WORKSPACE' : 'INVESTIGATION DIRECTORY'}
          </span>

          {/* Interactive Demonstration Guided Tour Trigger (Demo Instructor Only) */}
          {isDemoUser && (
            <button
              type="button"
              className="btn-demo-tour-launch"
              onClick={() => setTourOpen(true)}
              title="Open Interactive Demonstration Walkthrough"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
                padding: '0.35rem 0.75rem',
                fontSize: '0.82rem',
                fontWeight: 600,
                borderRadius: '8px',
                background: 'rgba(184, 135, 42, 0.14)',
                color: 'var(--accent-color, #b8872a)',
                border: '1px solid var(--accent-border, rgba(184, 135, 42, 0.35))',
                cursor: 'pointer',
                transition: 'all 0.15s ease-in-out',
              }}
            >
              <Sparkles size={14} aria-hidden="true" />
              <span>Demo Tour</span>
            </button>
          )}

          {/* Theme Toggle (Light / Dark) */}
          <ThemeToggle />

          {/* Multi-User RBAC & Security */}
          <AccountSecurityPanel />

          <span className="status-badge" title="Role-based access protection active">
            <span className="status-dot-nominal" aria-hidden="true" />
            <span className="status-badge-text">Access Protected</span>
          </span>

          {/* Explicit Sign Out Action */}
          <button 
            id="logout-button"
            className="btn btn-secondary topbar-logout-btn"
            onClick={logout} 
            title="Sign out of ForenSight session"
          >
            Sign Out
          </button>

          {/* Responsive Mobile Drawer Toggle */}
          <button
            type="button"
            className="mobile-nav-toggle"
            onClick={() => setMobileNavOpen(prev => !prev)}
            aria-label={mobileNavOpen ? "Close navigation" : "Open navigation"}
            aria-expanded={mobileNavOpen}
          >
            {mobileNavOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </header>

      {/* WORKSPACE VIEWPORT BODY */}
      <div className="app-shell-body">
        {/* If on Station routes (/cases, /benchmark, /system), render Station Sidebar */}
        {!isCaseWorkspace && (
          <>
            {mobileNavOpen && (
              <div 
                className="sidebar-backdrop" 
                onClick={() => setMobileNavOpen(false)} 
                aria-hidden="true"
              />
            )}
            <aside className={`sidebar station-sidebar ${mobileNavOpen ? 'mobile-open' : ''}`}>
              <nav className="sidebar-nav" aria-label="Station Navigation">
                <div className="nav-section-label">Directory</div>
                <NavLink 
                  to="/cases" 
                  end 
                  title="Cases Directory" 
                  aria-label="Cases Directory" 
                  className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                >
                  <FolderOpen size={16} aria-hidden="true" />
                  <span className="nav-item-text">Cases</span>
                </NavLink>

                <div className="nav-section-label">Operations</div>
                <NavLink 
                  to="/benchmark" 
                  title="Benchmark Suite" 
                  aria-label="Benchmark Suite" 
                  className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                >
                  <FlaskConical size={16} aria-hidden="true" />
                  <span className="nav-item-text">Benchmark Suite</span>
                </NavLink>
                <NavLink 
                  to="/system" 
                  title="System Health" 
                  aria-label="System Health" 
                  className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                >
                  <Activity size={16} aria-hidden="true" />
                  <span className="nav-item-text">System Health</span>
                </NavLink>
              </nav>

              <div className="sidebar-footer">
                <div className="sidebar-footer-title">
                  Scientific Baseline: <strong className="sidebar-footer-state">Verified</strong>
                </div>
                <div className="sidebar-footer-axiom">Observation ≠ Proof</div>
              </div>
            </aside>
          </>
        )}

        {/* Content Region: If station route, wrapped in page-container; if case route, Workspace manages it */}
        {!isCaseWorkspace ? (
          <main className="page-container" id="main-content">
            <Suspense fallback={<PageShellSkeleton />}>
              {children ?? <Outlet context={{ mobileNavOpen, setMobileNavOpen }} />}
            </Suspense>
          </main>
        ) : (
          <Suspense fallback={<PageShellSkeleton />}>
            {children ?? <Outlet context={{ mobileNavOpen, setMobileNavOpen }} />}
          </Suspense>
        )}
      </div>

      {/* Guided Tour Modal for Demonstration Users */}
      {isDemoUser && (
        <DemoGuidedTour
          isOpen={tourOpen}
          onClose={() => setTourOpen(false)}
        />
      )}
    </div>
  );
};

export default AppLayout;
