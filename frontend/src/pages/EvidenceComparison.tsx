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
            <h2 className="card-title" style={{ margin: 0 }}>Side-by-Side Evidence Comparison</h2>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '0.25rem' }}>
              Comparative forensic analysis across metadata, cryptographic signatures, and modality observations
            </div>
          </div>
          <button className="secondary-button" onClick={() => navigate(`/cases/${caseId}/evidence`)}>
            &larr; Back to Evidence Library
          </button>
        </div>

        {/* Forensic Standards Note */}
        <div style={{ background: 'rgba(59, 130, 246, 0.08)', borderLeft: '4px solid var(--primary-color)', padding: '0.75rem 1rem', borderRadius: '4px', fontSize: '0.85rem', color: 'var(--text-main)' }}>
          <strong>Forensic Integrity Notice:</strong> Comparisons represent direct factual cross-referencing. ForenSight does not invent synthetic or probabilistic manipulation scores. All assessments are grounded in verified observations and NIST/SWGDE technical guidelines.
        </div>

        {/* Evidence Selection Controls */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '1.25rem' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.5rem', color: 'var(--text-muted)' }}>
              EVIDENCE ITEM A (Primary / Reference)
            </label>
            <select
              value={selectedA}
              onChange={e => handleUpdateSelection(e.target.value, selectedB)}
              style={{ width: '100%', padding: '0.6rem', background: 'var(--surface-color-light)', border: '1px solid var(--border-color)', borderRadius: '4px', color: 'var(--text-main)' }}
            >
              <option value="">Select Evidence Item A</option>
              {evidenceList.map(ev => (
                <option key={ev.id} value={String(ev.id)} disabled={String(ev.id) === selectedB}>
                  {ev.original_filename} (ID: {ev.id})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.5rem', color: 'var(--text-muted)' }}>
              EVIDENCE ITEM B (Comparison / Target)
            </label>
            <select
              value={selectedB}
              onChange={e => handleUpdateSelection(selectedA, e.target.value)}
              style={{ width: '100%', padding: '0.6rem', background: 'var(--surface-color-light)', border: '1px solid var(--border-color)', borderRadius: '4px', color: 'var(--text-main)' }}
            >
              <option value="">Select Evidence Item B</option>
              {evidenceList.map(ev => (
                <option key={ev.id} value={String(ev.id)} disabled={String(ev.id) === selectedA}>
                  {ev.original_filename} (ID: {ev.id})
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {loading && (
        <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
          Computing side-by-side forensic comparison...
        </div>
      )}

      {error && <div className="error-banner">{error}</div>}

      {selectedA && selectedB && selectedA === selectedB && (
        <div className="card" style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
          Please select two distinct evidence items to perform comparative analysis.
        </div>
      )}

      {comparisonData && (
        <>
          {/* Differences Summary Bar */}
          <div className="card" style={{ borderLeft: '4px solid #f59e0b' }}>
            <h3 style={{ fontSize: '1rem', margin: '0 0 0.5rem 0', color: '#f59e0b' }}>
              Identified Discrepancies & Variances ({comparisonData.differences?.length || 0})
            </h3>
            {comparisonData.differences && comparisonData.differences.length > 0 ? (
              <ul style={{ margin: 0, paddingLeft: '1.25rem', fontSize: '0.9rem', color: 'var(--text-main)' }}>
                {comparisonData.differences.map((diff: string, idx: number) => (
                  <li key={idx} style={{ marginBottom: '0.25rem' }}>{diff}</li>
                ))}
              </ul>
            ) : (
              <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                No significant format or resolution discrepancies detected between items.
              </div>
            )}
          </div>

          {/* Visual Side-by-Side Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
            {/* Item A */}
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h3 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--primary-color)' }}>
                  Item A: {comparisonData.evidence_a?.original_filename}
                </h3>
                <span className="badge">Evidence #{comparisonData.evidence_a?.id}</span>
              </div>
              <div style={{ border: '1px solid var(--border-color)', borderRadius: '4px', height: '240px', background: '#0a0a0c', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', marginBottom: '1rem' }}>
                <AuthenticatedImage 
                  src={`/api/evidence/${comparisonData.evidence_a?.id}/raw`} 
                  alt="Evidence A" 
                  style={{ maxHeight: '240px', maxWidth: '100%', objectFit: 'contain' }}
                />
              </div>
              <div style={{ fontSize: '0.85rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <div><strong>SHA-256:</strong> <code style={{ fontSize: '0.75rem', wordBreak: 'break-all' }}>{comparisonData.evidence_a?.sha256_hash}</code></div>
                <div><strong>Resolution:</strong> {comparisonData.evidence_a?.width} × {comparisonData.evidence_a?.height} px</div>
                <div><strong>MIME:</strong> {comparisonData.evidence_a?.mime_type}</div>
                <div><strong>Size:</strong> {comparisonData.evidence_a?.file_size_bytes ? `${(comparisonData.evidence_a.file_size_bytes / 1024).toFixed(1)} KB` : 'N/A'}</div>
              </div>
            </div>

            {/* Item B */}
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#10b981' }}>
                  Item B: {comparisonData.evidence_b?.original_filename}
                </h3>
                <span className="badge">Evidence #{comparisonData.evidence_b?.id}</span>
              </div>
              <div style={{ border: '1px solid var(--border-color)', borderRadius: '4px', height: '240px', background: '#0a0a0c', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', marginBottom: '1rem' }}>
                <AuthenticatedImage 
                  src={`/api/evidence/${comparisonData.evidence_b?.id}/raw`} 
                  alt="Evidence B" 
                  style={{ maxHeight: '240px', maxWidth: '100%', objectFit: 'contain' }}
                />
              </div>
              <div style={{ fontSize: '0.85rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <div><strong>SHA-256:</strong> <code style={{ fontSize: '0.75rem', wordBreak: 'break-all' }}>{comparisonData.evidence_b?.sha256_hash}</code></div>
                <div><strong>Resolution:</strong> {comparisonData.evidence_b?.width} × {comparisonData.evidence_b?.height} px</div>
                <div><strong>MIME:</strong> {comparisonData.evidence_b?.mime_type}</div>
                <div><strong>Size:</strong> {comparisonData.evidence_b?.file_size_bytes ? `${(comparisonData.evidence_b.file_size_bytes / 1024).toFixed(1)} KB` : 'N/A'}</div>
              </div>
            </div>
          </div>

          {/* Detailed Metadata Cross-Reference Table */}
          <div className="card">
            <h3 className="card-title">Comparative Metadata & Property Matrix</h3>
            <table className="evidence-table">
              <thead>
                <tr>
                  <th>Property</th>
                  <th>Evidence A ({comparisonData.evidence_a?.original_filename})</th>
                  <th>Evidence B ({comparisonData.evidence_b?.original_filename})</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><strong>Cryptographic Hash (SHA-256)</strong></td>
                  <td style={{ fontFamily: 'monospace', fontSize: '0.8rem', wordBreak: 'break-all' }}>{comparisonData.evidence_a?.sha256_hash}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: '0.8rem', wordBreak: 'break-all' }}>{comparisonData.evidence_b?.sha256_hash}</td>
                  <td>
                    {comparisonData.evidence_a?.sha256_hash === comparisonData.evidence_b?.sha256_hash ? (
                      <span className="badge" style={{ background: '#10b981', color: 'white' }}>IDENTICAL</span>
                    ) : (
                      <span className="badge" style={{ background: '#ef4444', color: 'white' }}>DISTINCT</span>
                    )}
                  </td>
                </tr>
                <tr>
                  <td><strong>Image Dimensions</strong></td>
                  <td>{comparisonData.evidence_a?.width} × {comparisonData.evidence_a?.height}</td>
                  <td>{comparisonData.evidence_b?.width} × {comparisonData.evidence_b?.height}</td>
                  <td>
                    {comparisonData.evidence_a?.width === comparisonData.evidence_b?.width && comparisonData.evidence_a?.height === comparisonData.evidence_b?.height ? (
                      <span className="badge">MATCH</span>
                    ) : (
                      <span className="badge" style={{ background: '#f59e0b', color: 'white' }}>VARIANCE</span>
                    )}
                  </td>
                </tr>
                <tr>
                  <td><strong>MIME Type</strong></td>
                  <td>{comparisonData.evidence_a?.mime_type}</td>
                  <td>{comparisonData.evidence_b?.mime_type}</td>
                  <td>
                    {comparisonData.evidence_a?.mime_type === comparisonData.evidence_b?.mime_type ? (
                      <span className="badge">MATCH</span>
                    ) : (
                      <span className="badge" style={{ background: '#f59e0b', color: 'white' }}>VARIANCE</span>
                    )}
                  </td>
                </tr>
                <tr>
                  <td><strong>File Size</strong></td>
                  <td>{comparisonData.evidence_a?.file_size_bytes ? `${(comparisonData.evidence_a.file_size_bytes / 1024).toFixed(1)} KB` : 'N/A'}</td>
                  <td>{comparisonData.evidence_b?.file_size_bytes ? `${(comparisonData.evidence_b.file_size_bytes / 1024).toFixed(1)} KB` : 'N/A'}</td>
                  <td>
                    {comparisonData.evidence_a?.file_size_bytes === comparisonData.evidence_b?.file_size_bytes ? (
                      <span className="badge">MATCH</span>
                    ) : (
                      <span className="badge" style={{ background: '#f59e0b', color: 'white' }}>VARIANCE</span>
                    )}
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
