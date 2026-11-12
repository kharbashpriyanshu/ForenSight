import React from 'react';
import { AlertTriangle, FolderOpen, RefreshCw } from 'lucide-react';

interface SkeletonProps {
  width?: string | number;
  height?: string | number;
  borderRadius?: string;
  className?: string;
  style?: React.CSSProperties;
}

export const Skeleton: React.FC<SkeletonProps> = ({
  width = '100%',
  height = '1rem',
  borderRadius,
  className = '',
  style,
}) => (
  <span
    aria-hidden="true"
    className={`fs-skeleton ${className}`.trim()}
    style={{
      width,
      height,
      ...(borderRadius ? { borderRadius } : {}),
      ...style,
    }}
  />
);

export const RefreshBanner: React.FC<{ label?: string }> = ({ label = 'Refreshing data…' }) => (
  <div className="fs-refresh-banner" role="status" aria-live="polite">
    <span className="fs-refresh-dot" aria-hidden="true" />
    <span>{label}</span>
  </div>
);

interface EmptyStateProps {
  title: string;
  description: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title,
  description,
  icon,
  action,
}) => (
  <div className="fs-state-card" role="status">
    <div
      className="fs-state-icon"
      style={{
        background: 'var(--accent-light)',
        color: 'var(--accent-text)',
        border: '1px solid var(--accent-border)',
      }}
    >
      {icon || <FolderOpen size={20} />}
    </div>
    <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-main)' }}>{title}</div>
    <p style={{ margin: '0.45rem 0 0', fontSize: '0.85rem', color: 'var(--text-muted)', maxWidth: '420px', lineHeight: 1.5 }}>
      {description}
    </p>
    {action && <div style={{ marginTop: '1.1rem' }}>{action}</div>}
  </div>
);

interface ErrorStateProps {
  title?: string;
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
}

export const ErrorState: React.FC<ErrorStateProps> = ({
  title = 'Unable to load investigation data',
  message,
  onRetry,
  retryLabel = 'Retry',
}) => (
  <div className="fs-state-card fs-state-card-error" role="alert">
    <div
      className="fs-state-icon"
      style={{
        background: 'var(--status-anomalous-bg)',
        color: 'var(--status-anomalous)',
        border: '1px solid var(--status-anomalous-border)',
      }}
    >
      <AlertTriangle size={20} />
    </div>
    <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--status-anomalous)' }}>{title}</div>
    <p style={{ margin: '0.45rem 0 0', fontSize: '0.85rem', color: 'var(--text-body)', maxWidth: '460px', lineHeight: 1.5 }}>
      {message}
    </p>
    {onRetry && (
      <button
        type="button"
        className="btn btn-secondary"
        onClick={onRetry}
        style={{ marginTop: '1.1rem', display: 'inline-flex', alignItems: 'center', gap: '0.45rem' }}
      >
        <RefreshCw size={14} />
        {retryLabel}
      </button>
    )}
  </div>
);

/** Lightweight in-pane skeleton for lazy route chunks inside AppLayout */
export const PageShellSkeleton: React.FC = () => (
  <div className="page-container" role="status" aria-busy="true" aria-label="Loading workspace view">
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <Skeleton width="220px" height="28px" />
      <Skeleton width="380px" height="16px" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginTop: '0.5rem' }}>
        <Skeleton height="108px" borderRadius="12px" />
        <Skeleton height="108px" borderRadius="12px" />
        <Skeleton height="108px" borderRadius="12px" />
      </div>
      <Skeleton height="260px" borderRadius="12px" />
    </div>
  </div>
);

