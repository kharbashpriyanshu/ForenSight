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
          <div style={{ 
            background: 'linear-gradient(135deg, #1c2b3a 0%, #2d4258 100%)', 
            width: '32px', 
            height: '32px', 
            borderRadius: '8px', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            color: '#f5f0e2', 
            fontWeight: 800, 
            fontSize: '0.85rem',
            boxShadow: '0 4px 10px rgba(28, 43, 58, 0.28), inset 0 1px 0 rgba(255, 240, 190, 0.3)'
          }}>
            FS
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: '1.05rem', letterSpacing: '-0.02em', color: 'var(--text-main)' }}>ForenSight</div>
            <div style={{ fontSize: '0.65rem', color: '#b8872a', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Evidence OS</div>
          </div>
        </div>
        <nav className="sidebar-nav">
          <div className="nav-section-label">Station</div>
          <NavLink to="/cases" end className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            <FolderOpen size={17} aria-hidden="true" /> Cases
          </NavLink>
          <div className="nav-section-label">Operations</div>
          <NavLink to="/benchmark" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            <FlaskConical size={17} aria-hidden="true" /> Benchmark Suite
          </NavLink>
          <NavLink to="/system" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
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
