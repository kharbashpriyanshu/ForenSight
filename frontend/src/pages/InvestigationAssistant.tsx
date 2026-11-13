import React, { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  Scale, 
  Search, 
  ShieldAlert, 
  ShieldCheck, 
  Cpu, 
  AlertTriangle, 
  Activity, 
  Layers, 
  ArrowRight, 
  HelpCircle, 
  ChevronDown, 
  ChevronUp, 
  RefreshCw, 
  Compass, 
  CheckCircle2, 
  GitCompare,
  Info
} from 'lucide-react';
import { fetchApi } from '../api';

interface InvestigativeNextStep {
  priority: string;
  action: string;
  rationale: string;
  target_evidence_id?: number;
  target_filename?: string;
}

interface CounterHypothesis {
  phenomenon: string;
  alternative_benign_explanation: string;
  testing_recommendation: string;
}

interface ForensicCompletenessMetric {
  modality: string;
  total_applicable: number;
  completed: number;
  pending: number;
  percentage: number;
}

interface AssistantResponse {
  case_identifier: string;
  title: string;
  evidence_count: number;
  what_was_found_summary: string;
  why_it_matters_summary: string;
  investigative_next_steps: InvestigativeNextStep[];
  counter_hypotheses: CounterHypothesis[];
  forensic_completeness: ForensicCompletenessMetric[];
  overall_completeness_percentage: number;
  pending_analyst_reviews_count: number;
  scientific_disclaimer: string;
}

interface ParsedFindingItem {
  raw: string;
  type?: string;
  title?: string;
  files?: string[];
  details?: string;
}

const formatFindingType = (typeStr: string): string => {
  return typeStr.replace(/_/g, ' ').toUpperCase();
};

