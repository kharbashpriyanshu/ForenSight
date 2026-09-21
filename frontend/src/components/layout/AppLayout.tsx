import React from 'react';
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
          <div style={{ background: '#1e3a8a', width: '28px', height: '28px', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ffffff', fontWeight: 800, fontSize: '0.8rem' }}>
            FS
          </div>
          <span style={{ fontWeight: 700, fontSize: '1.05rem', letterSpacing: '-0.02em', color: 'var(--text-main)' }}>ForenSight</span>
        </div>
        <nav className="sidebar-nav">
          <div className="nav-item active">
            Cases Overview
          </div>
        </nav>
      </aside>
      <main className="main-content">
        <header className="topbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ fontWeight: 600, color: 'var(--text-color)', fontSize: '0.95rem' }}>
              ForenSight Evidence OS
            </div>
            <span style={{ 
              fontSize: '0.7rem', 
              fontWeight: 700, 
              background: 'rgba(37, 99, 235, 0.08)', 
              color: '#1d4ed8', 
              border: '1px solid rgba(37, 99, 235, 0.2)', 
              padding: '0.2rem 0.6rem', 
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
              onClick={logout} 
              style={{ 
                background: '#ffffff', 
                border: '1px solid var(--border-color)', 
                color: 'var(--text-muted)', 
                padding: '0.35rem 0.75rem', 
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '0.85rem',
                fontWeight: 500
              }}
            >
              Logout
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
