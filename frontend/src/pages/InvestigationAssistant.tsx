import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
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

const InvestigationAssistant: React.FC = () => {
  const { caseId } = useParams<{ caseId: string }>();
  const navigate = useNavigate();

  const [data, setData] = useState<AssistantResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedHypothesis, setExpandedHypothesis] = useState<number | null>(0);

  const fetchAssistant = () => {
    setLoading(true);
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

  if (loading) return <div style={{ padding: '2rem', color: 'var(--text-muted)' }}>Synthesizing investigative decision support...</div>;
  if (error) return <div className="error-banner">{error}</div>;
  if (!data) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Top Banner: Scientific Principles */}
      <div className="card" style={{ borderLeft: '4px solid #3b82f6', background: 'linear-gradient(180deg, rgba(59, 130, 246, 0.05) 0%, rgba(59, 130, 246, 0.0) 100%)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
              <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#3b82f6', background: 'rgba(59, 130, 246, 0.1)', padding: '0.2rem 0.5rem', borderRadius: '4px', textTransform: 'uppercase' }}>
                Forensic Decision Support
              </span>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                Rule Engine V3.0
              </span>
            </div>
            <h1 style={{ fontSize: '1.5rem', margin: '0.25rem 0' }}>Investigation Assistant</h1>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: 0, maxWidth: '800px' }}>
              Empowering investigators to organize, correlate, and document evidence. ForenSight generates observations, measurements, and investigative hypotheses, but <strong>never replaces human forensic judgment</strong>.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button className="secondary-button" onClick={fetchAssistant} style={{ fontSize: '0.8rem', padding: '0.35rem 0.75rem' }}>
              🔄 Refresh Synthesis
            </button>
            <button className="primary-button" onClick={() => navigate(`/cases/${caseId}/analyst`)} style={{ fontSize: '0.8rem', padding: '0.35rem 0.75rem' }}>
              ✍️ Analyst Review ({data.pending_analyst_reviews_count})
            </button>
          </div>
        </div>

        {/* Non-negotiable scientific guardrail badge */}
        <div style={{ marginTop: '1rem', padding: '0.5rem 0.75rem', background: 'var(--surface-color-light)', border: '1px dashed var(--border-color)', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
          <div>⚖️ <strong>Observation != Proof</strong></div>
          <div>🔍 <strong>Anomaly != Manipulation</strong></div>
          <div>🚫 <strong>Absence of Evidence != Evidence of Absence</strong></div>
          <div>🤖 <strong>Model Output != Forensic Conclusion</strong></div>
        </div>
      </div>

      {/* Review Alert If Any Pending */}
      {data.pending_analyst_reviews_count > 0 && (
        <div style={{ background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.3)', padding: '0.75rem 1rem', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '1.1rem' }}>⚠️</span>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-color)' }}>
              <strong>{data.pending_analyst_reviews_count} correlated findings</strong> are awaiting mandatory human analyst review and sign-off.
            </div>
          </div>
          <button 
            className="secondary-button" 
            style={{ fontSize: '0.75rem', padding: '0.25rem 0.6rem', borderColor: '#f59e0b', color: '#f59e0b' }}
            onClick={() => navigate(`/cases/${caseId}/analyst`)}
          >
            Review Findings Queue &rarr;
          </button>
        </div>
      )}

      {/* Core Synthesis: What Was Found & Why It Matters */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '1.25rem' }}>
        <div className="card" style={{ borderTop: '3px solid #3b82f6' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#3b82f6', textTransform: 'uppercase', marginBottom: '0.5rem' }}>
            WHAT WAS FOUND? (Empirical Measurements)
          </div>
          <div style={{ fontSize: '0.9rem', lineHeight: '1.5', color: 'var(--text-color)' }}>
            {data.what_was_found_summary}
          </div>
        </div>

        <div className="card" style={{ borderTop: '3px solid #10b981' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#10b981', textTransform: 'uppercase', marginBottom: '0.5rem' }}>
            WHY DOES IT MATTER? (Forensic Significance)
          </div>
          <div style={{ fontSize: '0.9rem', lineHeight: '1.5', color: 'var(--text-color)' }}>
            {data.why_it_matters_summary}
          </div>
        </div>
      </div>

      {/* Forensic Completeness Audit */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.1rem' }}>Forensic Completeness Audit</h3>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Evaluation of applicable forensic modalities executed across the case evidence corpus
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: data.overall_completeness_percentage >= 80 ? '#10b981' : '#f59e0b' }}>
              {data.overall_completeness_percentage}%
            </div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Case Modality Coverage</div>
          </div>
        </div>

        {/* Progress bar */}
        <div style={{ width: '100%', height: '8px', background: 'var(--surface-color-light)', borderRadius: '4px', overflow: 'hidden', marginBottom: '1.25rem' }}>
          <div style={{ width: `${data.overall_completeness_percentage}%`, height: '100%', background: 'linear-gradient(90deg, #3b82f6, #10b981)', transition: 'width 0.4s ease' }} />
        </div>

        {/* Modalities Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.75rem' }}>
          {data.forensic_completeness.map(m => (
            <div key={m.modality} style={{ background: 'var(--surface-color-light)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '0.75rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase' }}>{m.modality}</span>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: m.percentage === 100 ? '#10b981' : '#f59e0b' }}>{m.percentage}%</span>
              </div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                {m.completed} / {m.total_applicable} Completed {m.pending > 0 && `(${m.pending} pending)`}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Recommended Investigative Next Steps */}
      <div className="card">
        <div style={{ marginBottom: '1rem' }}>
          <h3 style={{ margin: 0, fontSize: '1.1rem' }}>WHAT SHOULD THE INVESTIGATOR DO NEXT?</h3>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Prioritized, actionable technical guidance based on current evidence state
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {data.investigative_next_steps.map((step, idx) => {
            const priorityColor = step.priority === 'HIGH' ? '#ef4444' : step.priority === 'MEDIUM' ? '#f59e0b' : '#3b82f6';
            return (
              <div 
                key={idx} 
                style={{ 
                  background: 'var(--surface-color-light)', 
                  border: '1px solid var(--border-color)', 
                  borderLeft: `4px solid ${priorityColor}`,
                  borderRadius: '6px', 
                  padding: '0.85rem 1rem',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  gap: '1rem',
                  flexWrap: 'wrap'
                }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                    <span style={{ fontSize: '0.65rem', fontWeight: 800, background: priorityColor, color: 'white', padding: '0.1rem 0.4rem', borderRadius: '3px' }}>
                      {step.priority} PRIORITY
                    </span>
                    <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-color)' }}>
                      {step.action}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                    <strong>Rationale:</strong> {step.rationale}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Counter-Hypotheses & Benign Explanations */}
      <div className="card">
        <div style={{ marginBottom: '1rem' }}>
          <h3 style={{ margin: 0, fontSize: '1.1rem' }}>Counter-Hypotheses & Alternative Benign Explanations</h3>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Scientific explanations for observed anomalies that do not imply malicious tampering or fabrication
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {data.counter_hypotheses.map((hypo, idx) => {
            const isExpanded = expandedHypothesis === idx;
            return (
              <div 
                key={idx} 
                style={{ 
                  background: 'var(--surface-color-light)', 
                  border: '1px solid var(--border-color)', 
                  borderRadius: '6px', 
                  overflow: 'hidden' 
                }}
              >
                <div 
                  onClick={() => setExpandedHypothesis(isExpanded ? null : idx)}
                  style={{ 
                    padding: '0.75rem 1rem', 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center', 
                    cursor: 'pointer',
                    userSelect: 'none'
                  }}
                >
                  <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-color)' }}>
                    ❓ Phenomenon: {hypo.phenomenon}
                  </div>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    {isExpanded ? '▲ Collapse' : '▼ View Explanation'}
                  </span>
                </div>

                {isExpanded && (
                  <div style={{ padding: '0.75rem 1rem', borderTop: '1px solid var(--border-color)', background: 'var(--background-color)', fontSize: '0.8rem' }}>
                    <div style={{ marginBottom: '0.5rem', color: 'var(--text-color)', lineHeight: '1.4' }}>
                      <strong>Alternative Benign Explanation:</strong> {hypo.alternative_benign_explanation}
                    </div>
                    <div style={{ color: '#10b981', fontStyle: 'italic' }}>
                      <strong>Investigative Testing Method:</strong> {hypo.testing_recommendation}
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
