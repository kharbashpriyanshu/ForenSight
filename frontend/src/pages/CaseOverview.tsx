import React, { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { fetchApi } from '../api';
import { CaseOverviewSkeleton, ErrorState, RefreshBanner } from '../components/common/LoadingStates';
import { 
  FolderOpen, 
  Layers, 
  ShieldCheck, 
  Clock, 
  ExternalLink, 
  FileText, 
  GitCompare, 
  Network, 
  ArrowUpRight, 
  Edit3, 
  CheckCircle2, 
  AlertTriangle, 
  Activity,
  GitBranch,
  X,
  ChevronRight,
  Database,
  Cpu
} from 'lucide-react';

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

function getAssessmentDetails(assessment: string | null, evidenceCount: number = 0) {
  if (evidenceCount === 0) {
    return {
      title: 'Awaiting Evidence Acquisition',
      color: '#64748b',
      bg: 'rgba(100, 116, 139, 0.06)',
      border: 'rgba(100, 116, 139, 0.2)',
      badge: 'AWAITING INTAKE',
      description: 'No evidence items have been acquired for this case. Ingest an image to begin automated multi-engine forensic examination and correlation.'
    };
  }
  if (!assessment) {
    return {
      title: 'Assessment In Progress',
      color: '#475569',
      bg: 'rgba(71, 85, 105, 0.06)',
      border: 'rgba(71, 85, 105, 0.18)',
      badge: 'PENDING',
      description: 'Automated multi-engine examination running or awaiting scheduled passes.'
    };
  }
  const clean = assessment.toUpperCase();
  if (clean.includes('LOW') || clean.includes('AUTHENTIC')) {
    return {
      title: 'Low Forensic Concern',
      color: '#15803d',
      bg: 'rgba(21, 128, 61, 0.07)',
      border: 'rgba(21, 128, 61, 0.22)',
      badge: 'VERIFIED LOW',
      description: 'Signals across noise, frequency, and metadata align with typical authentic capture characteristics.'
    };
  }
  if (clean.includes('MODERATE')) {
    return {
      title: 'Moderate Forensic Concern',
      color: '#b45309',
      bg: 'rgba(180, 83, 9, 0.07)',
      border: 'rgba(180, 83, 9, 0.22)',
      badge: 'MODERATE RISK',
      description: 'Anomalies detected in compression grids, localized noise, or metadata provenance requiring human review.'
    };
  }
  if (clean.includes('HIGH') || clean.includes('MANIPULATION')) {
    return {
      title: 'High Forensic Concern',
      color: '#b91c1c',
      bg: 'rgba(185, 28, 28, 0.07)',
      border: 'rgba(185, 28, 28, 0.22)',
      badge: 'MANIPULATION DETECTED',
      description: 'Significant mathematical and generative artifacts identified indicating localized or structural modification.'
    };
  }
  return {
    title: assessment.replace(/_/g, ' '),
    color: '#1c2b3a',
    bg: 'rgba(28, 43, 58, 0.06)',
    border: 'rgba(28, 43, 58, 0.18)',
    badge: 'RECORDED',
    description: 'Investigation evaluation recorded by analysis engine framework.'
  };
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

  const loadOverview = useCallback(() => {
    setLoading(true);
    setError('');
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
        setError(err.message || 'Unable to load case dossier');
        setLoading(false);
      });
  }, [caseId]);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

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

  if (loading && !stats) {
    return <CaseOverviewSkeleton />;
  }

  if (error && !stats) {
    return (
      <ErrorState
        title="Error loading case dossier"
        message={error}
        onRetry={loadOverview}
      />
    );
  }

  if (!stats) return null;

  const intake = stats.intake_context;
  let safeSourceReferenceUrl: string | null = null;
  if (intake?.source_reference_url) {
    try {
      const parsed = new URL(intake.source_reference_url);
      if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
        safeSourceReferenceUrl = parsed.toString();
      }
    } catch {
      safeSourceReferenceUrl = null;
    }
  }

  const assessmentDetails = getAssessmentDetails(stats.latest_assessment, stats.evidence_count);

  const hasEvidence = stats.evidence_count > 0;
  const hasAnalyses = stats.completed_analysis_count > 0;
  const hasFindings = stats.findings_count > 0;

  // Investigation workflow milestones
  const workflowMilestones = [
    {
      id: 'intake',
      icon: FileText,
      title: 'Intake & Claim Context',
      status: intake?.claim_summary ? 'Documented' : 'Optional',
      isComplete: Boolean(intake?.claim_summary),
      isActionable: true,
      description: intake?.claim_summary ? 'Reported claim context recorded' : 'Define initial origin claim context',
      action: () => setEditingIntake(true)
    },
    {
      id: 'evidence',
      icon: FolderOpen,
      title: 'Evidence Preservation',
      status: hasEvidence ? `${stats.evidence_count} Preserved` : 'Awaiting Intake',
      isComplete: hasEvidence,
      isActionable: true,
      description: hasEvidence ? `${stats.evidence_count} ${stats.evidence_count === 1 ? 'file' : 'files'} SHA-256 hashed & sealed` : 'Primary source image intake pending',
      action: () => navigate(`/cases/${caseId}/evidence`)
    },
    {
      id: 'analysis',
      icon: Cpu,
      title: 'Automated Examination',
      status: !hasEvidence ? 'Awaiting Evidence' : (hasAnalyses ? `${stats.completed_analysis_count} Executed` : (stats.running_job_count > 0 ? `${stats.running_job_count} Running` : 'Pending')),
      isComplete: hasAnalyses,
      isActionable: hasEvidence,
      description: !hasEvidence ? 'Requires evidence intake before execution' : `${stats.completed_analysis_count} engine passes completed`,
      action: () => navigate(`/cases/${caseId}/evidence`)
    },
    {
      id: 'adjudication',
      icon: CheckCircle2,
      title: 'Analyst Findings',
      status: !hasEvidence ? 'Awaiting Evidence' : (hasFindings ? `${stats.findings_count} Observations` : 'Pending Review'),
      isComplete: hasFindings,
      isActionable: hasEvidence,
      description: !hasEvidence ? 'Requires examination results to correlate' : (hasFindings ? 'Documented expert anomalies' : 'Correlate signals in workbench'),
      action: () => navigate(`/cases/${caseId}/analyst`)
    },
    {
      id: 'reporting',
      icon: ShieldCheck,
      title: 'Custody & Case Reporting',
      status: !hasEvidence ? 'Awaiting Evidence' : (hasAnalyses ? 'Ready to Compile' : 'Awaiting Analysis'),
      isComplete: false,
      isActionable: hasEvidence,
      description: !hasEvidence ? 'Case ledger initialized; report compilation requires evidence' : `${stats.audit_event_count} ledger entries logged; ready for formal report compilation`,
      action: () => navigate(`/cases/${caseId}/reports`)
    }
  ];

  return (
    <div aria-busy={loading} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {loading && <RefreshBanner label="Refreshing case dossier…" />}
      {/* =================================================================== */}
      {/* 1. MINIMAL UNIFIED DOSSIER HEADER                                   */}
      {/* =================================================================== */}
      <div className="card" style={{ padding: '1.5rem', margin: 0, borderLeft: '4px solid var(--primary-color)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
          <div style={{ flex: '1 1 500px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.45rem', flexWrap: 'wrap' }}>
              <span style={{ 
                fontSize: '0.68rem', 
                fontWeight: 700, 
                letterSpacing: '0.08em', 
                color: 'var(--primary-color)', 
                textTransform: 'uppercase', 
                background: 'rgba(28, 43, 58, 0.06)', 
                border: '1px solid rgba(28, 43, 58, 0.12)',
                padding: '0.15rem 0.55rem', 
                borderRadius: '6px',
                fontFamily: 'var(--font-tech)'
              }}>
                CASE DOSSIER
              </span>

              <span style={{ 
                fontSize: '0.68rem', 
                fontWeight: 700, 
                letterSpacing: '0.06em', 
                color: stats.status === 'Open' ? '#15803d' : '#b45309', 
                background: stats.status === 'Open' ? 'rgba(21, 128, 61, 0.08)' : 'rgba(180, 83, 9, 0.08)',
                border: `1px solid ${stats.status === 'Open' ? 'rgba(21, 128, 61, 0.2)' : 'rgba(180, 83, 9, 0.2)'}`,
                padding: '0.15rem 0.55rem', 
                borderRadius: '6px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
                fontFamily: 'var(--font-tech)'
              }}>
                <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: stats?.status === 'Open' ? '#16a34a' : '#d97706' }} />
                {stats?.status ? stats.status.toUpperCase() : 'ACTIVE'}
              </span>

              <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                Registry: <code style={{ color: 'var(--primary-color)', fontWeight: 600, background: 'rgba(28, 43, 58, 0.05)', padding: '0.1rem 0.35rem', borderRadius: '4px' }}>{stats.case_identifier}</code>
              </span>
            </div>

            <h1 style={{ 
              fontSize: '1.65rem', 
              fontWeight: 800, 
              margin: '0.2rem 0 0.4rem', 
              letterSpacing: '-0.025em', 
              color: 'var(--text-main)', 
              fontFamily: 'var(--font-display)' 
            }}>
              {stats.title}
            </h1>

            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', color: 'var(--text-muted)', fontSize: '0.78rem', flexWrap: 'wrap' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <Clock size={13} />
                <span>Created {new Date(stats.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
              </span>
              <span>•</span>
              <span>
                Last Active: <strong style={{ color: 'var(--text-main)' }}>{stats.last_activity ? new Date(stats.last_activity).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Just now'}</strong>
              </span>
            </div>
          </div>

          {/* Quick Primary Actions */}
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <button 
              type="button"
              className="btn btn-secondary"
              onClick={() => setEditingIntake(v => !v)}
              style={{ fontSize: '0.8rem', padding: '0.45rem 0.85rem' }}
            >
              <Edit3 size={14} />
              <span>{editingIntake ? 'Close Intake' : 'Case Context'}</span>
            </button>

            <button 
              type="button"
              className="btn btn-secondary"
              onClick={() => navigate(`/cases/${caseId}/reports`)}
              style={{ fontSize: '0.8rem', padding: '0.45rem 0.85rem' }}
            >
              <FileText size={14} />
              <span>Export Report</span>
            </button>

            <button 
              type="button"
              className="btn btn-primary"
              onClick={() => navigate(`/cases/${caseId}/evidence`)}
              style={{ fontSize: '0.8rem', padding: '0.45rem 1rem' }}
            >
              <FolderOpen size={14} />
              <span>Open Evidence ({stats.evidence_count})</span>
            </button>
          </div>
        </div>

        {/* Claim Context Banner (if documented) */}
        {intake?.claim_summary && !editingIntake && (
          <div style={{ 
            marginTop: '1.1rem', 
            padding: '0.75rem 1rem', 
            borderRadius: '8px', 
            background: 'var(--surface-color-light)', 
            border: '1px solid var(--border-color-translucent)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: '1rem'
          }}>
            <div>
              <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--accent-color)', textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: 'var(--font-tech)' }}>
                Reported Intake Context
              </div>
              <div style={{ fontSize: '0.84rem', color: 'var(--text-main)', marginTop: '0.2rem', lineHeight: 1.45 }}>
                {intake.claim_summary}
              </div>
              {(intake.reported_event_date || intake.reported_location || safeSourceReferenceUrl) && (
                <div style={{ display: 'flex', gap: '0.85rem', flexWrap: 'wrap', marginTop: '0.35rem', fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                  {intake.reported_event_date && <span>Event Date: <strong>{intake.reported_event_date}</strong></span>}
                  {intake.reported_location && <span>Location: <strong>{intake.reported_location}</strong></span>}
                  {safeSourceReferenceUrl && (
                    <a href={safeSourceReferenceUrl} target="_blank" rel="noreferrer" style={{ color: 'var(--primary-color)', display: 'inline-flex', alignItems: 'center', gap: '0.2rem' }}>
                      <span>Source Link</span>
                      <ExternalLink size={11} />
                    </a>
                  )}
                </div>
              )}
            </div>
            <button 
              type="button" 
              onClick={() => setEditingIntake(true)}
              style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '0.2rem', fontSize: '0.75rem' }}
              title="Edit intake details"
            >
              <Edit3 size={13} />
            </button>
          </div>
        )}

        {/* Inline Context Editor */}
        {editingIntake && (
          <div style={{ 
            marginTop: '1.1rem', 
            padding: '1rem', 
            borderRadius: '10px', 
            background: 'var(--surface-color-light)', 
            border: '1px solid var(--border-color)',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.65rem'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.76rem', fontWeight: 700, color: 'var(--primary-color)', textTransform: 'uppercase', fontFamily: 'var(--font-tech)' }}>
                Edit Case Intake Context
              </span>
              <button 
                type="button" 
                onClick={() => setEditingIntake(false)} 
                style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                <X size={15} />
              </button>
            </div>
            {intakeSaveError && <div className="error-banner" style={{ margin: 0 }}>{intakeSaveError}</div>}
            <textarea 
              placeholder="What is being claimed about these images? (Unverified context)" 
              value={claimSummary} 
              onChange={e => setClaimSummary(e.target.value)} 
              rows={2} 
              style={{ width: '100%', resize: 'vertical', fontSize: '0.82rem' }} 
            />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.65rem' }}>
              <input type="date" aria-label="Reported date" value={reportedEventDate} onChange={e => setReportedEventDate(e.target.value)} style={{ fontSize: '0.82rem' }} />
              <input type="text" placeholder="Reported location" value={reportedLocation} onChange={e => setReportedLocation(e.target.value)} style={{ fontSize: '0.82rem' }} />
              <input type="url" placeholder="Source URL reference" value={sourceReferenceUrl} onChange={e => setSourceReferenceUrl(e.target.value)} style={{ fontSize: '0.82rem' }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.25rem' }}>
              <button type="button" className="btn btn-secondary" onClick={() => setEditingIntake(false)} style={{ fontSize: '0.78rem' }}>
                Cancel
              </button>
              <button type="button" className="btn btn-primary" onClick={saveIntakeContext} disabled={savingIntake} style={{ fontSize: '0.78rem' }}>
                {savingIntake ? 'Saving...' : 'Save Context'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* =================================================================== */}
      {/* 2. UNIFIED HARMONIOUS TELEMETRY STRIP                               */}
      {/* =================================================================== */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', 
        gap: '0.85rem' 
      }}>
        <div className="card" style={{ padding: '1rem 1.15rem', margin: 0, display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', fontFamily: 'var(--font-tech)', letterSpacing: '0.06em' }}>
              Evidence Items
            </span>
            <FolderOpen size={14} style={{ color: 'var(--primary-color)', opacity: 0.7 }} />
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--text-main)', fontFamily: 'var(--font-mono)', letterSpacing: '-0.03em' }}>
            {stats.evidence_count}
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
            {stats.evidence_count === 0 ? 'Awaiting evidence acquisition' : `${stats.evidence_count} ${stats.evidence_count === 1 ? 'file' : 'files'} SHA-256 preserved`}
          </div>
        </div>

        <div className="card" style={{ padding: '1rem 1.15rem', margin: 0, display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', fontFamily: 'var(--font-tech)', letterSpacing: '0.06em' }}>
              Completed Passes
            </span>
            <CheckCircle2 size={14} style={{ color: stats.completed_analysis_count > 0 ? '#15803d' : 'var(--text-muted)', opacity: 0.8 }} />
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, color: stats.completed_analysis_count > 0 ? '#15803d' : 'var(--text-main)', fontFamily: 'var(--font-mono)', letterSpacing: '-0.03em' }}>
            {stats.completed_analysis_count ?? 0}
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
            {stats.evidence_count === 0 ? 'Awaiting evidence acquisition' : `Out of ${stats.analysis_count || stats.completed_analysis_count || 0} scheduled passes`}
          </div>
        </div>

        <div className="card" style={{ padding: '1rem 1.15rem', margin: 0, display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', fontFamily: 'var(--font-tech)', letterSpacing: '0.06em' }}>
              Active Queue
            </span>
            <Activity size={14} style={{ color: (stats.running_job_count || 0) > 0 ? 'var(--accent-color)' : 'var(--text-muted)' }} />
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, color: (stats.running_job_count || 0) > 0 ? 'var(--accent-color)' : 'var(--text-main)', fontFamily: 'var(--font-mono)', letterSpacing: '-0.03em' }}>
            {(stats.running_job_count || 0) + (stats.pending_job_count || 0)}
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
            {(stats.running_job_count || 0) > 0 ? `${stats.running_job_count} running in background` : (stats.evidence_count === 0 ? 'Queue idle — no evidence' : 'Analysis queue idle')}
          </div>
        </div>

        <div className="card" style={{ padding: '1rem 1.15rem', margin: 0, display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', fontFamily: 'var(--font-tech)', letterSpacing: '0.06em' }}>
              Formal Findings
            </span>
            <AlertTriangle size={14} style={{ color: (stats.findings_count || 0) > 0 ? '#b45309' : 'var(--text-muted)' }} />
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, color: (stats.findings_count || 0) > 0 ? '#b45309' : 'var(--text-main)', fontFamily: 'var(--font-mono)', letterSpacing: '-0.03em' }}>
            {stats.findings_count || 0}
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
            {stats.evidence_count === 0 ? 'Awaiting analysis passes' : 'Recorded observations'}
          </div>
        </div>

        <div className="card" style={{ padding: '1rem 1.15rem', margin: 0, display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', fontFamily: 'var(--font-tech)', letterSpacing: '0.06em' }}>
              Custody Events
            </span>
            <ShieldCheck size={14} style={{ color: 'var(--accent-color)', opacity: 0.9 }} />
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--text-main)', fontFamily: 'var(--font-mono)', letterSpacing: '-0.03em' }}>
            {stats.audit_event_count ?? 0}
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
            {stats.evidence_count === 0 ? 'Ledger initialized (case creation)' : `${stats.audit_event_count ?? 0} immutable ledger entries`}
          </div>
        </div>
      </div>

      {/* =================================================================== */}
      {/* 3. BALANCED TWO-COLUMN CORE WORKSPACE ARCHITECTURE                  */}
      {/* =================================================================== */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr)', gap: '1.25rem', alignItems: 'start' }}>
        
        {/* Left Column: Investigation Lifecycle & Forensic Assessment */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          
          {/* Forensic Lifecycle Progression */}
          <section className="card" style={{ padding: '1.35rem', margin: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <div>
                <h2 style={{ fontSize: '1.02rem', fontWeight: 700, margin: 0, fontFamily: 'var(--font-display)', color: 'var(--text-main)' }}>
                  Investigation Workflow
                </h2>
                <p style={{ margin: '0.15rem 0 0', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  Structured forensic examination workflow from evidence intake to formal case reporting
                </p>
              </div>
              <span style={{ fontSize: '0.7rem', color: 'var(--accent-color)', fontWeight: 700, fontFamily: 'var(--font-tech)' }}>
                WORKFLOW STATUS
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
              {workflowMilestones.map((milestone) => {
                const IconComponent = milestone.icon;
                return (
                  <div
                    key={milestone.id}
                    onClick={milestone.isActionable ? milestone.action : undefined}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '0.75rem 0.95rem',
                      borderRadius: '9px',
                      background: 'var(--surface-color-light)',
                      border: '1px solid var(--border-color-translucent)',
                      cursor: milestone.isActionable ? 'pointer' : 'not-allowed',
                      opacity: milestone.isActionable ? 1 : 0.82,
                      transition: 'all 0.18s ease'
                    }}
                    className={milestone.isActionable ? "hover:border-amber-400" : undefined}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                      <span style={{ 
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '28px',
                        height: '28px',
                        borderRadius: '6px',
                        color: milestone.isComplete ? '#15803d' : (milestone.isActionable ? 'var(--primary-color)' : 'var(--text-muted)'),
                        background: milestone.isComplete ? 'rgba(21, 128, 61, 0.08)' : (milestone.isActionable ? 'rgba(28, 43, 58, 0.06)' : 'rgba(0,0,0,0.04)')
                      }}>
                        <IconComponent size={14} />
                      </span>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '0.86rem', color: 'var(--text-main)' }}>
                          {milestone.title}
                        </div>
                        <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '0.1rem' }}>
                          {milestone.description}
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                      <span style={{ 
                        fontSize: '0.7rem', 
                        fontWeight: 700, 
                        color: milestone.isComplete ? '#15803d' : 'var(--text-muted)',
                        fontFamily: 'var(--font-tech)'
                      }}>
                        {milestone.status}
                      </span>
                      {milestone.isActionable && <ChevronRight size={14} style={{ color: 'var(--text-muted)' }} />}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Forensic Engine Assessment */}
          <div className="card" style={{ padding: '1.35rem', margin: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.9rem' }}>
              <div>
                <h3 style={{ fontSize: '0.98rem', fontWeight: 700, margin: 0, fontFamily: 'var(--font-display)', color: 'var(--text-main)' }}>
                  Forensic Assessment & Engine State
                </h3>
                <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                  Framework: <strong style={{ color: 'var(--text-main)' }}>{stats.rule_version || 'Correlated Rule Engine'}</strong> {stats.evidence_count === 0 ? '(Idle — Awaiting Evidence)' : '(Scientifically Frozen)'}
                </div>
              </div>
              <span style={{ 
                fontSize: '0.68rem', 
                fontWeight: 800, 
                color: assessmentDetails.color,
                background: assessmentDetails.bg,
                border: `1px solid ${assessmentDetails.border}`,
                padding: '0.18rem 0.55rem',
                borderRadius: '6px',
                fontFamily: 'var(--font-tech)'
              }}>
                {assessmentDetails.badge}
              </span>
            </div>

            <div style={{ 
              background: assessmentDetails.bg, 
              border: `1px solid ${assessmentDetails.border}`, 
              borderRadius: '9px', 
              padding: '0.9rem 1.1rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.35rem'
            }}>
              <div style={{ fontSize: '1.08rem', fontWeight: 800, color: assessmentDetails.color, fontFamily: 'var(--font-display)' }}>
                {assessmentDetails.title}
              </div>
              <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-main)', lineHeight: 1.5 }}>
                {assessmentDetails.description}
              </p>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.9rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border-color-translucent)', fontSize: '0.76rem' }}>
              <span style={{ color: 'var(--text-muted)' }}>
                Principle: <strong style={{ color: 'var(--text-main)' }}>Observation ≠ Proof</strong>
              </span>
              <button 
                type="button" 
                onClick={() => navigate(`/cases/${caseId}/analyst`)}
                style={{ background: 'transparent', border: 'none', color: 'var(--primary-color)', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.78rem' }}
              >
                <span>Analyst Review Room</span>
                <ArrowUpRight size={13} />
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: Direct Investigation Workspaces Hub */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <section className="card" style={{ padding: '1.35rem', margin: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <div>
                <h2 style={{ fontSize: '1.02rem', fontWeight: 700, margin: 0, fontFamily: 'var(--font-display)', color: 'var(--text-main)' }}>
                  Investigation Workspaces
                </h2>
                <p style={{ margin: '0.15rem 0 0', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  Direct jump points to forensic examination toolsets
                </p>
              </div>
              <Database size={15} style={{ color: 'var(--accent-color)' }} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '0.65rem' }}>
              
              <div 
                onClick={() => navigate(`/cases/${caseId}/evidence`)}
                style={{ 
                  padding: '0.85rem 1rem', 
                  borderRadius: '9px', 
                  background: 'var(--surface-color-light)', 
                  border: '1px solid var(--border-color-translucent)',
                  cursor: 'pointer',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  transition: 'all 0.18s ease'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <FolderOpen size={16} style={{ color: 'var(--primary-color)' }} />
                  <div>
                    <strong style={{ fontSize: '0.86rem', color: 'var(--text-main)', display: 'block' }}>Evidence Library & Ingestion</strong>
                    <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>Inspect hashes, EXIF, and DIP artifacts</span>
                  </div>
                </div>
                <ArrowUpRight size={14} style={{ color: 'var(--text-muted)' }} />
              </div>

              <div 
                onClick={() => navigate(`/cases/${caseId}/compare`)}
                style={{ 
                  padding: '0.85rem 1rem', 
                  borderRadius: '9px', 
                  background: 'var(--surface-color-light)', 
                  border: '1px solid var(--border-color-translucent)',
                  cursor: 'pointer',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  transition: 'all 0.18s ease'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <GitCompare size={16} style={{ color: 'var(--accent-color)' }} />
                  <div>
                    <strong style={{ fontSize: '0.86rem', color: 'var(--text-main)', display: 'block' }}>Dual-Pane Comparison</strong>
                    <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>Side-by-side pixel and noise residual diffs</span>
                  </div>
                </div>
                <ArrowUpRight size={14} style={{ color: 'var(--text-muted)' }} />
              </div>

              <div 
                onClick={() => navigate(`/cases/${caseId}/graph`)}
                style={{ 
                  padding: '0.85rem 1rem', 
                  borderRadius: '9px', 
                  background: 'var(--surface-color-light)', 
                  border: '1px solid var(--border-color-translucent)',
                  cursor: 'pointer',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  transition: 'all 0.18s ease'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <Network size={16} style={{ color: '#581c87' }} />
                  <div>
                    <strong style={{ fontSize: '0.86rem', color: 'var(--text-main)', display: 'block' }}>Investigation Knowledge Graph</strong>
                    <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>Interactive DAG of evidence & engine nodes</span>
                  </div>
                </div>
                <ArrowUpRight size={14} style={{ color: 'var(--text-muted)' }} />
              </div>

              <div 
                onClick={() => navigate(`/cases/${caseId}/cross-correlation`)}
                style={{ 
                  padding: '0.85rem 1rem', 
                  borderRadius: '9px', 
                  background: 'var(--surface-color-light)', 
                  border: '1px solid var(--border-color-translucent)',
                  cursor: 'pointer',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  transition: 'all 0.18s ease'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <Layers size={16} style={{ color: '#0284c7' }} />
                  <div>
                    <strong style={{ fontSize: '0.86rem', color: 'var(--text-main)', display: 'block' }}>Cross-Image Correlation</strong>
                    <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>Find shared clone features and splice clusters</span>
                  </div>
                </div>
                <ArrowUpRight size={14} style={{ color: 'var(--text-muted)' }} />
              </div>

              <div 
                onClick={() => navigate(`/cases/${caseId}/lineage`)}
                style={{ 
                  padding: '0.85rem 1rem', 
                  borderRadius: '9px', 
                  background: 'var(--surface-color-light)', 
                  border: '1px solid var(--border-color-translucent)',
                  cursor: 'pointer',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  transition: 'all 0.18s ease'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <GitBranch size={16} style={{ color: '#0d9488' }} />
                  <div>
                    <strong style={{ fontSize: '0.86rem', color: 'var(--text-main)', display: 'block' }}>Image Version Lineage</strong>
                    <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>Trace edit trees and resave generation trees</span>
                  </div>
                </div>
                <ArrowUpRight size={14} style={{ color: 'var(--text-muted)' }} />
              </div>

              <div 
                onClick={() => navigate(`/cases/${caseId}/custody`)}
                style={{ 
                  padding: '0.85rem 1rem', 
                  borderRadius: '9px', 
                  background: 'var(--surface-color-light)', 
                  border: '1px solid var(--border-color-translucent)',
                  cursor: 'pointer',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  transition: 'all 0.18s ease'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <ShieldCheck size={16} style={{ color: '#15803d' }} />
                  <div>
                    <strong style={{ fontSize: '0.86rem', color: 'var(--text-main)', display: 'block' }}>Chain of Custody & Audit</strong>
                    <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>Verifiable chronological event signatures</span>
                  </div>
                </div>
                <ArrowUpRight size={14} style={{ color: 'var(--text-muted)' }} />
              </div>

            </div>
          </section>

          {/* Quick Forensic Integrity Notice */}
          <div style={{ 
            padding: '1rem', 
            borderRadius: '10px', 
            background: 'rgba(28, 43, 58, 0.03)', 
            border: '1px dashed var(--border-color)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.85rem'
          }}>
            <Cpu size={20} style={{ color: 'var(--accent-color)', flexShrink: 0 }} />
            <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', lineHeight: 1.45 }}>
              <strong style={{ color: 'var(--text-main)' }}>Cryptographic Freeze Enforced</strong>: Raw evidence binaries are stored read-only with SHA-256 validation. Any derivative findings retain immutable provenance links.
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};

export default CaseOverview;
