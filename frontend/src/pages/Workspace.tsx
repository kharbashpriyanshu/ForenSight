import React from 'react';
import { NavLink, Outlet, useParams, Link } from 'react-router-dom';
import { ClipboardList, Compass, FileText, GitBranch, GitCompare, History, Image, LayoutDashboard, Link2, Network, ShieldCheck } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { prefetchApi } from '../api';

const Workspace: React.FC = () => {
  const { caseId } = useParams<{ caseId: string }>();
  const { logout } = useAuth();

  return (
    <div className="app-container">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <img 
            src="/forensight-icon.png" 
            alt="ForenSight Emblem" 
            style={{ 
              height: '38px', 
              width: 'auto', 
              objectFit: 'contain',
              flexShrink: 0,
              filter: 'drop-shadow(0 2px 6px rgba(28, 43, 58, 0.22))'
            }} 
          />
          <div>
            <div style={{ fontWeight: 800, fontSize: '1.12rem', letterSpacing: '-0.02em', color: 'var(--text-main)', fontFamily: 'var(--font-display)', lineHeight: 1.15 }}>ForenSight</div>
            <div style={{ fontSize: '0.66rem', color: 'var(--accent-color)', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: 'var(--font-tech)', marginTop: '0.15rem' }}>Evidence OS</div>
          </div>
        </div>
        
        <nav className="sidebar-nav" style={{ flex: 1, overflowY: 'auto' }}>
          <div className="nav-section-label">Case</div>
          <NavLink 
            to={`/cases/${caseId}`} 
            end 
            onMouseEnter={() => prefetchApi(`/cases/${caseId}`)}
            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
          >
            <LayoutDashboard size={17} aria-hidden="true" /> Overview
          </NavLink>
          <NavLink 
            to={`/cases/${caseId}/evidence`} 
            onMouseEnter={() => prefetchApi(`/cases/${caseId}/evidence`)}
            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
          >
            <Image size={17} aria-hidden="true" /> Evidence & ingestion
          </NavLink>

          <div className="nav-section-label">Examination</div>
          <NavLink 
            to={`/cases/${caseId}/compare`} 
            onMouseEnter={() => { prefetchApi(`/cases/${caseId}/evidence`); prefetchApi(`/cases/${caseId}/lineage`); }}
            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
          >
            <GitCompare size={17} aria-hidden="true" /> Compare evidence
          </NavLink>
          <NavLink 
            to={`/cases/${caseId}/lineage`} 
            onMouseEnter={() => prefetchApi(`/cases/${caseId}/lineage`)}
            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
          >
            <GitBranch size={17} aria-hidden="true" /> Image version links
          </NavLink>
          <NavLink 
            to={`/cases/${caseId}/cross-correlation`} 
            onMouseEnter={() => prefetchApi(`/cases/${caseId}/correlations`)}
            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
          >
            <Link2 size={17} aria-hidden="true" /> Cross-image correlation
          </NavLink>
          <NavLink 
            to={`/cases/${caseId}/graph`} 
            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
          >
            <Network size={17} aria-hidden="true" /> Investigation graph
          </NavLink>
          <NavLink 
            to={`/cases/${caseId}/assistant`} 
            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
          >
            <Compass size={17} aria-hidden="true" /> Assistant
          </NavLink>
          <NavLink 
            to={`/cases/${caseId}/analyst`} 
            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
          >
            <ClipboardList size={17} aria-hidden="true" /> Analyst review
          </NavLink>

          <div className="nav-section-label">Integrity & output</div>
          <NavLink 
            to={`/cases/${caseId}/custody`} 
            onMouseEnter={() => prefetchApi(`/cases/${caseId}/custody`)}
            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
          >
            <ShieldCheck size={17} aria-hidden="true" /> Chain of custody
          </NavLink>
          <NavLink 
            to={`/cases/${caseId}/audit`} 
            onMouseEnter={() => prefetchApi(`/cases/${caseId}/audit`)}
            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
          >
            <History size={17} aria-hidden="true" /> Audit trail
          </NavLink>
          <NavLink 
            to={`/cases/${caseId}/reports`} 
            onMouseEnter={() => prefetchApi(`/cases/${caseId}/findings`)}
            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
          >
            <FileText size={17} aria-hidden="true" /> Reports & manifest
          </NavLink>
        </nav>

        <div style={{ padding: '0.85rem 1rem', borderTop: '1px solid var(--border-color-translucent)', fontSize: '0.72rem', color: 'var(--text-muted)', background: 'rgba(248, 250, 252, 0.4)' }}>
          <div>Scientific Freeze: <strong style={{ color: 'var(--text-main)' }}>Enforced</strong></div>
          <div style={{ color: '#059669', marginTop: '0.2rem', fontWeight: 600 }}>Observation != Proof</div>
        </div>
      </aside>
      
      <main className="main-content">
        <header className="topbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
            <Link to="/cases" style={{ color: 'var(--primary-color)', fontSize: '0.825rem', textDecoration: 'none', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.25rem', transition: 'all 0.15s ease' }}>
              &larr; Cases
            </Link>
            <span style={{ color: 'var(--border-color)' }}>/</span>
            <div style={{ fontWeight: 600, color: 'var(--text-main)', fontSize: '0.85rem' }}>
              Case <code style={{ color: 'var(--primary-color)', background: 'rgba(28, 43, 58, 0.06)', border: '1px solid rgba(28, 43, 58, 0.14)', backdropFilter: 'blur(8px)', padding: '0.18rem 0.45rem', borderRadius: '6px', fontWeight: 600 }}>{caseId}</code>
            </div>
            <span style={{ 
              fontSize: '0.65rem', 
              fontWeight: 700, 
              background: 'rgba(184, 135, 42, 0.10)', 
              color: '#92560a', 
              border: '1px solid rgba(184, 135, 42, 0.25)', 
              padding: '0.15rem 0.55rem', 
              borderRadius: '9999px',
              letterSpacing: '0.06em',
              fontFamily: 'var(--font-tech)'
            }}>
              EVIDENCE WORKSPACE
            </span>
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
            <span className="status-badge" style={{ fontSize: '0.725rem' }}>
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--status-nominal)', display: 'inline-block' }} />
              RBAC Guard Active
            </span>
            <button 
              id="logout-button"
              className="btn btn-secondary"
              onClick={logout} 
              style={{ 
                padding: '0.35rem 0.85rem', 
                fontSize: '0.8rem',
                fontWeight: 600
              }}
            >
              Sign Out
            </button>
          </div>
        </header>
        <div className="page-container">
          <Outlet />
        </div>
      </main>
    </div>
  );
};

export default Workspace;
