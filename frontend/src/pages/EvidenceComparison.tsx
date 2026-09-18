import React, { useEffect, useState } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { fetchApi } from '../api';
import AuthenticatedImage from '../components/evidence/AuthenticatedImage';

interface EvidenceOption {
  id: number;
  original_filename: string;
  sha256_hash: string;
}

const EvidenceComparison: React.FC = () => {
  const { caseId } = useParams<{ caseId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const paramA = searchParams.get('a');
  const paramB = searchParams.get('b');

  const [evidenceList, setEvidenceList] = useState<EvidenceOption[]>([]);
  const [selectedA, setSelectedA] = useState<string>(paramA || '');
  const [selectedB, setSelectedB] = useState<string>(paramB || '');

  const [comparisonData, setComparisonData] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Wipe Split-View state
  const [wipePosition, setWipePosition] = useState<number>(50);
  const [viewMode, setViewMode] = useState<'side-by-side' | 'wipe' | 'artifacts'>('side-by-side');

  // Fetch available evidence items for dropdown selectors
  useEffect(() => {
    fetchApi(`/cases/${caseId}/evidence`)
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          setEvidenceList(data);
          if (!paramA && data.length >= 1) setSelectedA(String(data[0].id));
          if (!paramB && data.length >= 2) setSelectedB(String(data[1].id));
        }
      })
      .catch(() => {});
  }, [caseId]);

  // Fetch comparison data when selectedA and selectedB are available
  useEffect(() => {
    if (!selectedA || !selectedB || selectedA === selectedB) {
      setComparisonData(null);
      return;
    }

    setLoading(true);
    setError('');

    fetchApi(`/cases/${caseId}/compare?evidence_a_id=${selectedA}&evidence_b_id=${selectedB}`)
      .then(async res => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || 'Failed to compare evidence items');
        setComparisonData(data);
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  }, [caseId, selectedA, selectedB]);

  const handleUpdateSelection = (newA: string, newB: string) => {
    setSelectedA(newA);
    setSelectedB(newB);
    setSearchParams({ a: newA, b: newB });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Top Card */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.2rem' }}>
              <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#3b82f6', background: 'rgba(59, 130, 246, 0.1)', padding: '0.15rem 0.45rem', borderRadius: '4px', textTransform: 'uppercase' }}>
                Forensic Correlation Lab
              </span>
            </div>
            <h2 className="card-title" style={{ margin: 0 }}>Comparative Evidence Analysis (Compare Mode)</h2>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '0.25rem' }}>
              Side-by-side synchronized view, wipe difference slider, and physical compression matrix
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <div style={{ display: 'flex', background: 'var(--surface-color-light)', padding: '0.2rem', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
              <button 
                className={viewMode === 'side-by-side' ? 'primary-button' : 'secondary-button'} 
                style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem' }}
                onClick={() => setViewMode('side-by-side')}
              >
                Side-by-Side
              </button>
              <button 
                className={viewMode === 'wipe' ? 'primary-button' : 'secondary-button'} 
                style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem' }}
                onClick={() => setViewMode('wipe')}
              >
                Wipe Difference Slider
              </button>
              <button 
                className={viewMode === 'artifacts' ? 'primary-button' : 'secondary-button'} 
                style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem' }}
                onClick={() => setViewMode('artifacts')}
              >
                Artifact Maps
              </button>
            </div>

            <button className="secondary-button" onClick={() => navigate(`/cases/${caseId}/evidence`)} style={{ fontSize: '0.8rem', padding: '0.35rem 0.75rem' }}>
              &larr; Evidence Library
            </button>
          </div>
        </div>

        {/* Evidence Selection Controls */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '1rem' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.4rem', color: 'var(--text-muted)' }}>
              EVIDENCE ITEM A (Reference Image)
            </label>
            <select
              value={selectedA}
              onChange={e => handleUpdateSelection(e.target.value, selectedB)}
              style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'var(--surface-color-light)', color: 'var(--text-color)', fontSize: '0.85rem' }}
            >
              <option value="">-- Select Evidence A --</option>
              {evidenceList.map(item => (
                <option key={item.id} value={String(item.id)}>
                  #{item.id}: {item.original_filename}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.4rem', color: 'var(--text-muted)' }}>
              EVIDENCE ITEM B (Comparison Image)
            </label>
            <select
              value={selectedB}
              onChange={e => handleUpdateSelection(selectedA, e.target.value)}
              style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'var(--surface-color-light)', color: 'var(--text-color)', fontSize: '0.85rem' }}
            >
              <option value="">-- Select Evidence B --</option>
              {evidenceList.map(item => (
                <option key={item.id} value={String(item.id)}>
                  #{item.id}: {item.original_filename}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {loading && <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>Executing comparative correlation analysis...</div>}
      {error && <div className="error-banner">{error}</div>}

      {comparisonData && !loading && (
        <>
          {/* Scientific Disclaimer */}
          <div style={{ background: 'rgba(59, 130, 246, 0.08)', borderLeft: '4px solid var(--primary-color)', padding: '0.75rem 1rem', borderRadius: '4px', fontSize: '0.8rem', color: 'var(--text-main)' }}>
            <strong>Comparative Guardrail:</strong> {comparisonData.disclaimer || 'Comparison reflects physical and compression differences. It does not output an automated manipulation verdict.'}
          </div>

          {/* VIEW MODE 1: Side-by-Side View */}
          {viewMode === 'side-by-side' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
              {/* Evidence A */}
              <div className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                  <h3 style={{ margin: 0, fontSize: '1rem', color: 'var(--primary-color)' }}>
                    Evidence A: {comparisonData.evidence_a?.original_filename}
                  </h3>
                  <span className="badge">ID #{comparisonData.evidence_a?.id}</span>
                </div>
                <div style={{ border: '1px solid var(--border-color)', borderRadius: '4px', height: '280px', background: '#0a0a0c', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', marginBottom: '0.75rem' }}>
                  <AuthenticatedImage 
                    src={`/api/evidence/${comparisonData.evidence_a?.id}/raw`} 
                    alt="Evidence A" 
                    style={{ maxHeight: '280px', maxWidth: '100%', objectFit: 'contain' }}
                  />
                </div>
                <div style={{ fontSize: '0.8rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <div><strong>Dimensions:</strong> {comparisonData.evidence_a?.width} × {comparisonData.evidence_a?.height} px</div>
                  <div><strong>Format:</strong> {comparisonData.evidence_a?.mime_type}</div>
                  <div style={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>
                    SHA-256: {comparisonData.evidence_a?.sha256_hash}
                  </div>
                </div>
              </div>

              {/* Evidence B */}
              <div className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                  <h3 style={{ margin: 0, fontSize: '1rem', color: '#10b981' }}>
                    Evidence B: {comparisonData.evidence_b?.original_filename}
                  </h3>
                  <span className="badge">ID #{comparisonData.evidence_b?.id}</span>
                </div>
                <div style={{ border: '1px solid var(--border-color)', borderRadius: '4px', height: '280px', background: '#0a0a0c', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', marginBottom: '0.75rem' }}>
                  <AuthenticatedImage 
                    src={`/api/evidence/${comparisonData.evidence_b?.id}/raw`} 
                    alt="Evidence B" 
                    style={{ maxHeight: '280px', maxWidth: '100%', objectFit: 'contain' }}
                  />
                </div>
                <div style={{ fontSize: '0.8rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <div><strong>Dimensions:</strong> {comparisonData.evidence_b?.width} × {comparisonData.evidence_b?.height} px</div>
                  <div><strong>Format:</strong> {comparisonData.evidence_b?.mime_type}</div>
                  <div style={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>
                    SHA-256: {comparisonData.evidence_b?.sha256_hash}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* VIEW MODE 2: Wipe Difference Slider */}
          {viewMode === 'wipe' && (
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <h3 style={{ margin: 0, fontSize: '1.05rem' }}>Wipe Difference Inspection (Wipe Split-View)</h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem' }}>
                  <label>Wipe Split: <strong>{wipePosition}%</strong></label>
                  <input 
                    type="range" 
                    min="0" 
                    max="100" 
                    value={wipePosition} 
                    onChange={e => setWipePosition(Number(e.target.value))}
                    style={{ width: '150px', cursor: 'pointer' }}
                  />
                </div>
              </div>

              <div style={{ position: 'relative', width: '100%', maxWidth: '800px', height: '420px', margin: '0 auto', background: '#000', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--border-color)' }}>
                {/* Background Image: Evidence B */}
                <AuthenticatedImage
                  src={`/api/evidence/${comparisonData.evidence_b?.id}/raw`}
                  alt="Evidence B"
                  style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'contain' }}
                />

                {/* Foreground Image: Evidence A with clip-path wipe */}
                <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', clipPath: `polygon(0 0, ${wipePosition}% 0, ${wipePosition}% 100%, 0 100%)` }}>
                  <AuthenticatedImage
                    src={`/api/evidence/${comparisonData.evidence_a?.id}/raw`}
                    alt="Evidence A"
                    style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                  />
                </div>

                {/* Divider Line */}
                <div style={{ position: 'absolute', top: 0, bottom: 0, left: `${wipePosition}%`, width: '2px', background: '#ffffff', boxShadow: '0 0 8px rgba(0,0,0,0.8)' }} />
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', maxWidth: '800px', margin: '0.5rem auto 0', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                <span>&larr; Evidence A: {comparisonData.evidence_a?.original_filename}</span>
                <span>Evidence B: {comparisonData.evidence_b?.original_filename} &rarr;</span>
              </div>
            </div>
          )}

          {/* VIEW MODE 3: Artifact Maps Comparison */}
          {viewMode === 'artifacts' && (
            <div className="card">
              <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.05rem' }}>Forensic Artifact Maps (A vs B)</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                <div>
                  <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.9rem', color: 'var(--primary-color)' }}>
                    Item A Artifacts
                  </h4>
                  {Object.keys(comparisonData.evidence_a?.artifacts || {}).length === 0 ? (
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>No generated visual artifacts for Item A.</div>
                  ) : (
                    Object.entries(comparisonData.evidence_a.artifacts).map(([k, uri]: [string, any]) => (
                      <div key={k} style={{ marginBottom: '1rem' }}>
                        <div style={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', marginBottom: '0.25rem' }}>{k}</div>
                        <AuthenticatedImage src={uri} alt={k} style={{ maxWidth: '100%', maxHeight: '200px', objectFit: 'contain', border: '1px solid var(--border-color)', borderRadius: '4px' }} />
                      </div>
                    ))
                  )}
                </div>

                <div>
                  <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.9rem', color: '#10b981' }}>
                    Item B Artifacts
                  </h4>
                  {Object.keys(comparisonData.evidence_b?.artifacts || {}).length === 0 ? (
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>No generated visual artifacts for Item B.</div>
                  ) : (
                    Object.entries(comparisonData.evidence_b.artifacts).map(([k, uri]: [string, any]) => (
                      <div key={k} style={{ marginBottom: '1rem' }}>
                        <div style={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', marginBottom: '0.25rem' }}>{k}</div>
                        <AuthenticatedImage src={uri} alt={k} style={{ maxWidth: '100%', maxHeight: '200px', objectFit: 'contain', border: '1px solid var(--border-color)', borderRadius: '4px' }} />
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Comparative Matrix Table */}
          <div className="card">
            <h3 className="card-title">Physical & Compression Property Matrix</h3>
            <table className="evidence-table" style={{ width: '100%', fontSize: '0.8rem' }}>
              <thead>
                <tr>
                  <th style={{ padding: '0.5rem' }}>Property</th>
                  <th style={{ padding: '0.5rem' }}>Evidence A ({comparisonData.evidence_a?.original_filename})</th>
                  <th style={{ padding: '0.5rem' }}>Evidence B ({comparisonData.evidence_b?.original_filename})</th>
                  <th style={{ padding: '0.5rem' }}>Variance Status</th>
                </tr>
              </thead>
              <tbody>
                <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                  <td style={{ padding: '0.6rem 0.5rem' }}><strong>SHA-256 Hash</strong></td>
                  <td style={{ padding: '0.6rem 0.5rem', fontFamily: 'monospace', fontSize: '0.75rem' }}>{comparisonData.evidence_a?.sha256_hash}</td>
                  <td style={{ padding: '0.6rem 0.5rem', fontFamily: 'monospace', fontSize: '0.75rem' }}>{comparisonData.evidence_b?.sha256_hash}</td>
                  <td style={{ padding: '0.6rem 0.5rem' }}>
                    {comparisonData.differences?.hash_identical ? (
                      <span className="badge" style={{ background: '#10b981', color: 'white' }}>IDENTICAL</span>
                    ) : (
                      <span className="badge" style={{ background: '#ef4444', color: 'white' }}>DISTINCT</span>
                    )}
                  </td>
                </tr>

                <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                  <td style={{ padding: '0.6rem 0.5rem' }}><strong>Dimensions (Resolution)</strong></td>
                  <td style={{ padding: '0.6rem 0.5rem' }}>{comparisonData.evidence_a?.width} × {comparisonData.evidence_a?.height} px</td>
                  <td style={{ padding: '0.6rem 0.5rem' }}>{comparisonData.evidence_b?.width} × {comparisonData.evidence_b?.height} px</td>
                  <td style={{ padding: '0.6rem 0.5rem' }}>
                    {comparisonData.differences?.dimensions_identical ? (
                      <span className="badge" style={{ background: '#10b981', color: 'white' }}>MATCH</span>
                    ) : (
                      <span className="badge" style={{ background: '#f59e0b', color: 'white' }}>VARIANCE</span>
                    )}
                  </td>
                </tr>

                <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                  <td style={{ padding: '0.6rem 0.5rem' }}><strong>MIME Type</strong></td>
                  <td style={{ padding: '0.6rem 0.5rem' }}>{comparisonData.evidence_a?.mime_type}</td>
                  <td style={{ padding: '0.6rem 0.5rem' }}>{comparisonData.evidence_b?.mime_type}</td>
                  <td style={{ padding: '0.6rem 0.5rem' }}>
                    {comparisonData.differences?.mime_identical ? (
                      <span className="badge" style={{ background: '#10b981', color: 'white' }}>MATCH</span>
                    ) : (
                      <span className="badge" style={{ background: '#f59e0b', color: 'white' }}>VARIANCE</span>
                    )}
                  </td>
                </tr>

                <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                  <td style={{ padding: '0.6rem 0.5rem' }}><strong>File Size</strong></td>
                  <td style={{ padding: '0.6rem 0.5rem' }}>{((comparisonData.evidence_a?.file_size || 0) / 1024).toFixed(1)} KB</td>
                  <td style={{ padding: '0.6rem 0.5rem' }}>{((comparisonData.evidence_b?.file_size || 0) / 1024).toFixed(1)} KB</td>
                  <td style={{ padding: '0.6rem 0.5rem' }}>
                    Delta: {((comparisonData.differences?.size_diff_bytes || 0) / 1024).toFixed(1)} KB
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
};

export default EvidenceComparison;
