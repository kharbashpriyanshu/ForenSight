import React from 'react';
import { NavLink } from 'react-router-dom';
import { Activity, FolderOpen, FlaskConical } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

interface AppLayoutProps {
  children: React.ReactNode;
}

const AppLayout: React.FC<AppLayoutProps> = ({ children }) => {
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
        <nav className="sidebar-nav">
          <div className="nav-section-label">Station</div>
          <NavLink to="/cases" end title="Cases" aria-label="Cases" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            <FolderOpen size={17} aria-hidden="true" /> Cases
          </NavLink>
          <div className="nav-section-label">Operations</div>
          <NavLink to="/benchmark" title="Benchmark Suite" aria-label="Benchmark Suite" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            <FlaskConical size={17} aria-hidden="true" /> Benchmark Suite
          </NavLink>
          <NavLink to="/system" title="System Health" aria-label="System Health" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            <Activity size={17} aria-hidden="true" /> System Health
          </NavLink>
        </nav>
      </aside>
      <main className="main-content">
        <header className="topbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ fontWeight: 700, color: 'var(--text-main)', fontSize: '0.95rem' }}>
              Station Hub
            </div>
            <span style={{ 
              fontSize: '0.65rem', 
              fontWeight: 700, 
              background: 'rgba(184, 135, 42, 0.10)', 
              color: '#92560a', 
              border: '1px solid rgba(184, 135, 42, 0.25)', 
              padding: '0.15rem 0.5rem', 
              borderRadius: '9999px',
              letterSpacing: '0.05em'
            }}>
              STATION WORKSPACE
            </span>
          </div>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <span className="status-badge">
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--status-nominal)', display: 'inline-block' }} />
              Multi-User RBAC Active
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
          {children}
        </div>
      </main>
    </div>
  );
};

export default AppLayout;
