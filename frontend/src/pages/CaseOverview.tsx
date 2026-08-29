import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';

const CaseOverview: React.FC = () => {
  const { caseId } = useParams<{ caseId: string }>();
  const navigate = useNavigate();
  const [stats, setStats] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(`http://localhost:8000/api/cases/${caseId}/overview`)
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

  if (loading) return <div>Loading case data...</div>;
  if (error) return <div className="error-banner">{error}</div>;
  if (!stats) return null;

  return (
    <div className="card">
      <h2 className="card-title">Case Overview</h2>
      
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', marginTop: '1.5rem' }}>
        <div>
          <h3 style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '1rem', textTransform: 'uppercase' }}>Identity</h3>
          <div className="metrics-grid">
            <div className="metric-box">
              <div className="metric-label">Case Identifier</div>
              <div className="metric-value" style={{ fontSize: '1rem' }}>{stats.case_identifier}</div>
            </div>
            <div className="metric-box">
              <div className="metric-label">Title</div>
              <div className="metric-value" style={{ fontSize: '1rem' }}>{stats.title}</div>
            </div>
            <div className="metric-box">
              <div className="metric-label">Status</div>
              <div className="metric-value" style={{ fontSize: '1rem' }}>
                <span className="status-badge" style={{ backgroundColor: stats.status === 'Open' ? 'rgba(0, 122, 255, 0.1)' : 'rgba(52, 199, 89, 0.1)', color: stats.status === 'Open' ? 'var(--primary-color)' : 'var(--success-color)' }}>
                  {stats.status}
                </span>
              </div>
            </div>
            <div className="metric-box">
              <div className="metric-label">Created</div>
              <div className="metric-value" style={{ fontSize: '1rem' }}>{new Date(stats.created_at).toLocaleString()}</div>
            </div>
          </div>
        </div>

        <div>
          <h3 style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '1rem', textTransform: 'uppercase' }}>Investigation Progress</h3>
          <div className="metrics-grid">
            <div className="metric-box">
              <div className="metric-label">Evidence Items</div>
              <div className="metric-value" style={{ fontSize: '1.5rem', color: 'var(--text-color)' }}>{stats.evidence_count}</div>
            </div>
            <div className="metric-box">
              <div className="metric-label">Total Analyses</div>
              <div className="metric-value" style={{ fontSize: '1.5rem', color: 'var(--text-color)' }}>{stats.analysis_count}</div>
            </div>
            <div className="metric-box">
              <div className="metric-label">Completed</div>
              <div className="metric-value" style={{ fontSize: '1.5rem', color: 'var(--success-color)' }}>{stats.completed_analysis_count}</div>
            </div>
            <div className="metric-box">
              <div className="metric-label">Failed</div>
              <div className="metric-value" style={{ fontSize: '1.5rem', color: stats.failed_analysis_count > 0 ? 'var(--error-color)' : 'var(--text-color)' }}>{stats.failed_analysis_count}</div>
            </div>
          </div>
        </div>
      </div>

      <div style={{ marginTop: '2rem', paddingTop: '2rem', borderTop: '1px solid var(--border-color)' }}>
        <h3 style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '1rem', textTransform: 'uppercase' }}>Assessment Status</h3>
        <div style={{ display: 'flex', gap: '2rem', alignItems: 'center' }}>
          <div>
            <div className="metric-label">Status</div>
            <div style={{ fontWeight: 600 }}>{stats.assessment_status}</div>
          </div>
          <div>
            <div className="metric-label">Latest Assessment</div>
            <div style={{ fontWeight: 600 }}>{stats.latest_assessment || 'Not Available'}</div>
          </div>
          <div>
            <div className="metric-label">Rule Engine</div>
            <div style={{ fontWeight: 600 }}>{stats.rule_version || 'N/A'}</div>
          </div>
        </div>
      </div>

      <div style={{ marginTop: '2rem', display: 'flex', gap: '1rem' }}>
        <button className="primary-button" onClick={() => navigate(`/cases/${caseId}/evidence`)}>
          Go to Evidence Library
        </button>
      </div>
    </div>
  );
};

export default CaseOverview;
