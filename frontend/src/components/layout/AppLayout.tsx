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
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 12h4l3-9 5 18 3-9h5" />
          </svg>
          ForenSight
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
              ForenSight V2.1
            </div>
            <span style={{ 
              fontSize: '0.7rem', 
              fontWeight: 700, 
              background: 'rgba(245, 158, 11, 0.15)', 
              color: '#f59e0b', 
              border: '1px solid rgba(245, 158, 11, 0.3)', 
              padding: '0.2rem 0.6rem', 
              borderRadius: '9999px',
              letterSpacing: '0.05em'
            }}>
              DEMO ENVIRONMENT
            </span>
          </div>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <span className="status-badge" style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#10b981' }}>
              Multi-User RBAC Active
            </span>
            <button 
              id="logout-button"
              onClick={logout} 
              style={{ 
                background: 'transparent', 
                border: '1px solid var(--border-color)', 
                color: 'var(--text-muted)', 
                padding: '0.35rem 0.75rem', 
                borderRadius: '0.25rem',
                cursor: 'pointer',
                fontSize: '0.85rem'
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
