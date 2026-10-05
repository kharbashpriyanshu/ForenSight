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
  intake_context?: {
    claim_summary?: string | null;
    reported_event_date?: string | null;
    reported_location?: string | null;
    source_reference_url?: string | null;
    intake_notes?: string | null;
  } | null;
}

const CaseOverview: React.FC = () => {
  const { caseId } = useParams<{ caseId: string }>();
  const navigate = useNavigate();
  const [stats, setStats] = useState<CaseStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [intakeSaveError, setIntakeSaveError] = useState('');
  const [editingIntake, setEditingIntake] = useState(false);
  const [savingIntake, setSavingIntake] = useState(false);
  const [claimSummary, setClaimSummary] = useState('');
  const [reportedEventDate, setReportedEventDate] = useState('');
  const [reportedLocation, setReportedLocation] = useState('');
  const [sourceReferenceUrl, setSourceReferenceUrl] = useState('');
  const [intakeNotes, setIntakeNotes] = useState('');

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

  useEffect(() => {
    setClaimSummary(stats?.intake_context?.claim_summary || '');
    setReportedEventDate(stats?.intake_context?.reported_event_date || '');
    setReportedLocation(stats?.intake_context?.reported_location || '');
    setSourceReferenceUrl(stats?.intake_context?.source_reference_url || '');
    setIntakeNotes(stats?.intake_context?.intake_notes || '');
  }, [stats?.intake_context]);

  const saveIntakeContext = async () => {
    if (!caseId) return;
    setSavingIntake(true);
    setIntakeSaveError('');
    try {
      const response = await fetchApi(`/cases/${caseId}/intake`, {
        method: 'PUT',
        body: JSON.stringify({
          claim_summary: claimSummary.trim() || null,
          reported_event_date: reportedEventDate || null,
          reported_location: reportedLocation.trim() || null,
          source_reference_url: sourceReferenceUrl.trim() || null,
          intake_notes: intakeNotes.trim() || null,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Could not save case intake context.');
      setStats(current => current ? { ...current, intake_context: data } : current);
      setEditingIntake(false);
    } catch (saveError) {
      setIntakeSaveError(saveError instanceof Error ? saveError.message : 'Could not save case intake context.');
    } finally {
      setSavingIntake(false);
    }
  };

  if (loading) return <div style={{ padding: '2rem', color: 'var(--text-muted)' }}>Loading investigation dashboard...</div>;
  if (error) return <div className="error-banner">{error}</div>;
  if (!stats) return null;
  const intake = stats.intake_context;
  let safeSourceReferenceUrl: string | null = null;
  if (intake?.source_reference_url) {
    try {
      const parsedSourceUrl = new URL(intake.source_reference_url);
      if (parsedSourceUrl.protocol === 'https:' || parsedSourceUrl.protocol === 'http:') {
        safeSourceReferenceUrl = parsedSourceUrl.toString();
      }
    } catch {
      safeSourceReferenceUrl = null;
    }
  }
  const workflow = [
    { title: 'Record the report', detail: intake?.claim_summary ? 'Reported context recorded' : 'Add the claim and source context', href: `/cases/${caseId}`, done: Boolean(intake?.claim_summary) },
    { title: 'Preserve received files', detail: stats.evidence_count ? `${stats.evidence_count} image${stats.evidence_count === 1 ? '' : 's'} registered` : 'Upload the image files as received', href: `/cases/${caseId}/evidence`, done: stats.evidence_count > 0 },
    { title: 'Trace image versions', detail: stats.evidence_count > 1 ? 'Find and review related versions' : 'Add multiple versions to compare', href: `/cases/${caseId}/lineage`, done: false },
    { title: 'Review and export', detail: stats.completed_analysis_count ? 'Review observations and make a decision' : 'Run relevant analysis, then review it', href: `/cases/${caseId}/analyst`, done: stats.completed_analysis_count > 0 },
  ];

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

      <section className="card" aria-labelledby="investigation-flow-title">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap' }}>
          <div>
            <h2 id="investigation-flow-title" className="card-title" style={{ marginBottom: '0.3rem' }}>Image investigation workflow</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: 0 }}>Keep the reported claim, the preserved files, and the analyst’s interpretation distinct.</p>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button className="secondary-button" onClick={() => setEditingIntake(value => !value)}>{editingIntake ? 'Close report context' : 'Add / edit report context'}</button>
            <button className="primary-button" onClick={() => navigate(`/cases/${caseId}/evidence`)}>Continue investigation</button>
          </div>
        </div>
        {intake?.claim_summary && (
          <div style={{ background: 'var(--surface-color-light)', borderLeft: '3px solid #3b82f6', borderRadius: '5px', padding: '0.8rem 1rem', marginTop: '1rem' }}>
            <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#3b82f6', textTransform: 'uppercase' }}>Reported claim · unverified context</div>
            <div style={{ marginTop: '0.25rem', whiteSpace: 'pre-wrap' }}>{intake.claim_summary}</div>
            {(intake.reported_event_date || intake.reported_location || intake.source_reference_url) && (
              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginTop: '0.5rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                {intake.reported_event_date && <span>Reported date: {intake.reported_event_date}</span>}
                {intake.reported_location && <span>Reported place: {intake.reported_location}</span>}
                {safeSourceReferenceUrl && <a href={safeSourceReferenceUrl} target="_blank" rel="noreferrer">Open source reference</a>}
              </div>
            )}
          </div>
        )}
        {editingIntake && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.65rem', marginTop: '0.8rem', padding: '0.8rem', border: '1px solid var(--border-color)', borderRadius: '6px' }}>
            {intakeSaveError && <div className="error-banner" role="alert" style={{ gridColumn: '1 / -1' }}>{intakeSaveError}</div>}
            <textarea placeholder="What is being claimed about these images?" value={claimSummary} onChange={event => setClaimSummary(event.target.value)} rows={3} style={{ gridColumn: '1 / -1', resize: 'vertical' }} />
            <input type="date" aria-label="Reported event date" value={reportedEventDate} onChange={event => setReportedEventDate(event.target.value)} />
            <input type="text" placeholder="Reported location" value={reportedLocation} onChange={event => setReportedLocation(event.target.value)} />
            <input type="url" placeholder="Source URL" value={sourceReferenceUrl} onChange={event => setSourceReferenceUrl(event.target.value)} style={{ gridColumn: '1 / -1' }} />
            <textarea placeholder="Intake notes" value={intakeNotes} onChange={event => setIntakeNotes(event.target.value)} rows={2} style={{ gridColumn: '1 / -1', resize: 'vertical' }} />
            <button className="primary-button" onClick={saveIntakeContext} disabled={savingIntake} style={{ gridColumn: '1 / -1' }}>{savingIntake ? 'Saving…' : 'Save reported context'}</button>
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem', marginTop: '1rem' }}>
          {workflow.map((step, index) => (
            <button key={step.title} onClick={() => index === 0 ? setEditingIntake(true) : navigate(step.href)} className="secondary-button" style={{ textAlign: 'left', padding: '0.85rem', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
              <span style={{ fontSize: '0.7rem', color: step.done ? '#059669' : 'var(--text-muted)', fontWeight: 700 }}>STEP {index + 1} · {step.done ? 'RECORDED' : 'NEXT'}</span>
              <strong>{step.title}</strong>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>{step.detail}</span>
            </button>
          ))}
        </div>
      </section>

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
