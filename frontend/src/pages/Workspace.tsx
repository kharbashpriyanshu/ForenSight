import React from 'react';
import { NavLink, Outlet, useParams, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const Workspace: React.FC = () => {
  const { caseId } = useParams<{ caseId: string }>();
  const { logout } = useAuth();

  return (
    <div className="app-container">
      <aside className="sidebar" style={{ width: '250px', borderRight: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column' }}>
        <div className="sidebar-brand" style={{ padding: '1.25rem 1rem', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{ background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)', width: '32px', height: '32px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ffffff', fontWeight: 800 }}>
            FS
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: '1.05rem', letterSpacing: '-0.02em', color: 'var(--text-color)' }}>ForenSight V3</div>
            <div style={{ fontSize: '0.65rem', color: '#3b82f6', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Evidence OS</div>
          </div>
        </div>
        
        <div style={{ padding: '0.75rem 1rem 0.25rem', color: 'var(--text-muted)', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          Digital Evidence OS
        </div>
        
        <nav className="sidebar-nav" style={{ flex: 1, overflowY: 'auto', padding: '0.5rem' }}>
          <NavLink to={`/cases/${caseId}`} end className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            <span style={{ fontSize: '1.05rem' }}>📋</span> Overview
          </NavLink>
          <NavLink to={`/cases/${caseId}/evidence`} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            <span style={{ fontSize: '1.05rem' }}>🗄️</span> Evidence & Batch
          </NavLink>
          <NavLink to={`/cases/${caseId}/compare`} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            <span style={{ fontSize: '1.05rem' }}>⚖️</span> Compare Mode
          </NavLink>
          <NavLink to={`/cases/${caseId}/cross-correlation`} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            <span style={{ fontSize: '1.05rem' }}>🔗</span> Cross-Image Correlation
          </NavLink>
          <NavLink to={`/cases/${caseId}/graph`} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            <span style={{ fontSize: '1.05rem' }}>🕸️</span> Investigation Graph
          </NavLink>
          <NavLink to={`/cases/${caseId}/assistant`} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            <span style={{ fontSize: '1.05rem' }}>🧭</span> Investigation Assistant
          </NavLink>
          <NavLink to={`/cases/${caseId}/analyst`} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            <span style={{ fontSize: '1.05rem' }}>✍️</span> Analyst Review
          </NavLink>
          <NavLink to={`/cases/${caseId}/custody`} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            <span style={{ fontSize: '1.05rem' }}>🛡️</span> Chain of Custody
          </NavLink>
          
          <div style={{ height: '1px', background: 'var(--border-color)', margin: '0.75rem 0.5rem' }} />

          <NavLink to={`/cases/${caseId}/reports`} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            <span style={{ fontSize: '1.05rem' }}>📑</span> Reports & Manifest
          </NavLink>
          <NavLink to={`/cases/${caseId}/audit`} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            <span style={{ fontSize: '1.05rem' }}>⏱️</span> Audit Trail
          </NavLink>
        </nav>

        <div style={{ padding: '0.75rem 1rem', borderTop: '1px solid var(--border-color)', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
          <div>Scientific Freeze: <strong>Enforced</strong></div>
          <div style={{ color: '#10b981', marginTop: '0.2rem' }}>Observation != Proof</div>
        </div>
      </aside>
      
      <main className="main-content" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <header className="topbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1.5rem', borderBottom: '1px solid var(--border-color)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <Link to="/cases" style={{ color: 'var(--primary-color)', fontSize: '0.85rem', textDecoration: 'none', fontWeight: 600 }}>
              &larr; All Cases
            </Link>
            <span style={{ color: 'var(--border-color)' }}>|</span>
            <div style={{ fontWeight: 600, color: 'var(--text-color)', fontSize: '0.85rem' }}>
              Active Case: <code style={{ color: 'var(--primary-color)', background: 'var(--surface-color-light)', padding: '0.15rem 0.4rem', borderRadius: '4px' }}>{caseId}</code>
            </div>
            <span style={{ 
              fontSize: '0.65rem', 
              fontWeight: 700, 
              background: 'rgba(59, 130, 246, 0.1)', 
              color: '#3b82f6', 
              border: '1px solid rgba(59, 130, 246, 0.25)', 
              padding: '0.15rem 0.45rem', 
              borderRadius: '9999px',
              letterSpacing: '0.05em'
            }}>
              V3 EVIDENCE OS
            </span>
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
            <span className="status-badge" style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#10b981', fontSize: '0.75rem' }}>
              RBAC Guard Active
            </span>
            <button 
              id="logout-button"
              onClick={logout} 
              style={{ 
                background: 'transparent', 
                border: '1px solid var(--border-color)', 
                color: 'var(--text-muted)', 
                padding: '0.3rem 0.65rem', 
                borderRadius: '0.25rem',
                cursor: 'pointer',
                fontSize: '0.8rem'
              }}
            >
              Logout
            </button>
          </div>
        </header>
        <div className="page-container" style={{ flex: 1, overflowY: 'auto', padding: '1.5rem' }}>
          <Outlet />
        </div>
      </main>
    </div>
  );
};

export default Workspace;
