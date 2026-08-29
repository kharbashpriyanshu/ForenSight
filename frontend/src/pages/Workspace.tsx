import React from 'react';
import { NavLink, Outlet, useParams } from 'react-router-dom';

const Workspace: React.FC = () => {
  const { caseId } = useParams<{ caseId: string }>();

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
          <div style={{ fontWeight: 500, color: 'var(--text-muted)' }}>
            Case: {caseId}
          </div>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <span className="status-badge">System Healthy</span>
            <div style={{ width: '32px', height: '32px', borderRadius: '50%', backgroundColor: 'var(--primary-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>
              I
            </div>
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
