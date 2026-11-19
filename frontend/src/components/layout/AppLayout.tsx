import React, { Suspense, useState, useEffect, useRef } from 'react';
import { NavLink, Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Activity, FolderOpen, FlaskConical, Menu, X, Sparkles, CheckCircle2, Loader2, AlertCircle, ArrowRight } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { fetchApi } from '../../api';
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
  const navigate = useNavigate();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [tourOpen, setTourOpen] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);
  const [demoReady, setDemoReady] = useState(false);
  const [demoFeedback, setDemoFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
    caseId?: string;
  } | null>(null);
  const isCreatingDemoRef = useRef(false);

  const isDemoUser = user?.username === 'demo_instructor' || user?.role === 'ADMIN';

  // Automatically launch demo guided tour only once on first demo login for demo_instructor
  useEffect(() => {
    if (user?.username === 'demo_instructor') {
      try {
        const dismissed = localStorage.getItem('forensight_demo_tour_dismissed');
        if (!dismissed) {
          localStorage.setItem('forensight_demo_tour_dismissed', 'true');
          setTourOpen(true);
        }
      } catch {}
    }
  }, [user?.username]);

  // Inspect existing demonstration workspace availability
  useEffect(() => {
    if (isDemoUser) {
      fetchApi('/cases/demo-investigation')
        .then(res => res.ok ? res.json() : null)
        .then(data => {
          if (data?.exists) {
            setDemoReady(true);
          }
        })
        .catch(() => {});
    }
  }, [isDemoUser]);

  // Auto-dismiss feedback notification banner
  useEffect(() => {
    if (demoFeedback) {
      const timer = setTimeout(() => {
        setDemoFeedback(null);
      }, 8000);
      return () => clearTimeout(timer);
    }
  }, [demoFeedback]);

  // Handle Demo Investigation creation or direct navigation
  const handleDemoInvestigationClick = async () => {
    if (demoReady) {
      navigate('/cases/FS-DEMO-001');
      return;
    }

    if (isCreatingDemoRef.current || demoLoading) {
      return;
    }

    isCreatingDemoRef.current = true;
    setDemoLoading(true);
    setDemoFeedback(null);

    try {
      const response = await fetchApi('/cases/demo-investigation', {
        method: 'POST',
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.detail || `Request failed with status ${response.status}`);
      }

      const result = await response.json();
      setDemoReady(true);
      const isExisting = result.status === 'already_exists';
      setDemoFeedback({
        type: 'success',
        message: isExisting
          ? 'Demo Investigation (FS-DEMO-001) is already ready.'
          : 'Demo Investigation (FS-DEMO-001) successfully created.',
        caseId: result.case_identifier || 'FS-DEMO-001',
      });
    } catch (err: any) {
      setDemoFeedback({
        type: 'error',
        message: err.message || 'Failed to create demonstration investigation. Please retry.',
      });
    } finally {
      setDemoLoading(false);
      isCreatingDemoRef.current = false;
    }
  };

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

          {/* Interactive Demonstration Guided Tour Trigger & Demo Investigation Option */}
          {isDemoUser && (
            <>
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

              <button
                type="button"
                className={`btn-demo-investigation-launch ${demoReady ? 'demo-ready' : ''}`}
                onClick={handleDemoInvestigationClick}
                disabled={demoLoading}
                title={
                  demoReady
                    ? "Open Demonstration Investigation (FS-DEMO-001)"
                    : "Add Realistic Demonstration Investigation Workspace"
                }
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  padding: '0.35rem 0.75rem',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  borderRadius: '8px',
                  background: demoReady ? 'rgba(34, 197, 94, 0.14)' : 'rgba(59, 130, 246, 0.14)',
                  color: demoReady ? '#22c55e' : '#3b82f6',
                  border: demoReady ? '1px solid rgba(34, 197, 94, 0.35)' : '1px solid rgba(59, 130, 246, 0.35)',
                  cursor: demoLoading ? 'wait' : 'pointer',
                  opacity: demoLoading ? 0.75 : 1,
                  transition: 'all 0.15s ease-in-out',
                }}
              >
                {demoLoading ? (
                  <>
                    <Loader2 size={14} className="spin-animate" aria-hidden="true" />
                    <span>Creating Demo…</span>
                  </>
                ) : demoReady ? (
                  <>
                    <CheckCircle2 size={14} aria-hidden="true" />
                    <span>Open Demo Investigation</span>
                  </>
                ) : (
                  <>
                    <FlaskConical size={14} aria-hidden="true" />
                    <span>Add Demo Investigation</span>
                  </>
                )}
              </button>
            </>
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

      {/* Demonstration Provisioning Feedback Notification Banner */}
      {demoFeedback && (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: 'fixed',
            top: '60px',
            right: '1.25rem',
            zIndex: 1100,
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            padding: '0.65rem 1rem',
            borderRadius: '8px',
            fontSize: '0.82rem',
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.28)',
            background: demoFeedback.type === 'success' ? 'var(--surface-color, #1a1e24)' : '#450a0a',
            color: demoFeedback.type === 'success' ? 'var(--text-main, #f1f5f9)' : '#fecaca',
            border: demoFeedback.type === 'success' ? '1px solid rgba(34, 197, 94, 0.5)' : '1px solid rgba(239, 68, 68, 0.5)',
          }}
        >
          {demoFeedback.type === 'success' ? (
            <CheckCircle2 size={16} style={{ color: '#22c55e', flexShrink: 0 }} />
          ) : (
            <AlertCircle size={16} style={{ color: '#ef4444', flexShrink: 0 }} />
          )}
          <span style={{ fontWeight: 500 }}>{demoFeedback.message}</span>
          {demoFeedback.caseId && (
            <button
              type="button"
              onClick={() => {
                navigate(`/cases/${demoFeedback.caseId}`);
                setDemoFeedback(null);
              }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.3rem',
                padding: '0.25rem 0.65rem',
                fontSize: '0.78rem',
                fontWeight: 700,
                borderRadius: '6px',
                background: '#22c55e',
                color: '#fff',
                border: 'none',
                cursor: 'pointer',
                marginLeft: '0.25rem',
                whiteSpace: 'nowrap',
              }}
            >
              <span>Open Investigation</span>
              <ArrowRight size={13} />
            </button>
          )}
          <button
            type="button"
            onClick={() => setDemoFeedback(null)}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-muted, #94a3b8)',
              cursor: 'pointer',
              padding: '2px',
              display: 'flex',
              alignItems: 'center',
              marginLeft: '0.25rem',
            }}
            aria-label="Dismiss message"
          >
            <X size={14} />
          </button>
        </div>
      )}

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
