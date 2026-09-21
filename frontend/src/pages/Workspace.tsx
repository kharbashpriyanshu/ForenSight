import React from 'react';
import { NavLink, Outlet, useParams, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const Workspace: React.FC = () => {
  const { caseId } = useParams<{ caseId: string }>();
  const { logout } = useAuth();

  return (
    <div className="app-container">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div style={{ 
            background: 'linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%)', 
            width: '34px', 
            height: '34px', 
            borderRadius: '9px', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            color: '#ffffff', 
            fontWeight: 800, 
            fontSize: '0.875rem',
            boxShadow: '0 4px 12px rgba(30, 58, 138, 0.28), inset 0 1px 0 rgba(255, 255, 255, 0.3)'
          }}>
            FS
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: '1.05rem', letterSpacing: '-0.02em', color: 'var(--text-main)' }}>ForenSight</div>
            <div style={{ fontSize: '0.65rem', color: '#1d4ed8', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Evidence OS</div>
          </div>
        </div>
        
        <div style={{ padding: '0.85rem 1rem 0.25rem', color: 'var(--text-muted)', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          Forensic Modalities
        </div>
        
        <nav className="sidebar-nav" style={{ flex: 1, overflowY: 'auto' }}>
          <NavLink to={`/cases/${caseId}`} end className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            <span>📋</span> Overview
          </NavLink>
          <NavLink to={`/cases/${caseId}/evidence`} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            <span>🗄️</span> Evidence & Ingestion
          </NavLink>
          <NavLink to={`/cases/${caseId}/compare`} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            <span>⚖️</span> Compare Mode
          </NavLink>
          <NavLink to={`/cases/${caseId}/cross-correlation`} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            <span>🔗</span> Cross Correlation
          </NavLink>
          <NavLink to={`/cases/${caseId}/graph`} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            <span>🕸️</span> Investigation Graph
          </NavLink>
          <NavLink to={`/cases/${caseId}/assistant`} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            <span>🧭</span> Assistant
          </NavLink>
          <NavLink to={`/cases/${caseId}/analyst`} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            <span>✍️</span> Analyst Review
          </NavLink>
          <NavLink to={`/cases/${caseId}/custody`} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            <span>🛡️</span> Chain of Custody
          </NavLink>
          
          <div style={{ height: '1px', background: 'var(--border-color-translucent)', margin: '0.75rem 0.5rem' }} />

          <NavLink to={`/cases/${caseId}/reports`} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            <span>📑</span> Reports & Manifest
          </NavLink>
          <NavLink to={`/cases/${caseId}/audit`} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            <span>⏱️</span> Audit Trail
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
            <Link to="/cases" style={{ color: '#2563eb', fontSize: '0.825rem', textDecoration: 'none', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              &larr; Cases
            </Link>
            <span style={{ color: 'var(--border-color)' }}>/</span>
            <div style={{ fontWeight: 600, color: 'var(--text-main)', fontSize: '0.85rem' }}>
              Case <code style={{ color: '#1e3a8a', padding: '0.15rem 0.4rem', borderRadius: '4px' }}>{caseId}</code>
            </div>
            <span style={{ 
              fontSize: '0.65rem', 
              fontWeight: 700, 
              background: 'rgba(37, 99, 235, 0.08)', 
              color: '#1d4ed8', 
              border: '1px solid rgba(37, 99, 235, 0.2)', 
              padding: '0.15rem 0.5rem', 
              borderRadius: '9999px',
              letterSpacing: '0.05em'
            }}>
              EVIDENCE WORKSPACE
            </span>
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
            <span className="status-badge" style={{ fontSize: '0.725rem' }}>
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
