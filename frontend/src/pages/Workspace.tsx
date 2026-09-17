import React from 'react';
import { NavLink, Outlet, useParams, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const Workspace: React.FC = () => {
  const { caseId } = useParams<{ caseId: string }>();
  const { logout } = useAuth();

  return (
    <div className="app-container">
      <aside className="sidebar">
        <div className="sidebar-brand" style={{ marginBottom: '2rem' }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 12h4l3-9 5 18 3-9h5" />
          </svg>
          ForenSight
        </div>
        
        <div style={{ padding: '0 1rem', marginBottom: '1rem', color: 'var(--text-muted)', fontSize: '0.75rem', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
          Investigation Workspace
        </div>
        
        <nav className="sidebar-nav">
          <NavLink to={`/cases/${caseId}`} end className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            Overview
          </NavLink>
          <NavLink to={`/cases/${caseId}/evidence`} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            Evidence Library
          </NavLink>
          <NavLink to={`/cases/${caseId}/compare`} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            Compare Evidence
          </NavLink>
          <NavLink to={`/cases/${caseId}/reports`} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            Reports
          </NavLink>
          <NavLink to={`/cases/${caseId}/audit`} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            Audit Trail
          </NavLink>
        </nav>
      </aside>
      
      <main className="main-content">
        <header className="topbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <Link to="/cases" style={{ color: 'var(--primary-color)', fontSize: '0.9rem', textDecoration: 'none' }}>
              &larr; All Cases
            </Link>
            <span style={{ color: 'var(--border-color)' }}>|</span>
            <div style={{ fontWeight: 600, color: 'var(--text-color)', fontSize: '0.9rem' }}>
              Case: <code style={{ color: 'var(--primary-color)' }}>{caseId}</code>
            </div>
            <span style={{ 
              fontSize: '0.7rem', 
              fontWeight: 700, 
              background: 'rgba(245, 158, 11, 0.15)', 
              color: '#f59e0b', 
              border: '1px solid rgba(245, 158, 11, 0.3)', 
              padding: '0.15rem 0.5rem', 
              borderRadius: '9999px',
              letterSpacing: '0.05em'
            }}>
              DEMO ENVIRONMENT
            </span>
          </div>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <span className="status-badge" style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#10b981' }}>
              RBAC Guard Active
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
          <Outlet />
        </div>
      </main>
    </div>
  );
};

export default Workspace;
