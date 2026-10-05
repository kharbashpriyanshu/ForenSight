import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { fetchApi } from '../api';
import AuthenticatedImage from '../components/evidence/AuthenticatedImage';

interface EvidenceSummary {
  id: number;
  evidence_identifier: string;
  filename: string;
  sha256: string;
  width: number;
  height: number;
  created_at: string | null;
}

interface LineageRelation {
  id: number;
  relation_kind: string;
  review_status: string;
  parent_evidence_id: number | null;
  reviewer: string | null;
  review_note: string | null;
  matching_details: Record<string, any>;
  evidence_a: EvidenceSummary;
  evidence_b: EvidenceSummary;
}

export default function ImageLineagePage() {
  const { caseId } = useParams<{ caseId: string }>();
  const [relations, setRelations] = useState<LineageRelation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [notes, setNotes] = useState<Record<number, string>>({});

  const loadRelations = useCallback(async () => {
    if (!caseId) return;
    setError('');
    try {
      const response = await fetchApi(`/cases/${caseId}/lineage`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Could not load image version links.');
      setRelations(data.relations || []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load image version links.');
    } finally {
      setLoading(false);
    }
  }, [caseId]);

  useEffect(() => { void loadRelations(); }, [loadRelations]);

  const refreshCandidates = async () => {
    if (!caseId) return;
    setRefreshing(true);
    setError('');
    setNotice('Comparing preserved images for exact copies and visual correspondence…');
    try {
      const response = await fetchApi(`/cases/${caseId}/lineage/refresh`, { method: 'POST' }, 180000);
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Could not compare evidence versions.');
      setRelations(data.relations || []);
      setNotice(`${data.pairs_evaluated} image pairs compared. ${data.candidate_pair_count} candidate links need analyst review.`);
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : 'Could not compare evidence versions.');
      setNotice('');
    } finally {
      setRefreshing(false);
    }
  };

  const review = async (relation: LineageRelation, reviewStatus: string, parentEvidenceId?: number) => {
    if (!caseId) return;
    setError('');
    try {
      const response = await fetchApi(`/cases/${caseId}/lineage/${relation.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          review_status: reviewStatus,
          parent_evidence_id: parentEvidenceId ?? null,
          review_note: notes[relation.id]?.trim() || null,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Could not save the analyst decision.');
      setRelations(data.relations || []);
      setNotice('Analyst decision recorded in the case audit trail.');
    } catch (reviewError) {
      setError(reviewError instanceof Error ? reviewError.message : 'Could not save the analyst decision.');
    }
  };

  const evidenceCard = (item: EvidenceSummary) => (
    <div key={item.id} style={{ minWidth: 0, border: '1px solid var(--border-color)', borderRadius: '7px', padding: '0.7rem' }}>
      <AuthenticatedImage src={`/api/evidence/${item.id}/raw`} alt={item.filename} style={{ display: 'block', width: '100%', maxHeight: '260px', objectFit: 'contain', background: '#111827', borderRadius: '4px' }} />
      <div style={{ marginTop: '0.6rem', fontWeight: 700, overflowWrap: 'anywhere' }}>{item.filename}</div>
      <div style={{ color: 'var(--text-muted)', fontSize: '0.72rem', marginTop: '0.2rem' }}>{item.evidence_identifier} · {item.width} × {item.height}</div>
      <code style={{ display: 'block', fontSize: '0.65rem', overflowWrap: 'anywhere', marginTop: '0.3rem' }}>SHA-256 {item.sha256}</code>
      {item.created_at && <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem', marginTop: '0.2rem' }}>Received {new Date(item.created_at).toLocaleString()}</div>}
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxWidth: '1180px', margin: '0 auto' }}>
      <header className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <span style={{ color: '#2563eb', fontSize: '0.72rem', fontWeight: 800, letterSpacing: '0.06em' }}>IMAGE VERSION REVIEW</span>
          <h1 style={{ margin: '0.25rem 0', fontSize: '1.6rem' }}>Related image versions</h1>
          <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.85rem', maxWidth: '720px' }}>
            Find exact file copies and visual matches across the case. A visual match does not prove which version came first or whether the image is authentic.
          </p>
        </div>
        <button className="primary-button" onClick={refreshCandidates} disabled={refreshing}>
          {refreshing ? 'Comparing images…' : 'Find related versions'}
        </button>
      </header>

      {error && <div className="error-banner" role="alert">{error}</div>}
      {notice && <div role="status" style={{ padding: '0.75rem 1rem', borderRadius: '6px', background: 'rgba(37, 99, 235, 0.08)', color: 'var(--text-main)', fontSize: '0.85rem' }}>{notice}</div>}

      <div className="card" style={{ padding: '0.85rem 1rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
        Candidate rules are transparent but not calibrated forensic error rates. Similarity can be missed after heavy crops or falsely suggested by repeated textures. Review each link and choose a parent only when the case record supports that direction.
      </div>

      {loading ? <div className="card">Loading image links…</div> : relations.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '2rem' }}>
          <h2 style={{ marginTop: 0 }}>No candidate links yet</h2>
          <p style={{ color: 'var(--text-muted)' }}>Add two or more received image versions, then run a comparison. Existing source files are preserved unchanged.</p>
        </div>
      ) : relations.map(relation => {
        const metrics = relation.matching_details || {};
        const methods = Array.isArray(metrics.methods) ? metrics.methods.join(' + ') : 'Visual similarity';
        return (
          <article className="card" key={relation.id}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.8rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
              <div>
                <strong>{relation.relation_kind.replaceAll('_', ' ')}</strong>
                <span style={{ marginLeft: '0.55rem', color: 'var(--text-muted)', fontSize: '0.75rem' }}>· {methods}</span>
              </div>
              <span className="status-badge">{relation.review_status.replaceAll('_', ' ')}</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '0.75rem' }}>
              {evidenceCard(relation.evidence_a)}
              {evidenceCard(relation.evidence_b)}
            </div>
            <div style={{ background: 'var(--surface-color-light)', borderRadius: '5px', padding: '0.65rem', marginTop: '0.75rem', fontSize: '0.74rem' }}>
              <strong>Why linked:</strong> {metrics.sha256_equal ? 'The SHA-256 hashes match exactly; the file bytes are identical.' : `DHash distance ${metrics.dhash_hamming_distance_64 ?? '—'}/64; ${metrics.keypoint_matches ?? 0} keypoint matches, ${metrics.ransac_inliers ?? 0} geometrically consistent.`}
              {Array.isArray(metrics.limitations) && metrics.limitations.map((limitation: string) => <div key={limitation} style={{ color: 'var(--text-muted)', marginTop: '0.2rem' }}>{limitation}</div>)}
            </div>
            {relation.review_status !== 'CANDIDATE' && (
              <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: '0.55rem' }}>
                Reviewed by {relation.reviewer || 'analyst'}{relation.parent_evidence_id ? ` · Parent: ${relation.parent_evidence_id === relation.evidence_a.id ? relation.evidence_a.filename : relation.evidence_b.filename}` : ''}{relation.review_note ? ` · ${relation.review_note}` : ''}
              </div>
            )}
            <textarea
              placeholder="Review note (optional)"
              value={notes[relation.id] ?? relation.review_note ?? ''}
              onChange={event => setNotes(current => ({ ...current, [relation.id]: event.target.value }))}
              rows={2}
              style={{ width: '100%', marginTop: '0.75rem', resize: 'vertical' }}
            />
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.55rem' }}>
              <button className="secondary-button" onClick={() => void review(relation, 'CONFIRMED_RELATION', relation.evidence_a.id)}>Confirm A is parent</button>
              <button className="secondary-button" onClick={() => void review(relation, 'CONFIRMED_RELATION', relation.evidence_b.id)}>Confirm B is parent</button>
              {relation.relation_kind === 'EXACT_BITSTREAM' && <button className="secondary-button" onClick={() => void review(relation, 'CONFIRMED_RELATION')}>Confirm exact copy</button>}
              <button className="secondary-button" onClick={() => void review(relation, 'INCONCLUSIVE')}>Direction unclear</button>
              <button className="secondary-button" onClick={() => void review(relation, 'REJECTED')}>Reject link</button>
            </div>
          </article>
        );
      })}
    </div>
  );
}