/** Skeleton matching CasesList directory rows */
export const CasesListSkeleton: React.FC = () => (
  <div role="status" aria-busy="true" aria-label="Loading investigation directory" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
    {[0, 1, 2, 3].map((idx) => (
      <div
        key={idx}
        className="card"
        style={{
          padding: '1.1rem 1.25rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '1rem',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <Skeleton width="130px" height="18px" />
            <Skeleton width="72px" height="20px" borderRadius="9999px" />
          </div>
          <Skeleton width="60%" height="14px" />
          <Skeleton width="35%" height="12px" />
        </div>
        <Skeleton width="110px" height="34px" borderRadius="8px" />
      </div>
    ))}
  </div>
);

/** Skeleton matching CaseOverview hero, 5 KPI cards, and 2-column workflow/workspaces */
export const CaseOverviewSkeleton: React.FC = () => (
  <div role="status" aria-busy="true" aria-label="Loading case overview" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
    <div className="card" style={{ padding: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', flex: 1, minWidth: '240px' }}>
        <Skeleton width="180px" height="20px" borderRadius="9999px" />
        <Skeleton width="320px" height="28px" />
        <Skeleton width="240px" height="14px" />
      </div>
      <div style={{ display: 'flex', gap: '0.65rem' }}>
        <Skeleton width="110px" height="36px" borderRadius="8px" />
        <Skeleton width="120px" height="36px" borderRadius="8px" />
      </div>
    </div>

    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '0.85rem' }}>
      {[0, 1, 2, 3, 4].map((idx) => (
        <div key={idx} className="card" style={{ padding: '1.1rem', display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
          <Skeleton width="110px" height="12px" />
          <Skeleton width="48px" height="28px" />
          <Skeleton width="130px" height="12px" />
        </div>
      ))}
    </div>

    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.25rem' }}>
      <div className="card" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <Skeleton width="180px" height="20px" />
        <Skeleton height="54px" borderRadius="8px" />
        <Skeleton height="54px" borderRadius="8px" />
        <Skeleton height="54px" borderRadius="8px" />
        <Skeleton height="54px" borderRadius="8px" />
      </div>
      <div className="card" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <Skeleton width="200px" height="20px" />
        <Skeleton height="60px" borderRadius="8px" />
        <Skeleton height="60px" borderRadius="8px" />
        <Skeleton height="60px" borderRadius="8px" />
        <Skeleton height="60px" borderRadius="8px" />
      </div>
    </div>
  </div>
);

/** Skeleton matching EvidenceLibrary grid */
export const EvidenceLibrarySkeleton: React.FC = () => (
  <div role="status" aria-busy="true" aria-label="Loading evidence library" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '1rem' }}>
    {[0, 1, 2, 3, 4, 5].map((idx) => (
      <div key={idx} className="card" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <Skeleton height="150px" borderRadius="8px" />
        <Skeleton width="75%" height="16px" />
        <Skeleton width="55%" height="12px" />
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.25rem' }}>
          <Skeleton width="80px" height="22px" borderRadius="9999px" />
          <Skeleton width="90px" height="28px" borderRadius="6px" />
        </div>
      </div>
    ))}
  </div>
);

/** Skeleton matching EvidenceDetail forensic workbench */
export const EvidenceDetailSkeleton: React.FC = () => (
  <div role="status" aria-busy="true" aria-label="Loading evidence examination workbench" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
    <div className="card" style={{ padding: '1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <Skeleton width="240px" height="24px" />
        <Skeleton width="340px" height="14px" />
      </div>
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <Skeleton width="120px" height="34px" borderRadius="8px" />
        <Skeleton width="120px" height="34px" borderRadius="8px" />
      </div>
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 1fr) minmax(360px, 1.5fr)', gap: '1.25rem' }}>
      <div className="card" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <Skeleton height="320px" borderRadius="8px" />
        <Skeleton width="60%" height="14px" />
        <Skeleton width="85%" height="12px" />
      </div>
      <div className="card" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
        <Skeleton width="200px" height="20px" />
        <Skeleton height="84px" borderRadius="8px" />
        <Skeleton height="84px" borderRadius="8px" />
        <Skeleton height="84px" borderRadius="8px" />
      </div>
    </div>
  </div>
);

/** Skeleton matching ReportsInterface & AnalystWorkspace */
export const ReportsSkeleton: React.FC = () => (
  <div role="status" aria-busy="true" aria-label="Loading reports and findings" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
    <div className="card" style={{ padding: '1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', flex: 1 }}>
        <Skeleton width="260px" height="22px" />
        <Skeleton width="420px" height="14px" />
      </div>
      <Skeleton width="150px" height="36px" borderRadius="8px" />
    </div>
    {[0, 1, 2].map((idx) => (
      <div key={idx} className="card" style={{ padding: '1.15rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', flex: 1 }}>
          <Skeleton width="190px" height="18px" />
          <Skeleton width="280px" height="13px" />
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <Skeleton width="100px" height="32px" borderRadius="6px" />
          <Skeleton width="100px" height="32px" borderRadius="6px" />
        </div>
      </div>
    ))}
  </div>
);

/** Skeleton matching Graph / Comparison / Correlation / Lineage workspaces */
export const GraphWorkspaceSkeleton: React.FC = () => (
  <div role="status" aria-busy="true" aria-label="Loading analytical workspace" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
    <div className="card" style={{ padding: '1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <Skeleton width="250px" height="22px" />
        <Skeleton width="360px" height="14px" />
      </div>
      <Skeleton width="130px" height="34px" borderRadius="8px" />
    </div>
    <div className="card" style={{ padding: '1.25rem' }}>
      <Skeleton height="420px" borderRadius="10px" />
    </div>
  </div>
);