const InvestigationAssistant: React.FC = () => {
  const { caseId } = useParams<{ caseId: string }>();
  const navigate = useNavigate();

  const [data, setData] = useState<AssistantResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedHypothesis, setExpandedHypothesis] = useState<number | null>(0);

  const fetchAssistant = () => {
    setLoading(true);
    setError('');
    fetchApi(`/cases/${caseId}/assistant`)
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch investigation assistant guidance');
        return res.json();
      })
      .then(resData => {
        setData(resData);
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchAssistant();
  }, [caseId]);

  // Structured breakdown of "What Was Found"
  const parsedWhatWasFound = useMemo<{ overview: string; items: ParsedFindingItem[] }>(() => {
    if (!data?.what_was_found_summary) {
      return { overview: '', items: [] };
    }

    const raw = data.what_was_found_summary;
    // Check if contains bullet points or newline bullets
    const parts = raw.split(/\s*•\s*/).filter(p => p.trim().length > 0);

    if (parts.length <= 1) {
      // Split by double newlines if no bullets
      const lineParts = raw.split(/\n\n+/).filter(p => p.trim().length > 0);
      if (lineParts.length > 1) {
        return {
          overview: lineParts[0].trim(),
          items: lineParts.slice(1).map((p): ParsedFindingItem => ({ raw: p.trim() })),
        };
      }
      return { overview: raw.trim(), items: [] };
    }

    const overview = parts[0].trim();
    const rawItems = parts.slice(1);

    const items: ParsedFindingItem[] = rawItems.map(itemStr => {
      const trimmed = itemStr.trim();
      // Match pattern like "[FINDING_TYPE] Title (file1 & file2): Details" or "[TYPE] Title: Details"
      const match = trimmed.match(/^\[([A-Z0-9_-]+)\]\s*(.*?)(?::\s*(.*))?$/);
      if (!match) {
        return { raw: trimmed };
      }

      const type = match[1];
      let title = match[2]?.trim() || '';
      const details = match[3]?.trim() || '';

      // Extract filenames if in parentheses: (file1 & file2) or (file.jpg)
      let files: string[] = [];
      const fileMatch = title.match(/\(([^)]+\.[a-zA-Z0-9]{3,4}(?:\s*&\s*[^)]+\.[a-zA-Z0-9]{3,4})*)\)/);
      if (fileMatch) {
        files = fileMatch[1].split('&').map(f => f.trim());
        title = title.replace(fileMatch[0], '').trim();
      }

      return {
        raw: trimmed,
        type,
        title,
        files,
        details,
      };
    });

    return { overview, items };
  }, [data?.what_was_found_summary]);

  if (loading) {
    return (
      <div style={{ 
        padding: '3rem 2rem', 
        textAlign: 'center', 
        color: 'var(--text-muted)',
        background: 'var(--surface-base)',
        borderRadius: 'var(--radius-xl)',
        border: '1px solid var(--border-default)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '1rem'
      }}>
        <RefreshCw className="animate-spin" size={24} style={{ color: 'var(--primary-color)' }} />
        <span style={{ fontSize: 'var(--text-sm)' }}>Synthesizing investigative decision support & empirical signals...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="error-banner" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <AlertTriangle size={18} />
        <span>{error}</span>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Top Banner: Scientific Principles */}
      <div 
        className="card" 
        style={{ 
          borderLeft: '4px solid var(--primary-color)',
          background: 'var(--surface-base)',
          position: 'relative'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem' }}>
              <span className="badge" style={{ 
                background: 'var(--primary-light)', 
                color: 'var(--primary-color)',
                borderColor: 'var(--primary-border)'
              }}>
                <Cpu size={12} />
                Forensic Decision Support
              </span>
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                Automated Correlation & Triage
              </span>
            </div>
            <h1 style={{ 
              fontFamily: 'var(--font-display)', 
              fontSize: 'var(--text-xl)', 
              color: 'var(--text-main)', 
              margin: '0.25rem 0' 
            }}>
              Investigation Assistant
            </h1>
            <p style={{ color: 'var(--text-body)', fontSize: 'var(--text-sm)', margin: 0, maxWidth: '820px', lineHeight: '1.55' }}>
              Empowering investigators to organize, correlate, and document evidence. ForenSight generates observations, measurements, and investigative hypotheses, but <strong style={{ color: 'var(--text-main)' }}>never replaces human forensic judgment</strong>.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <button 
              className="secondary-button" 
              onClick={fetchAssistant} 
              style={{ fontSize: 'var(--text-xs)', padding: '0.45rem 0.85rem', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
            >
              <RefreshCw size={13} />
              Refresh Synthesis
            </button>
            <button 
              className="primary-button" 
              onClick={() => navigate(`/cases/${caseId}/analyst`)} 
              style={{ fontSize: 'var(--text-xs)', padding: '0.45rem 0.85rem', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
            >
              <ShieldCheck size={14} />
              Analyst Review ({data.pending_analyst_reviews_count})
            </button>
          </div>
        </div>

        {/* Non-negotiable scientific guardrail badge */}
        <div style={{ 
          marginTop: '1.25rem', 
          padding: '0.65rem 0.9rem', 
          background: 'var(--surface-sunken)', 
          border: '1px solid var(--border-subtle)', 
          borderRadius: 'var(--radius-md)', 
          display: 'flex', 
          alignItems: 'center', 
          gap: '1.25rem', 
          flexWrap: 'wrap', 
          fontSize: 'var(--text-xs)', 
          color: 'var(--text-muted)' 
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <Scale size={14} style={{ color: 'var(--primary-color)' }} />
            <strong style={{ color: 'var(--text-main)' }}>Observation ≠ Proof</strong>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <Search size={14} style={{ color: 'var(--status-info)' }} />
            <strong style={{ color: 'var(--text-main)' }}>Anomaly ≠ Manipulation</strong>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <ShieldAlert size={14} style={{ color: 'var(--status-warning)' }} />
            <strong style={{ color: 'var(--text-main)' }}>Absence of Evidence ≠ Evidence of Absence</strong>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <Cpu size={14} style={{ color: 'var(--accent-color)' }} />
            <strong style={{ color: 'var(--text-main)' }}>Model Output ≠ Forensic Conclusion</strong>
          </div>
        </div>
      </div>

      {/* Review Alert If Any Pending */}
      {data.pending_analyst_reviews_count > 0 && (
        <div style={{ 
          background: 'var(--status-warning-bg)', 
          border: '1px solid var(--status-warning-border)', 
          padding: '0.85rem 1.15rem', 
          borderRadius: 'var(--radius-lg)', 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          flexWrap: 'wrap', 
          gap: '0.75rem' 
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <AlertTriangle size={18} style={{ color: 'var(--status-warning)', flexShrink: 0 }} />
            <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-main)' }}>
              <strong style={{ color: 'var(--status-warning)' }}>{data.pending_analyst_reviews_count} correlated findings</strong> are awaiting mandatory human analyst review and sign-off.
            </div>
          </div>
          <button 
            className="secondary-button" 
            style={{ 
              fontSize: 'var(--text-xs)', 
              padding: '0.35rem 0.75rem', 
              borderColor: 'var(--status-warning-border)', 
              color: 'var(--status-warning)',
              background: 'var(--surface-base)'
            }}
            onClick={() => navigate(`/cases/${caseId}/analyst`)}
          >
            Review Findings Queue &rarr;
          </button>
        </div>
      )}

      {/* Core Synthesis: What Was Found & Why It Matters */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '1.25rem' }}>
        {/* Card 1: What Was Found */}
        <div className="card" style={{ borderTop: '3px solid var(--status-info)', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
              <span className="badge" style={{ 
                background: 'var(--status-info-bg)', 
                color: 'var(--status-info)',
                borderColor: 'var(--status-info-border)'
              }}>
                <Activity size={12} />
                EMPIRICAL MEASUREMENTS
              </span>
            </div>
            <h2 style={{ 
              fontFamily: 'var(--font-display)', 
              fontSize: 'var(--text-md)', 
              color: 'var(--text-main)', 
              margin: '0.2rem 0' 
            }}>
              What Was Found?
            </h2>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
              Deterministic signals extracted across registered evidence files
            </div>
          </div>

          {/* Overview Metrics Callout */}
          {parsedWhatWasFound.overview && (
            <div style={{ 
              background: 'var(--surface-sunken)', 
              border: '1px solid var(--border-subtle)', 
              borderRadius: 'var(--radius-md)', 
              padding: '0.85rem 1rem',
              fontSize: 'var(--text-sm)',
              color: 'var(--text-body)',
              lineHeight: '1.5'
            }}>
              {parsedWhatWasFound.overview}
            </div>
          )}

          {/* Extracted Finding Items */}
          {parsedWhatWasFound.items.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
              {parsedWhatWasFound.items.map((item, idx) => (
                <div 
                  key={idx}
                  style={{
                    background: 'var(--surface-sunken)',
                    border: '1px solid var(--border-default)',
                    borderRadius: 'var(--radius-md)',
                    padding: '0.75rem 0.9rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.35rem'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.4rem' }}>
                    {item.type && (
                      <span className="badge" style={{ 
                        background: 'var(--primary-light)', 
                        color: 'var(--primary-color)',
                        borderColor: 'var(--primary-border)'
                      }}>
                        <GitCompare size={11} />
                        {formatFindingType(item.type)}
                      </span>
                    )}
                    {item.files && item.files.length > 0 && (
                      <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
                        {item.files.map((f, fIdx) => (
                          <span 
                            key={fIdx}
                            style={{ 
                              fontFamily: 'var(--font-mono)',
                              fontSize: 'var(--text-2xs)',
                              padding: '0.15rem 0.4rem',
                              background: 'var(--surface-base)',
                              border: '1px solid var(--border-subtle)',
                              borderRadius: 'var(--radius-xs)',
                              color: 'var(--text-main)'
                            }}
                          >
                            {f}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {item.title && (
                    <div style={{ 
                      fontSize: 'var(--text-sm)', 
                      fontWeight: 700, 
                      color: 'var(--text-main)' 
                    }}>
                      {item.title}
                    </div>
                  )}

                  {item.details ? (
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-body)', lineHeight: '1.45' }}>
                      {item.details}
                    </div>
                  ) : (
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-body)', lineHeight: '1.45' }}>
                      {item.raw}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : !parsedWhatWasFound.overview && (
            <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
              No empirical observations recorded yet for this investigation.
            </div>
          )}
        </div>

        {/* Card 2: Why Does It Matter */}
        <div className="card" style={{ borderTop: '3px solid var(--status-nominal)', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
              <span className="badge" style={{ 
                background: 'var(--status-nominal-bg)', 
                color: 'var(--status-nominal)',
                borderColor: 'var(--status-nominal-border)'
              }}>
                <ShieldCheck size={12} />
                FORENSIC SIGNIFICANCE
              </span>
            </div>
            <h2 style={{ 
              fontFamily: 'var(--font-display)', 
              fontSize: 'var(--text-md)', 
              color: 'var(--text-main)', 
              margin: '0.2rem 0' 
            }}>
              Why Does It Matter?
            </h2>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
              Scientific interpretation, corroboration standards & boundary constraints
            </div>
          </div>

          {/* Primary Lead Narrative */}
          <div style={{ 
            background: 'var(--surface-sunken)', 
            border: '1px solid var(--border-subtle)', 
            borderRadius: 'var(--radius-md)', 
            padding: '0.85rem 1rem',
            display: 'flex',
            gap: '0.75rem',
            alignItems: 'flex-start'
          }}>
            <Info size={18} style={{ color: 'var(--status-nominal)', flexShrink: 0, marginTop: '0.15rem' }} />
            <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-body)', lineHeight: '1.55' }}>
              {data.why_it_matters_summary}
            </div>
          </div>

          {/* Structured Analytical Principles */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
            <div style={{ 
              background: 'var(--surface-sunken)', 
              border: '1px solid var(--border-default)', 
              borderRadius: 'var(--radius-md)', 
              padding: '0.75rem 0.9rem',
              display: 'flex',
              gap: '0.6rem',
              alignItems: 'flex-start'
            }}>
              <CheckCircle2 size={16} style={{ color: 'var(--status-nominal)', flexShrink: 0, marginTop: '0.1rem' }} />
              <div>
                <div style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--text-main)', marginBottom: '0.15rem' }}>
                  Multi-Modality Corroboration
                </div>
                <div style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-muted)', lineHeight: '1.4' }}>
                  Signals that independently coincide across spatial, frequency, and compression layers significantly reduce false-positive rates.
                </div>
              </div>
            </div>

            <div style={{ 
              background: 'var(--surface-sunken)', 
              border: '1px solid var(--border-default)', 
              borderRadius: 'var(--radius-md)', 
              padding: '0.75rem 0.9rem',
              display: 'flex',
              gap: '0.6rem',
              alignItems: 'flex-start'
            }}>
              <AlertTriangle size={16} style={{ color: 'var(--status-warning)', flexShrink: 0, marginTop: '0.1rem' }} />
              <div>
                <div style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--text-main)', marginBottom: '0.15rem' }}>
                  Single-Modality Restraint
                </div>
                <div style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-muted)', lineHeight: '1.4' }}>
                  Isolated artifacts (such as high ELA variance or grid boundary shifts) frequently stem from benign recompression, social media transmission, or natural textures.
                </div>
              </div>
            </div>

            <div style={{ 
              background: 'var(--surface-sunken)', 
              border: '1px solid var(--border-default)', 
              borderRadius: 'var(--radius-md)', 
              padding: '0.75rem 0.9rem',
              display: 'flex',
              gap: '0.6rem',
              alignItems: 'flex-start'
            }}>
              <Layers size={16} style={{ color: 'var(--status-info)', flexShrink: 0, marginTop: '0.1rem' }} />
              <div>
                <div style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--text-main)', marginBottom: '0.15rem' }}>
                  Bounded Mathematical Hypotheses
                </div>
                <div style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-muted)', lineHeight: '1.4' }}>
                  Analytical engines generate reproducible numerical bounds, guiding the investigator toward verifiable facts rather than intuitive speculation.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Forensic Completeness Audit */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Layers size={18} style={{ color: 'var(--primary-color)' }} />
              <h3 style={{ margin: 0, fontSize: 'var(--text-md)', color: 'var(--text-main)', fontFamily: 'var(--font-display)' }}>
                Forensic Completeness Audit
              </h3>
            </div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
              Evaluation of applicable forensic modalities executed across the case evidence corpus
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ 
              fontSize: '1.6rem', 
              fontWeight: 800, 
              fontFamily: 'var(--font-mono)',
              color: data.overall_completeness_percentage >= 80 ? 'var(--status-nominal)' : 'var(--status-warning)' 
            }}>
              {data.overall_completeness_percentage}%
            </div>
            <div style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Case Modality Coverage
            </div>
          </div>
        </div>

        {/* Progress bar */}
        <div style={{ 
          width: '100%', 
          height: '8px', 
          background: 'var(--surface-sunken)', 
          borderRadius: 'var(--radius-full)', 
          overflow: 'hidden', 
          marginBottom: '1.25rem',
          border: '1px solid var(--border-subtle)'
        }}>
          <div style={{ 
            width: `${data.overall_completeness_percentage}%`, 
            height: '100%', 
            background: 'linear-gradient(90deg, var(--status-info), var(--status-nominal))', 
            transition: 'width 0.4s ease' 
          }} />
        </div>

        {/* Modalities Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '0.75rem' }}>
          {data.forensic_completeness.map(m => (
            <div 
              key={m.modality} 
              style={{ 
                background: 'var(--surface-sunken)', 
                border: '1px solid var(--border-default)', 
                borderRadius: 'var(--radius-md)', 
                padding: '0.75rem 0.85rem' 
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-main)', letterSpacing: '0.03em' }}>
                  {m.modality}
                </span>
                <span style={{ 
                  fontSize: 'var(--text-xs)', 
                  fontWeight: 700, 
                  fontFamily: 'var(--font-mono)',
                  color: m.percentage === 100 ? 'var(--status-nominal)' : 'var(--status-warning)' 
                }}>
                  {m.percentage}%
                </span>
              </div>
              <div style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-muted)' }}>
                {m.completed} / {m.total_applicable} Completed {m.pending > 0 && `(${m.pending} pending)`}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Recommended Investigative Next Steps */}
      <div className="card">
        <div style={{ marginBottom: '1.15rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <ArrowRight size={18} style={{ color: 'var(--primary-color)' }} />
            <h3 style={{ margin: 0, fontSize: 'var(--text-md)', color: 'var(--text-main)', fontFamily: 'var(--font-display)' }}>
              Recommended Investigative Next Steps
            </h3>
          </div>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
            Prioritized, actionable technical guidance based on current evidence state
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {data.investigative_next_steps.map((step, idx) => {
            const isHigh = step.priority === 'HIGH';
            const isMed = step.priority === 'MEDIUM';
            const priorityColor = isHigh 
              ? 'var(--status-anomalous)' 
              : isMed 
                ? 'var(--status-warning)' 
                : 'var(--status-info)';
            const priorityBg = isHigh 
              ? 'var(--status-anomalous-bg)' 
              : isMed 
                ? 'var(--status-warning-bg)' 
                : 'var(--status-info-bg)';
            const priorityBorder = isHigh 
              ? 'var(--status-anomalous-border)' 
              : isMed 
                ? 'var(--status-warning-border)' 
                : 'var(--status-info-border)';

            return (
              <div 
                key={idx} 
                style={{ 
                  background: 'var(--surface-sunken)', 
                  border: '1px solid var(--border-default)', 
                  borderLeft: `4px solid ${priorityColor}`,
                  borderRadius: 'var(--radius-md)', 
                  padding: '0.85rem 1rem',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  gap: '1rem',
                  flexWrap: 'wrap'
                }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
                    <span 
                      style={{ 
                        fontSize: 'var(--text-2xs)', 
                        fontWeight: 800, 
                        background: priorityBg, 
                        color: priorityColor, 
                        border: `1px solid ${priorityBorder}`,
                        padding: '0.15rem 0.45rem', 
                        borderRadius: 'var(--radius-xs)',
                        letterSpacing: '0.04em'
                      }}
                    >
                      {step.priority} PRIORITY
                    </span>
                    <span style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--text-main)' }}>
                      {step.action}
                    </span>
                  </div>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: '0.25rem', lineHeight: '1.45' }}>
                    <strong style={{ color: 'var(--text-body)' }}>Rationale:</strong> {step.rationale}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Counter-Hypotheses & Benign Explanations */}
      <div className="card">
        <div style={{ marginBottom: '1.15rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <HelpCircle size={18} style={{ color: 'var(--primary-color)' }} />
            <h3 style={{ margin: 0, fontSize: 'var(--text-md)', color: 'var(--text-main)', fontFamily: 'var(--font-display)' }}>
              Counter-Hypotheses & Alternative Benign Explanations
            </h3>
          </div>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
            Scientific explanations for observed anomalies that do not imply malicious tampering or fabrication
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
          {data.counter_hypotheses.map((hypo, idx) => {
            const isExpanded = expandedHypothesis === idx;
            return (
              <div 
                key={idx} 
                style={{ 
                  background: 'var(--surface-sunken)', 
                  border: '1px solid var(--border-default)', 
                  borderRadius: 'var(--radius-md)', 
                  overflow: 'hidden' 
                }}
              >
                <div 
                  onClick={() => setExpandedHypothesis(isExpanded ? null : idx)}
                  style={{ 
                    padding: '0.8rem 1rem', 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center', 
                    cursor: 'pointer',
                    userSelect: 'none',
                    background: isExpanded ? 'var(--surface-color-light)' : 'transparent'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <HelpCircle size={15} style={{ color: 'var(--status-warning)', flexShrink: 0 }} />
                    <span style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--text-main)' }}>
                      Phenomenon: {hypo.phenomenon}
                    </span>
                  </div>
                  <span style={{ 
                    fontSize: 'var(--text-xs)', 
                    color: 'var(--text-muted)', 
                    display: 'inline-flex', 
                    alignItems: 'center', 
                    gap: '0.3rem' 
                  }}>
                    {isExpanded ? (
                      <>Collapse <ChevronUp size={14} /></>
                    ) : (
                      <>View Explanation <ChevronDown size={14} /></>
                    )}
                  </span>
                </div>

                {isExpanded && (
                  <div style={{ 
                    padding: '0.9rem 1rem', 
                    borderTop: '1px solid var(--border-subtle)', 
                    background: 'var(--surface-base)', 
                    fontSize: 'var(--text-xs)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.55rem'
                  }}>
                    <div style={{ color: 'var(--text-body)', lineHeight: '1.5' }}>
                      <strong style={{ color: 'var(--text-main)' }}>Alternative Benign Explanation:</strong> {hypo.alternative_benign_explanation}
                    </div>
                    <div style={{ 
                      color: 'var(--status-nominal)', 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: '0.4rem',
                      fontStyle: 'italic',
                      lineHeight: '1.45'
                    }}>
                      <Compass size={14} style={{ flexShrink: 0 }} />
                      <span><strong style={{ fontStyle: 'normal' }}>Investigative Testing Method:</strong> {hypo.testing_recommendation}</span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default InvestigationAssistant;
