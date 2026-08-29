

interface AppLayoutProps {
  children: React.ReactNode;
}

const AppLayout: React.FC<AppLayoutProps> = ({ children }) => {
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
            Dashboard
          </div>
          <div className="nav-item">
            New Case
          </div>
          <div className="nav-item">
            Evidence Library
          </div>
          <div className="nav-item">
            Reports
          </div>
          <div className="nav-item">
            Settings
          </div>
        </nav>
      </aside>
      <main className="main-content">
        <header className="topbar">
          <div style={{ fontWeight: 500, color: 'var(--text-muted)' }}>
            ForenSight V1.0
          </div>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <span className="status-badge">System Healthy</span>
            <div style={{ width: '32px', height: '32px', borderRadius: '50%', backgroundColor: 'var(--primary-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>
              A
            </div>
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
