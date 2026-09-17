import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { fetchApi } from '../api';

interface CaseStats {
  case_identifier: string;
  title: string;
  status: string;
  created_at: string;
  evidence_count: number;
  analysis_count: number;
  completed_analysis_count: number;
  failed_analysis_count: number;
  running_job_count: number;
  pending_job_count: number;
  findings_count: number;
  audit_event_count: number;
  latest_assessment: string | null;
  assessment_status: string;
  rule_version: string;
  last_activity: string | null;
}

const CaseOverview: React.FC = () => {
  const { caseId } = useParams<{ caseId: string }>();
  const navigate = useNavigate();
  const [stats, setStats] = useState<CaseStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchApi(`/cases/${caseId}/overview`)
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch case overview');
        return res.json();
      })
      .then(data => {
        setStats(data);
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  }, [caseId]);

  if (loading) return <div style={{ padding: '2rem', color: 'var(--text-muted)' }}>Loading investigation dashboard...</div>;
  if (error) return <div className="error-banner">{error}</div>;
  if (!stats) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Top Header Card */}
      <div className="card" style={{ borderLeft: '4px solid var(--primary-color)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.05em', color: 'var(--primary-color)', textTransform: 'uppercase', background: 'rgba(59, 130, 246, 0.1)', padding: '0.2rem 0.6rem', borderRadius: '4px' }}>
                CASE REGISTRY
              </span>
              <span className="status-badge" style={{ backgroundColor: stats.status === 'Open' ? 'rgba(52, 199, 89, 0.1)' : 'rgba(255, 149, 0, 0.1)', color: stats.status === 'Open' ? 'var(--success-color)' : 'var(--warning-color)' }}>
                {stats.status.toUpperCase()}
              </span>
            </div>
            <h1 style={{ fontSize: '1.75rem', fontWeight: 700, margin: '0 0 0.5rem 0' }}>{stats.title}</h1>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
              Registry ID: <code style={{ color: 'var(--primary-color)' }}>{stats.case_identifier}</code> • Created: {new Date(stats.created_at).toLocaleString()}
            </div>
          </div>
          
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <button className="primary-button" onClick={() => navigate(`/cases/${caseId}/evidence`)}>
              Evidence Library ({stats.evidence_count})
            </button>
            <button className="secondary-button" onClick={() => navigate(`/cases/${caseId}/reports`)}>
              Forensic Reports
            </button>
          </div>
        </div>
      </div>

      {/* Metrics Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
        <div className="card" style={{ padding: '1.25rem' }}>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', textTransform: 'uppercase', fontWeight: 600 }}>Source Evidence</div>
          <div style={{ fontSize: '2rem', fontWeight: 700, marginTop: '0.5rem', color: 'var(--text-color)' }}>{stats.evidence_count}</div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>Cryptographically registered</div>
        </div>

        <div className="card" style={{ padding: '1.25rem' }}>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', textTransform: 'uppercase', fontWeight: 600 }}>Completed Analyses</div>
          <div style={{ fontSize: '2rem', fontWeight: 700, marginTop: '0.5rem', color: 'var(--success-color)' }}>{stats.completed_analysis_count}</div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>Out of {stats.analysis_count} total jobs</div>
        </div>

        <div className="card" style={{ padding: '1.25rem' }}>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', textTransform: 'uppercase', fontWeight: 600 }}>Active Queue</div>
          <div style={{ fontSize: '2rem', fontWeight: 700, marginTop: '0.5rem', color: stats.running_job_count > 0 ? '#3b82f6' : 'var(--text-color)' }}>
            {stats.running_job_count + stats.pending_job_count}
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
            {stats.running_job_count} running, {stats.pending_job_count} queued
          </div>
        </div>

        <div className="card" style={{ padding: '1.25rem' }}>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', textTransform: 'uppercase', fontWeight: 600 }}>Formal Findings</div>
          <div style={{ fontSize: '2rem', fontWeight: 700, marginTop: '0.5rem', color: stats.findings_count > 0 ? '#8b5cf6' : 'var(--text-color)' }}>
            {stats.findings_count}
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>Recorded observations</div>
        </div>

        <div className="card" style={{ padding: '1.25rem' }}>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', textTransform: 'uppercase', fontWeight: 600 }}>Audit Events</div>
          <div style={{ fontSize: '2rem', fontWeight: 700, marginTop: '0.5rem', color: 'var(--text-color)' }}>{stats.audit_event_count}</div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>Immutable custody trail</div>
        </div>
      </div>

      {/* Assessment & Engine Card */}
      <div className="card">
        <h2 className="card-title" style={{ marginBottom: '1rem' }}>Fusion 7B-v1 & Assessment Status</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.5rem', background: 'var(--surface-color-light)', padding: '1.25rem', borderRadius: '0.5rem' }}>
          <div>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', textTransform: 'uppercase' }}>Current Assessment</div>
            <div style={{ fontWeight: 700, fontSize: '1.2rem', marginTop: '0.25rem', color: 'var(--primary-color)' }}>
              {stats.latest_assessment || 'NO CORRELATED ASSESSMENT'}
            </div>
          </div>
          <div>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', textTransform: 'uppercase' }}>Engine Framework</div>
            <div style={{ fontWeight: 600, marginTop: '0.25rem' }}>{stats.rule_version || 'Fusion 7B-v1 (Scientifically Frozen)'}</div>
          </div>
          <div>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', textTransform: 'uppercase' }}>Last Case Activity</div>
            <div style={{ fontWeight: 600, marginTop: '0.25rem' }}>
              {stats.last_activity ? new Date(stats.last_activity).toLocaleString() : 'No recorded activity'}
            </div>
          </div>
        </div>
      </div>

      {/* Quick Action Hub */}
      <div className="card">
        <h2 className="card-title" style={{ marginBottom: '1rem' }}>Investigation Operations Hub</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
          <button 
            className="secondary-button" 
            style={{ padding: '1rem', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}
            onClick={() => navigate(`/cases/${caseId}/evidence`)}
          >
            <strong style={{ color: 'var(--primary-color)' }}>Evidence Acquisition</strong>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Upload, verify hashes, and inspect items</span>
          </button>

          <button 
            className="secondary-button" 
            style={{ padding: '1rem', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}
            onClick={() => navigate(`/cases/${caseId}/compare`)}
          >
            <strong style={{ color: 'var(--primary-color)' }}>Side-by-Side Comparison</strong>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Compare metadata & forensic artifacts</span>
          </button>

          <button 
            className="secondary-button" 
            style={{ padding: '1rem', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}
            onClick={() => navigate(`/cases/${caseId}/audit`)}
          >
            <strong style={{ color: 'var(--primary-color)' }}>Audit Trail & Findings</strong>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>View custody events & modality findings</span>
          </button>

          <button 
            className="secondary-button" 
            style={{ padding: '1rem', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}
            onClick={() => navigate(`/cases/${caseId}/reports`)}
          >
            <strong style={{ color: 'var(--primary-color)' }}>Generate PDF Report</strong>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Publication-quality forensic export</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default CaseOverview;
