import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { fetchApi } from '../api';

interface ProcessingSignal {
  analysis_id: number;
  analysis_identifier: string;
  engine_id: string;
  operation_class: string;
  indicator_state: string;
  summary: string;
  completed_at: string | null;
  observations: Array<{ metric_name: string; raw_value: string; direction: string; interpretation: string; limitations: string }>;
  engine_limitations: string[];
}

interface ProcessingHistory {
  evidence_identifier: string;
  source_sha256: string;
  signals: ProcessingSignal[];
  candidate_sequences: Array<{ label: string; steps: string[]; ordering_status: string }>;
  sequence_ranking: string;
  limitations: string[];
  disclaimer: string;
}

export default function ProcessingHistoryPage() {
  const { caseId, evidenceId } = useParams<{ caseId: string; evidenceId: string }>();
  const [history, setHistory] = useState<ProcessingHistory | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!evidenceId) return;
    setLoading(true);
    setError('');
    try {
      const response = await fetchApi(`/evidence/${evidenceId}/processing-history`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Could not build the processing-history view.');
      setHistory(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not build the processing-history view.');
    } finally {
      setLoading(false);
    }
  }, [evidenceId]);

  useEffect(() => { void load(); }, [load]);

  return (
    <main style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxWidth: 1100, margin: '0 auto' }}>
      <header className="card" style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
        <div>
          <h1 style={{ margin: 0 }}>Processing-history hypotheses</h1>
          <p style={{ color: 'var(--text-muted)', marginBottom: 0 }}>Review recorded compression and resampling signals as possible operation sequences.</p>
        </div>
        <div style={{ display: 'flex', gap: '0.6rem' }}>
          <Link className="secondary-button" to={`/cases/${caseId}/evidence/${evidenceId}`}>Back to evidence</Link>
          <button className="btn btn-primary" onClick={() => void load()} disabled={loading}>{loading ? 'Refreshing…' : 'Refresh signals'}</button>
        </div>
      </header>

      {error && <div role="alert" className="card" style={{ color: '#ef4444' }}>{error}</div>}
      {loading && <div role="status" className="card">Reading completed analysis records…</div>}

      {history && !loading && (
        <>
          <section className="card">
            <h2 style={{ marginTop: 0 }}>Evidence reference</h2>
            <div><strong>{history.evidence_identifier}</strong></div>
            <code style={{ display: 'block', marginTop: '0.5rem', overflowWrap: 'anywhere' }}>SHA-256: {history.source_sha256}</code>
            <p style={{ marginBottom: 0, color: 'var(--text-muted)' }}>{history.disclaimer}</p>
          </section>

          <section className="card">
            <h2 style={{ marginTop: 0 }}>Candidate sequences</h2>
            {history.candidate_sequences.length === 0 ? (
              <p>No elevated compression or resampling indicator is recorded yet. Run applicable analyses to populate this view. Absence of an indicator does not establish that an operation did not occur.</p>
            ) : (
              <ol style={{ display: 'grid', gap: '0.75rem', paddingLeft: '1.4rem' }}>
                {history.candidate_sequences.map((candidate, index) => (
                  <li key={`${candidate.ordering_status}-${index}`}>
                    <strong>{candidate.label}</strong>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '0.2rem' }}>
                      {candidate.steps.join(' → ')} · {candidate.ordering_status.replaceAll('_', ' ').toLowerCase()}
                    </div>
                  </li>
                ))}
              </ol>
            )}
            <p style={{ marginBottom: 0, color: 'var(--text-muted)' }}>Candidates are unranked. The available methods do not determine which sequence actually occurred.</p>
          </section>

          <section>
            <h2>Recorded signals ({history.signals.length})</h2>
            {history.signals.length === 0 ? (
              <div className="card">No completed processing-history analyses are available for this evidence.</div>
            ) : (
              <div style={{ display: 'grid', gap: '0.8rem' }}>
                {history.signals.map((signal) => (
                  <article key={signal.analysis_id} className="card">
                    <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: '0.5rem' }}>
                      <strong>{signal.engine_id.replaceAll('_', ' ')}</strong>
                      <span style={{ fontSize: '0.78rem', color: signal.indicator_state === 'CANDIDATE_INDICATOR' ? '#f59e0b' : 'var(--text-muted)' }}>
                        {signal.indicator_state.replaceAll('_', ' ')}
                      </span>
                    </div>
                    <p>{signal.summary}</p>
                    <div style={{ display: 'grid', gap: '0.5rem' }}>
                      {signal.observations.map((observation, index) => (
                        <div key={`${observation.metric_name}-${index}`} style={{ padding: '0.6rem', background: 'var(--surface-color-light)', borderRadius: 5 }}>
                          <strong>{observation.metric_name}</strong> · {observation.raw_value} · {observation.direction}
                          <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>{observation.interpretation}</div>
                        </div>
                      ))}
                    </div>
                    {signal.engine_limitations.length > 0 && <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Limitations: {signal.engine_limitations.join(' ')}</p>}
                    <small style={{ color: 'var(--text-muted)' }}>Analysis {signal.analysis_identifier}{signal.completed_at ? ` · ${new Date(signal.completed_at).toLocaleString()}` : ''}</small>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="card">
            <h2 style={{ marginTop: 0 }}>Interpretation limits</h2>
            <ul>{history.limitations.map((limitation) => <li key={limitation}>{limitation}</li>)}</ul>
          </section>
        </>
      )}
    </main>
  );
}
