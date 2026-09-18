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
  file_size?: number;
  file_size_bytes?: number;
  created_at: string;
  completed_analyses?: string[];
  has_artifacts?: boolean;
}

interface BatchJobStatus {
  total_jobs: number;
  queued_count: number;
  running_count: number;
  completed_count: number;
  failed_count: number;
  progress_percentage: number;
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

  // Batch upload state
  const [showBatchUpload, setShowBatchUpload] = useState(false);
  const [batchFiles, setBatchFiles] = useState<FileList | null>(null);
  const [uploadingBatch, setUploadingBatch] = useState(false);

  // Batch analysis state
  const [batchJobStatus, setBatchJobStatus] = useState<BatchJobStatus | null>(null);
  const [triggeringBatch, setTriggeringBatch] = useState(false);

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

  const fetchBatchJobs = () => {
    fetchApi(`/cases/${caseId}/batch-jobs`)
      .then(res => res.json())
      .then(data => {
        if (data && data.total_jobs > 0) {
          setBatchJobStatus(data);
        }
      })
      .catch(() => {});
  };

  useEffect(() => {
    fetchEvidence();
    fetchBatchJobs();
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

  const handleBatchUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!batchFiles || batchFiles.length === 0) return;

    setUploadingBatch(true);
    const formData = new FormData();
    for (let i = 0; i < batchFiles.length; i++) {
      formData.append('files', batchFiles[i]);
    }

    try {
      const res = await fetchApi(`/cases/${caseId}/evidence/batch`, {
        method: 'POST',
        body: formData
      });
      if (!res.ok) throw new Error('Batch upload failed');
      setUploadingBatch(false);
      setShowBatchUpload(false);
      setBatchFiles(null);
      fetchEvidence();
    } catch (err: any) {
      alert(err.message || 'Failed to upload batch');
      setUploadingBatch(false);
    }
  };

