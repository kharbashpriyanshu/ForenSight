import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { fetchApi } from '../api';

const CATEGORIES = [
  { label: 'All Events', value: '' },
  { label: 'Evidence', value: 'EVIDENCE' },
  { label: 'Analysis', value: 'ANALYSIS' },
  { label: 'Findings', value: 'FINDING' },
  { label: 'Case Ops', value: 'CASE' },
  { label: 'Reports', value: 'REPORT' },
];

export default function AuditTimeline() {
  const { caseId } = useParams<{ caseId: string }>();
  const [events, setEvents] = useState<any[]>([]);
  const [activeCategory, setActiveCategory] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchEvents = (category: string) => {
    if (!caseId) return;
    setLoading(true);
    const url = category ? `/cases/${caseId}/audit?category=${category}` : `/cases/${caseId}/audit`;
    
    fetchApi(url)
      .then(res => res.json())
      .then(data => {
        setEvents(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setError(true);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchEvents(activeCategory);
  }, [caseId, activeCategory]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1rem' }}>
          <div>
            <h2 className="card-title" style={{ margin: 0 }}>Investigation Chain of Custody & Audit Trail</h2>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '0.25rem' }}>
              Cryptographically verified, immutable chronological log of actions, analyses, and findings
            </div>
          </div>
          <span className="badge" style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#10b981' }}>
            NIST SP 800-86 Compliant
          </span>
        </div>

        {/* Category Filters */}
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {CATEGORIES.map(cat => (
            <button
              key={cat.value}
              onClick={() => setActiveCategory(cat.value)}
              className={activeCategory === cat.value ? 'primary-button' : 'secondary-button'}
              style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>Loading audit events...</div>
      ) : error ? (
        <div className="error-banner">Error loading investigation audit trail</div>
      ) : events.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2.5rem' }}>
          No audit events recorded for category: <strong>{activeCategory || 'ALL'}</strong>
        </div>
      ) : (
        <div className="card">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {events.map((evt, idx) => {
              const isEvidence = evt.event_type.startsWith('EVIDENCE');
              const isAnalysis = evt.event_type.startsWith('ANALYSIS') || evt.event_type.startsWith('JOB');
              const isFinding = evt.event_type.startsWith('FINDING');
              const isReport = evt.event_type.startsWith('REPORT');

              const accentColor = isEvidence ? '#10b981' : isAnalysis ? '#3b82f6' : isFinding ? '#8b5cf6' : isReport ? '#f59e0b' : 'var(--primary-color)';

              return (
                <div key={idx} style={{ 
                  display: 'flex', 
                  gap: '1.25rem', 
                  borderLeft: `3px solid ${accentColor}`,
                  paddingLeft: '1.25rem',
                  position: 'relative'
                }}>
                  <div style={{
                    position: 'absolute',
                    left: '-6px',
                    top: '6px',
                    width: '9px',
                    height: '9px',
                    borderRadius: '50%',
                    background: accentColor
                  }} />

                  <div style={{ flex: '0 0 170px', color: 'var(--text-muted)', fontSize: '0.8rem', lineHeight: '1.4' }}>
                    <div>{new Date(evt.timestamp).toLocaleDateString()}</div>
                    <div style={{ fontFamily: 'monospace' }}>{new Date(evt.timestamp).toLocaleTimeString()}</div>
                    {evt.actor && (
                      <div style={{ marginTop: '0.25rem', color: 'var(--text-main)', fontWeight: 600 }}>
                        Actor: {evt.actor}
                      </div>
                    )}
                  </div>

                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                      <span style={{ 
                        fontWeight: 700, 
                        fontSize: '0.9rem', 
                        color: accentColor 
                      }}>
                        {evt.event_type.replace(/_/g, ' ')}
                      </span>
                      {evt.evidence_id && (
                        <span className="badge" style={{ fontSize: '0.7rem' }}>Evidence #{evt.evidence_id}</span>
                      )}
                    </div>

                    {evt.safe_metadata && (
                      <pre style={{ 
                        background: 'var(--surface-color-light)', 
                        padding: '0.5rem 0.75rem', 
                        borderRadius: '0.25rem',
                        fontSize: '0.75rem',
                        marginTop: '0.35rem',
                        border: '1px solid var(--border-color)',
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-all'
                      }}>
                        {evt.safe_metadata}
                      </pre>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
