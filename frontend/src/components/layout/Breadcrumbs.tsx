import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';

interface Crumb {
  label: string;
  to?: string;
  isCurrent: boolean;
}

const ROUTE_LABELS: Record<string, string> = {
  evidence: 'Evidence Files',
  upload: 'Intake',
  new: 'Intake',
  compare: 'Compare Evidence',
  lineage: 'Image Lineage',
  'cross-correlation': 'Cross-Image Correlation',
  graph: 'Investigation Graph',
  assistant: 'Investigative Assistant',
  analyst: 'Analyst Review',
  custody: 'Chain of Custody',
  audit: 'Audit Timeline',
  reports: 'Reports & Findings',
  findings: 'Reports & Findings',
  history: 'Processing History',
  benchmark: 'Benchmark Suite',
  system: 'System Health',
};

export const Breadcrumbs: React.FC = () => {
  const location = useLocation();
  const path = location.pathname;

  // Split and sanitize path segments
  const segments = path.split('/').filter(Boolean);

  const crumbs: Crumb[] = [];

  if (segments.length === 0 || (segments.length === 1 && segments[0] === 'cases')) {
    crumbs.push({ label: 'Cases', isCurrent: true });
  } else if (segments[0] === 'cases' && segments.length === 2 && segments[1] === 'intake') {
    crumbs.push({ label: 'Cases', to: '/cases', isCurrent: false });
    crumbs.push({ label: 'Evidence Intake', isCurrent: true });
  } else if (segments[0] === 'benchmark') {
    crumbs.push({ label: 'Station', to: '/cases', isCurrent: false });
    crumbs.push({ label: 'Benchmark Suite', isCurrent: true });
  } else if (segments[0] === 'system') {
    crumbs.push({ label: 'Station', to: '/cases', isCurrent: false });
    crumbs.push({ label: 'System Health', isCurrent: true });
  } else if (segments[0] === 'cases' && segments.length >= 2) {
    const caseId = segments[1];
    crumbs.push({ label: 'Cases', to: '/cases', isCurrent: false });

    // Case Overview (index)
    if (segments.length === 2) {
      crumbs.push({ label: caseId, to: `/cases/${caseId}`, isCurrent: false });
      crumbs.push({ label: 'Overview', isCurrent: true });
    } else {
      crumbs.push({ label: caseId, to: `/cases/${caseId}`, isCurrent: false });
      
      const subSegment = segments[2];
      
      if (subSegment === 'evidence') {
        if (segments.length === 3) {
          crumbs.push({ label: 'Evidence Files', isCurrent: true });
        } else if (segments[3] === 'upload' || segments[3] === 'new') {
          crumbs.push({ label: 'Evidence Files', to: `/cases/${caseId}/evidence`, isCurrent: false });
          crumbs.push({ label: 'Intake', isCurrent: true });
        } else {
          const evidenceId = segments[3];
          if (segments.length >= 5 && segments[4] === 'history') {
            crumbs.push({ label: 'Evidence Files', to: `/cases/${caseId}/evidence`, isCurrent: false });
            crumbs.push({ label: `Evidence #${evidenceId}`, to: `/cases/${caseId}/evidence/${evidenceId}`, isCurrent: false });
            crumbs.push({ label: 'Processing History', isCurrent: true });
          } else {
            crumbs.push({ label: 'Evidence Files', to: `/cases/${caseId}/evidence`, isCurrent: false });
            crumbs.push({ label: `Evidence #${evidenceId}`, isCurrent: true });
          }
        }
      } else {
        const label = ROUTE_LABELS[subSegment] || subSegment.replace(/-/g, ' ');
        crumbs.push({ label, isCurrent: true });
      }
    }
  } else {
    // Fallback for any unexpected route
    crumbs.push({ label: 'Station', to: '/cases', isCurrent: false });
    segments.forEach((seg, index) => {
      const isLast = index === segments.length - 1;
      crumbs.push({
        label: ROUTE_LABELS[seg] || seg,
        isCurrent: isLast,
        to: isLast ? undefined : `/${segments.slice(0, index + 1).join('/')}`
      });
    });
  }

  return (
    <nav aria-label="Breadcrumb" className="breadcrumbs-nav">
      <ol className="breadcrumbs-list">
        {crumbs.map((crumb, idx) => (
          <li key={idx} className="breadcrumb-item">
            {idx > 0 && (
              <ChevronRight size={12} className="breadcrumb-separator" aria-hidden="true" />
            )}
            {crumb.isCurrent || !crumb.to ? (
              <span className="breadcrumb-current" aria-current="page" title={crumb.label}>
                {crumb.label}
              </span>
            ) : (
              <Link to={crumb.to} className="breadcrumb-link" title={crumb.label}>
                {crumb.label}
              </Link>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
};

export default Breadcrumbs;