  const handleTriggerBatchAnalysis = async () => {
    setTriggeringBatch(true);
    try {
      const res = await fetchApi(`/cases/${caseId}/batch-analysis`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          evidence_ids: selectedForCompare.length > 0 ? selectedForCompare : null,
          analysis_types: ['metadata', 'ela', 'noise', 'jpeg-dct', 'copy-move']
        })
      });
      const data = await res.json();
      setBatchJobStatus(data);
      setTriggeringBatch(false);
      fetchEvidence();
    } catch {
      setTriggeringBatch(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Top Header Card */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
              <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#10b981', background: 'rgba(16, 185, 129, 0.1)', padding: '0.15rem 0.45rem', borderRadius: '4px', textTransform: 'uppercase' }}>
                Evidence Registry & Batch OS
              </span>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                {evidenceList.length} Registered Items
              </span>
            </div>
            <h2 className="card-title" style={{ margin: 0 }}>Evidence Library & Ingestion</h2>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '0.25rem' }}>
              Acquired forensic images with cryptographic SHA-256 integrity, batch orchestration, and pipeline status
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
            {selectedForCompare.length > 0 && (
              <button 
                className="secondary-button" 
                onClick={handleLaunchCompare}
                disabled={selectedForCompare.length !== 2}
                style={{ fontSize: '0.8rem', padding: '0.35rem 0.75rem', borderColor: selectedForCompare.length === 2 ? 'var(--primary-color)' : undefined }}
              >
                Compare Selected ({selectedForCompare.length}/2)
              </button>
            )}

            <button 
              className="secondary-button" 
              onClick={handleTriggerBatchAnalysis}
              disabled={triggeringBatch || evidenceList.length === 0}
              style={{ fontSize: '0.8rem', padding: '0.35rem 0.75rem' }}
            >
              {triggeringBatch ? 'Queueing Batch...' : '⚡ Run Multi-Engine Suite on All'}
            </button>

            <button 
              className="secondary-button" 
              onClick={() => setShowBatchUpload(!showBatchUpload)}
              style={{ fontSize: '0.8rem', padding: '0.35rem 0.75rem' }}
            >
              📁 Batch Ingest Files
            </button>

            <button 
              className="primary-button" 
              onClick={() => navigate(`/cases/${caseId}/evidence/new`)}
              style={{ fontSize: '0.8rem', padding: '0.35rem 0.75rem' }}
            >
              + Single Upload
            </button>
          </div>
        </div>

        {/* Batch Progress Bar if active */}
        {batchJobStatus && batchJobStatus.total_jobs > 0 && (
          <div style={{ background: 'var(--surface-color-light)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '0.75rem 1rem', marginBottom: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem', fontSize: '0.8rem' }}>
              <span>
                <strong>Batch Pipeline Progress:</strong> {batchJobStatus.completed_count} completed, {batchJobStatus.running_count} running, {batchJobStatus.queued_count} queued
              </span>
              <span style={{ fontWeight: 700, color: batchJobStatus.progress_percentage === 100 ? '#10b981' : '#3b82f6' }}>
                {batchJobStatus.progress_percentage}%
              </span>
            </div>
            <div style={{ width: '100%', height: '6px', background: 'var(--background-color)', borderRadius: '3px', overflow: 'hidden' }}>
              <div style={{ width: `${batchJobStatus.progress_percentage}%`, height: '100%', background: '#3b82f6', transition: 'width 0.3s ease' }} />
            </div>
          </div>
        )}

        {/* Batch Upload Modal/Box */}
        {showBatchUpload && (
          <form onSubmit={handleBatchUploadSubmit} style={{ background: 'var(--surface-color-light)', border: '2px dashed var(--primary-color)', borderRadius: '8px', padding: '1.25rem', marginBottom: '1.25rem' }}>
            <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.95rem' }}>Batch Evidence Multi-File Ingestion</h4>
            <p style={{ margin: '0 0 0.75rem 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Select multiple JPEG, PNG, or TIFF image files to ingest simultaneously. Each file will be individually hashed with SHA-256 and registered into the case ledger.
            </p>
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <input 
                type="file" 
                multiple 
                accept="image/*"
                onChange={e => setBatchFiles(e.target.files)}
                style={{ fontSize: '0.85rem' }}
              />
              <button 
                type="submit" 
                className="primary-button"
                disabled={uploadingBatch || !batchFiles || batchFiles.length === 0}
                style={{ fontSize: '0.8rem', padding: '0.35rem 0.85rem' }}
              >
                {uploadingBatch ? 'Ingesting Batch...' : `Upload ${batchFiles ? batchFiles.length : 0} Files`}
              </button>
              <button 
                type="button" 
                className="secondary-button"
                onClick={() => setShowBatchUpload(false)}
                style={{ fontSize: '0.8rem', padding: '0.35rem 0.65rem' }}
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {/* Filter Bar */}
        <form onSubmit={handleSearchSubmit} style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <input 
            type="text" 
            placeholder="Search by filename or SHA-256 hash..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{ flex: 1, minWidth: '200px', padding: '0.45rem 0.75rem', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'var(--surface-color-light)', color: 'var(--text-color)', fontSize: '0.85rem' }}
          />
          <select 
            value={mimeFilter}
            onChange={e => setMimeFilter(e.target.value)}
            style={{ padding: '0.45rem 0.75rem', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'var(--surface-color-light)', color: 'var(--text-color)', fontSize: '0.85rem' }}
          >
            <option value="">All Formats</option>
            <option value="jpeg">JPEG / JPG</option>
            <option value="png">PNG</option>
          </select>
          <button type="submit" className="secondary-button" style={{ fontSize: '0.85rem' }}>
            Filter
          </button>
        </form>
      </div>

      {/* Grid of Evidence Cards */}
      {loading ? (
        <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>Loading case evidence library...</div>
      ) : error ? (
        <div className="error-banner">{error}</div>
      ) : evidenceList.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
          <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🗄️</div>
          <h3 style={{ margin: '0 0 0.5rem 0' }}>No Evidence Ingested</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: '0 0 1rem 0' }}>
            Start by acquiring evidence files via single or batch ingestion.
          </p>
          <button className="primary-button" onClick={() => setShowBatchUpload(true)}>
            Batch Ingest Evidence Files
          </button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1rem' }}>
          {evidenceList.map(item => {
            const isSelected = selectedForCompare.includes(item.id);
            return (
              <div 
                key={item.id}
                className="card"
                style={{ 
                  border: isSelected ? '2px solid var(--primary-color)' : '1px solid var(--border-color)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.75rem',
                  padding: '1rem',
                  position: 'relative'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--primary-color)', background: 'var(--surface-color-light)', padding: '0.15rem 0.45rem', borderRadius: '4px' }}>
                      {item.evidence_identifier}
                    </span>
                    <h3 style={{ margin: '0.4rem 0 0 0', fontSize: '0.95rem', wordBreak: 'break-all' }}>
                      {item.original_filename}
                    </h3>
                  </div>

                  <input 
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleSelectCompare(item.id)}
                    title="Select for comparison"
                    style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                  />
                </div>

                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  <div>Format: <strong>{item.mime_type}</strong> • {item.width}x{item.height} px</div>
                  <div style={{ fontFamily: 'monospace', marginTop: '0.2rem' }}>
                    SHA-256: {item.sha256_hash.substring(0, 16)}...
                  </div>
                </div>

                {/* Modalities badges */}
                <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                  {['metadata', 'ela', 'noise', 'jpeg-dct', 'copy-move'].map(mod => {
                    const done = (item.completed_analyses || []).map(a => a.toLowerCase()).includes(mod);
                    return (
                      <span 
                        key={mod}
                        style={{ 
                          fontSize: '0.65rem', 
                          fontWeight: 700,
                          padding: '0.1rem 0.35rem',
                          borderRadius: '3px',
                          background: done ? 'rgba(16, 185, 129, 0.15)' : 'var(--surface-color-light)',
                          color: done ? '#10b981' : 'var(--text-muted)',
                          textTransform: 'uppercase'
                        }}
                      >
                        {mod}
                      </span>
                    );
                  })}
                </div>

                <div style={{ display: 'flex', gap: '0.5rem', marginTop: 'auto', paddingTop: '0.5rem', borderTop: '1px solid var(--border-color)' }}>
                  <button 
                    className="primary-button" 
                    style={{ flex: 1, fontSize: '0.75rem', padding: '0.35rem' }}
                    onClick={() => navigate(`/cases/${caseId}/evidence/${item.id}`)}
                  >
                    Forensic Lab &rarr;
                  </button>
                  <button 
                    className="secondary-button" 
                    style={{ fontSize: '0.75rem', padding: '0.35rem 0.6rem' }}
                    onClick={() => toggleSelectCompare(item.id)}
                  >
                    {isSelected ? '✓ Selected' : 'Compare'}
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
