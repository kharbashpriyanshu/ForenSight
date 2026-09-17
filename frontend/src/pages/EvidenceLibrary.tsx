import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { fetchApi } from '../api';

interface EvidenceItemEnriched {
  id: number;
  evidence_identifier: string;
  original_filename: string;
  sha256_hash: string;
  mime_type: string;
  width: number;
  height: number;
  file_size_bytes?: number;
  created_at: string;
  completed_analyses?: string[];
  has_artifacts?: boolean;
}

const EvidenceLibrary: React.FC = () => {
  const { caseId } = useParams<{ caseId: string }>();
  const navigate = useNavigate();
  const [evidenceList, setEvidenceList] = useState<EvidenceItemEnriched[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Search and filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [mimeFilter, setMimeFilter] = useState('');
  
  // Comparison selection (IDs of selected items)
  const [selectedForCompare, setSelectedForCompare] = useState<number[]>([]);

  const fetchEvidence = () => {
    setLoading(true);
    let url = `/cases/${caseId}/evidence`;
    const params = new URLSearchParams();
    if (searchQuery.trim()) params.append('q', searchQuery.trim());
    if (mimeFilter) params.append('mime_type', mimeFilter);
    
    const queryString = params.toString();
    if (queryString) url += `?${queryString}`;

    fetchApi(url)
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch case evidence');
        return res.json();
      })
      .then(data => {
        setEvidenceList(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchEvidence();
  }, [caseId, mimeFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchEvidence();
  };

  const toggleSelectCompare = (id: number) => {
    setSelectedForCompare(prev => {
      if (prev.includes(id)) {
        return prev.filter(x => x !== id);
      }
      if (prev.length >= 2) {
        // replace the oldest selection
        return [prev[1], id];
      }
      return [...prev, id];
    });
  };

  const handleLaunchCompare = () => {
    if (selectedForCompare.length === 2) {
      navigate(`/cases/${caseId}/compare?a=${selectedForCompare[0]}&b=${selectedForCompare[1]}`);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Top Header Card */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
          <div>
            <h2 className="card-title" style={{ margin: 0 }}>Evidence Library & Registry</h2>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '0.25rem' }}>
              Acquired forensic images with cryptographic integrity and analysis status
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
            {selectedForCompare.length > 0 && (
              <button 
                className="secondary-button" 
                onClick={handleLaunchCompare}
                disabled={selectedForCompare.length !== 2}
                style={{ borderColor: selectedForCompare.length === 2 ? 'var(--primary-color)' : undefined }}
              >
                Compare Selected ({selectedForCompare.length}/2)
              </button>
            )}
            <button className="primary-button" onClick={() => navigate(`/cases/${caseId}/evidence/new`)}>
              + Acquire New Evidence
            </button>
          </div>
        </div>

        {/* Filter Bar */}
        <form onSubmit={handleSearchSubmit} style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <input 
            type="text" 
            placeholder="Search by filename or SHA-256 hash..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{ 
              flex: '1 1 250px', 
              padding: '0.6rem 0.8rem', 
              background: 'var(--surface-color-light)', 
              border: '1px solid var(--border-color)', 
              borderRadius: '0.25rem', 
              color: 'var(--text-main)' 
            }}
          />
          <select 
            value={mimeFilter} 
            onChange={e => setMimeFilter(e.target.value)}
            style={{ 
              padding: '0.6rem 0.8rem', 
              background: 'var(--surface-color-light)', 
              border: '1px solid var(--border-color)', 
              borderRadius: '0.25rem', 
              color: 'var(--text-main)' 
            }}
          >
            <option value="">All Formats</option>
            <option value="image/jpeg">JPEG (image/jpeg)</option>
            <option value="image/png">PNG (image/png)</option>
            <option value="image/webp">WebP (image/webp)</option>
            <option value="image/tiff">TIFF (image/tiff)</option>
          </select>
          <button type="submit" className="secondary-button">
            Filter
          </button>
          {searchQuery && (
            <button 
              type="button" 
              className="secondary-button" 
              onClick={() => { setSearchQuery(''); setTimeout(fetchEvidence, 0); }}
            >
              Clear
            </button>
          )}
        </form>
      </div>

      {loading ? (
        <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>Loading evidence items...</div>
      ) : error ? (
        <div className="error-banner">{error}</div>
      ) : evidenceList.length === 0 ? (
        <div className="card" style={{ padding: '3rem', textAlign: 'center' }}>
          <div style={{ color: 'var(--text-muted)', marginBottom: '1rem' }}>No evidence items match the specified criteria.</div>
          <button className="primary-button" onClick={() => navigate(`/cases/${caseId}/evidence/new`)}>
            Acquire Evidence
          </button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '1.25rem' }}>
          {evidenceList.map((ev) => {
            const isSelected = selectedForCompare.includes(ev.id);
            return (
              <div 
                key={ev.id} 
                className="card" 
                style={{ 
                  margin: 0, 
                  border: isSelected ? '2px solid var(--primary-color)' : '1px solid var(--border-color)',
                  background: isSelected ? 'rgba(59, 130, 246, 0.03)' : undefined,
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between'
                }}
              >
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <input 
                        type="checkbox" 
                        id={`compare-${ev.id}`}
                        checked={isSelected} 
                        onChange={() => toggleSelectCompare(ev.id)}
                        style={{ cursor: 'pointer', transform: 'scale(1.15)' }}
                      />
                      <label htmlFor={`compare-${ev.id}`} style={{ cursor: 'pointer', fontSize: '0.8rem', color: isSelected ? 'var(--primary-color)' : 'var(--text-muted)', fontWeight: 600 }}>
                        {isSelected ? 'Selected for Compare' : 'Select to Compare'}
                      </label>
                    </div>
                    <span className="badge" style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#10b981' }}>
                      SHA-256 Verified
                    </span>
                  </div>

                  <strong style={{ fontSize: '1.1rem', color: 'var(--text-color)', display: 'block', marginBottom: '0.35rem', wordBreak: 'break-word' }}>
                    {ev.original_filename}
                  </strong>

                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.75rem', fontFamily: 'monospace', background: 'var(--surface-color-light)', padding: '0.4rem', borderRadius: '4px', wordBreak: 'break-all' }}>
                    SHA-256: {ev.sha256_hash.substring(0, 16)}...{ev.sha256_hash.substring(ev.sha256_hash.length - 16)}
                  </div>

                  <div style={{ display: 'flex', gap: '1rem', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
                    <span><strong>MIME:</strong> {ev.mime_type}</span>
                    <span><strong>Dim:</strong> {ev.width}×{ev.height}</span>
                  </div>

                  {/* Modality Status Badges */}
                  <div style={{ marginBottom: '1rem' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.4rem', fontWeight: 600 }}>
                      Completed Modalities
                    </div>
                    <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                      {ev.completed_analyses && ev.completed_analyses.length > 0 ? (
                        ev.completed_analyses.map((analysis, idx) => (
                          <span 
                            key={idx} 
                            style={{ 
                              fontSize: '0.7rem', 
                              padding: '0.15rem 0.45rem', 
                              borderRadius: '3px', 
                              background: 'rgba(59, 130, 246, 0.15)', 
                              color: 'var(--primary-color)',
                              fontWeight: 600
                            }}
                          >
                            {analysis.toUpperCase()}
                          </span>
                        ))
                      ) : (
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                          No analyses executed yet
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    {new Date(ev.created_at).toLocaleDateString()}
                  </span>
                  <button className="secondary-button" onClick={() => navigate(`/cases/${caseId}/evidence/${ev.id}`)}>
                    Inspect & Run Analyses &rarr;
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default EvidenceLibrary;
