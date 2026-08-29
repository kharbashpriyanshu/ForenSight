import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';

const EvidenceLibrary: React.FC = () => {
  const { caseId } = useParams<{ caseId: string }>();
  const navigate = useNavigate();
  const [evidenceList, setEvidenceList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchEvidence = () => {
    setLoading(true);
    fetch(`http://localhost:8000/api/cases/${caseId}`)
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch case evidence');
        return res.json();
      })
      .then(data => {
        setEvidenceList(data.evidence_items || []);
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchEvidence();
  }, [caseId]);

  if (loading) return <div>Loading evidence library...</div>;
  if (error) return <div className="error-banner">{error}</div>;

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h2 className="card-title" style={{ margin: 0 }}>Evidence Library</h2>
        <button className="primary-button" onClick={() => navigate(`/cases/${caseId}/evidence/new`)}>
          Acquire Evidence
        </button>
      </div>

      {evidenceList.length === 0 ? (
        <div style={{ padding: '3rem', textAlign: 'center', backgroundColor: 'var(--bg-color)', borderRadius: '8px', border: '1px dashed var(--border-color)' }}>
          <div style={{ color: 'var(--text-muted)', marginBottom: '1rem' }}>No evidence has been acquired for this case.</div>
          <button className="secondary-button" onClick={() => navigate(`/cases/${caseId}/evidence/new`)}>
            Upload Evidence
          </button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '1rem' }}>
          {evidenceList.map((ev, i) => (
            <div key={i} style={{ border: '1px solid var(--border-color)', borderRadius: '8px', padding: '1rem', background: 'var(--surface-color-light)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                <strong style={{ fontSize: '1.1rem', color: 'var(--primary-color)' }}>{ev.original_filename}</strong>
                <span className="badge">Verified</span>
              </div>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.5rem', wordBreak: 'break-all' }}>
                SHA-256: {ev.sha256_hash}
              </div>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
                {ev.mime_type?.split('/')[1]?.toUpperCase() || 'UNKNOWN'} • {ev.width}x{ev.height}
              </div>
              <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <button className="secondary-button" onClick={() => navigate(`/cases/${caseId}/evidence/${ev.id}`)}>
                  View Details & Analysis
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default EvidenceLibrary;
