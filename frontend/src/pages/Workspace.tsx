import React, { useState } from 'react';
import { NavLink, Outlet, useParams, useLocation, Link, useOutletContext } from 'react-router-dom';
import { 
  ArrowLeft,
  Check,
  ClipboardList, 
  Compass, 
  Copy,
  FileText, 
  FlaskConical,
  FolderArchive,
  Activity,
  GitBranch, 
  GitCompare, 
  History, 
  LayoutDashboard, 
  Link2, 
  Microscope,
  Network, 
  ShieldCheck,
  UploadCloud
} from 'lucide-react';
import { prefetchApi } from '../api';
import type { AppLayoutContext } from '../components/layout/AppLayout';

const Workspace: React.FC = () => {
  const { caseId } = useParams<{ caseId: string }>();
  const location = useLocation();
  const outletCtx = useOutletContext<AppLayoutContext | undefined>();
  const mobileNavOpen = outletCtx?.mobileNavOpen ?? false;
  const setMobileNavOpen = outletCtx?.setMobileNavOpen;

  const [copied, setCopied] = useState(false);

  // Extract active evidenceId if currently navigating an evidence detail view
  const evidenceMatch = location.pathname.match(/\/evidence\/([^/]+)/);
  const rawEvidenceId = evidenceMatch ? evidenceMatch[1] : undefined;
  const activeEvidenceId = (rawEvidenceId && rawEvidenceId !== 'upload' && rawEvidenceId !== 'new') 
    ? rawEvidenceId 
    : undefined;

  const handleCopyCaseId = () => {
    if (!caseId) return;
    navigator.clipboard.writeText(caseId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <>
      {mobileNavOpen && (
        <div 
          className="sidebar-backdrop" 
          onClick={() => setMobileNavOpen?.(false)} 
          aria-hidden="true"
        />
      )}

      {/* CASE WORKSPACE SIDEBAR */}
      <aside className={`sidebar case-sidebar ${mobileNavOpen ? 'mobile-open' : ''}`}>
        {/* Active Case Context Box */}
        <div className="case-context-card">
          <Link to="/cases" className="sidebar-back-link" title="Return to Station Cases Directory">
            <ArrowLeft size={13} aria-hidden="true" />
            <span>All Cases</span>
          </Link>

          <div className="case-context-header">
            <div className="case-context-label">Case Identifier</div>
            <div className="case-id-display">
              <span className="case-id-text" title={caseId}>{caseId}</span>
              <button 
                type="button" 
                className="case-id-copy-btn" 
                onClick={handleCopyCaseId}
                title={copied ? "Copied to clipboard" : "Copy Case ID"}
                aria-label={copied ? "Case ID copied" : "Copy Case ID"}
              >
                {copied ? <Check size={13} className="text-success" /> : <Copy size={13} />}
              </button>
            </div>
          </div>

          <div className="case-status-indicator">
            <span className="status-dot-active" aria-hidden="true" />
            <span className="case-status-text">Active Investigation</span>
          </div>
        </div>

        {/* CASE NAVIGATION */}
        <nav className="sidebar-nav" aria-label="Case Investigation Navigation">
          {/* INVESTIGATION DETAILS */}
          <div className="nav-phase-group">
            <div className="nav-section-label">Investigation Details</div>
            <NavLink 
              to={`/cases/${caseId}`} 
              end 
              onMouseEnter={() => prefetchApi(`/cases/${caseId}`)}
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
            >
              <LayoutDashboard size={16} aria-hidden="true" />
              <span className="nav-item-text">Overview</span>
            </NavLink>
            <NavLink 
              to={`/cases/${caseId}/evidence`} 
              end
              onMouseEnter={() => prefetchApi(`/cases/${caseId}/evidence`)}
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
            >
              <FolderArchive size={16} aria-hidden="true" />
              <span className="nav-item-text">Evidence Files</span>
            </NavLink>
            <NavLink 
              to={`/cases/${caseId}/evidence/upload`} 
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
            >
              <UploadCloud size={16} aria-hidden="true" />
              <span className="nav-item-text">Evidence Intake</span>
            </NavLink>
          </div>

          {/* FORENSIC ANALYSIS */}
          <div className="nav-phase-group">
            <div className="nav-section-label">Forensic Analysis</div>
            {activeEvidenceId && (
              <NavLink 
                to={`/cases/${caseId}/evidence/${activeEvidenceId}`} 
                className={({ isActive }) => `nav-item active-evidence-workbench ${isActive ? 'active' : ''}`}
              >
                <Microscope size={16} aria-hidden="true" />
                <span className="nav-item-text">Examination: #{activeEvidenceId}</span>
              </NavLink>
            )}
            <NavLink 
              to={`/cases/${caseId}/compare`} 
              onMouseEnter={() => { prefetchApi(`/cases/${caseId}/evidence`); prefetchApi(`/cases/${caseId}/lineage`); }}
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
            >
              <GitCompare size={16} aria-hidden="true" />
              <span className="nav-item-text">Compare Evidence</span>
            </NavLink>
            <NavLink 
              to={`/cases/${caseId}/lineage`} 
              onMouseEnter={() => prefetchApi(`/cases/${caseId}/lineage`)}
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
            >
              <GitBranch size={16} aria-hidden="true" />
              <span className="nav-item-text">Image Lineage</span>
            </NavLink>
            <NavLink 
              to={`/cases/${caseId}/cross-correlation`} 
              onMouseEnter={() => prefetchApi(`/cases/${caseId}/correlations`)}
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
            >
              <Link2 size={16} aria-hidden="true" />
              <span className="nav-item-text">Cross-Correlation</span>
            </NavLink>
            <NavLink 
              to={`/cases/${caseId}/graph`} 
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
            >
              <Network size={16} aria-hidden="true" />
              <span className="nav-item-text">Investigation Graph</span>
            </NavLink>
          </div>

          {/* EVIDENCE & FINDINGS */}
          <div className="nav-phase-group">
            <div className="nav-section-label">Evidence & Findings</div>
            <NavLink 
              to={`/cases/${caseId}/assistant`} 
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
            >
              <Compass size={16} aria-hidden="true" />
              <span className="nav-item-text">Investigative Assistant</span>
            </NavLink>
            <NavLink 
              to={`/cases/${caseId}/analyst`} 
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
            >
              <ClipboardList size={16} aria-hidden="true" />
              <span className="nav-item-text">Analyst Review</span>
            </NavLink>
            <NavLink 
              to={`/cases/${caseId}/custody`} 
              onMouseEnter={() => prefetchApi(`/cases/${caseId}/custody`)}
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
            >
              <ShieldCheck size={16} aria-hidden="true" />
              <span className="nav-item-text">Chain of Custody</span>
            </NavLink>
            <NavLink 
              to={`/cases/${caseId}/audit`} 
              onMouseEnter={() => prefetchApi(`/cases/${caseId}/audit`)}
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
            >
              <History size={16} aria-hidden="true" />
              <span className="nav-item-text">Audit Timeline</span>
            </NavLink>
            <NavLink 
              to={`/cases/${caseId}/reports`} 
              onMouseEnter={() => prefetchApi(`/cases/${caseId}/findings`)}
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
            >
              <FileText size={16} aria-hidden="true" />
              <span className="nav-item-text">Reports & Findings</span>
            </NavLink>
          </div>

          {/* OPERATIONS */}
          <div className="nav-phase-group">
            <div className="nav-section-label">Operations</div>
            <NavLink 
              to="/benchmark" 
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
            >
              <FlaskConical size={16} aria-hidden="true" />
              <span className="nav-item-text">Benchmark Suite</span>
            </NavLink>
            <NavLink 
              to="/system" 
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
            >
              <Activity size={16} aria-hidden="true" />
              <span className="nav-item-text">System Health</span>
            </NavLink>
          </div>
        </nav>

        {/* FORENSIC INTEGRITY FOOTER */}
        <div className="sidebar-footer">
          <div className="sidebar-footer-title">
            Scientific Freeze: <strong className="sidebar-footer-state">Enforced</strong>
          </div>
          <div className="sidebar-footer-axiom">Observation ≠ Proof</div>
        </div>
      </aside>

      {/* CASE WORKSPACE CONTENT REGION */}
      <main className="page-container" id="case-content">
        <Outlet />
      </main>
    </>
  );
};

export default Workspace;
