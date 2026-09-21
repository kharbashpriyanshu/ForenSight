import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { fetchApi } from '../api';
import EvidenceIntegrityCard from '../components/evidence/EvidenceIntegrityCard';
import AnalysisJobCard from '../components/evidence/AnalysisJobCard';
import AuthenticatedImage from '../components/evidence/AuthenticatedImage';
import AdvancedJpegViewer from '../components/evidence/AdvancedJpegViewer';
import CompressionHistoryViewer from '../components/evidence/CompressionHistoryViewer';
import BlockingArtifactViewer from '../components/evidence/BlockingArtifactViewer';
import HistogramViewer from '../components/evidence/HistogramViewer';
import ColorChannelViewer from '../components/evidence/ColorChannelViewer';
import FourierViewer from '../components/evidence/FourierViewer';
import { AdvancedNoiseViewer } from '../components/evidence/AdvancedNoiseViewer';
import { ResamplingViewer } from '../components/evidence/ResamplingViewer';
import { CloneBlockViewer } from '../components/evidence/CloneBlockViewer';
import { CloneKeypointViewer } from '../components/evidence/CloneKeypointViewer';

interface HeatmapRegion {
  modality: string;
  x: number;
  y: number;
  width: number;
  height: number;
  intensity: number;
  description: string;
}

interface ModalityLayer {
  modality: string;
  label: string;
  status: string;
  regions: HeatmapRegion[];
  summary: string;
  limitations: string;
}

interface HeatmapData {
  evidence_id: number;
  width: number;
  height: number;
  layers: ModalityLayer[];
  composite_regions_count: number;
  what_was_found: string;
  why_it_matters: string;
  recommended_next_steps: string[];
  limitations: string;
}

export default function EvidenceDetail() {
  const { caseId, evidenceId } = useParams<{ caseId: string, evidenceId: string }>();
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<any | null>(null);
  const [error, setError] = useState('');
  
  const [jobs, setJobs] = useState<any>({});
  const [results, setResults] = useState<any>({});

  const [normalizing, setNormalizing] = useState(false);
  const [correlating, setCorrelating] = useState(false);

  // Heatmap state
  const [heatmap, setHeatmap] = useState<HeatmapData | null>(null);
  const [heatmapOpacity, setHeatmapOpacity] = useState<number>(0.65);
  const [showElaLayer, setShowElaLayer] = useState<boolean>(true);
  const [showNoiseLayer, setShowNoiseLayer] = useState<boolean>(true);
  const [showCloneLayer, setShowCloneLayer] = useState<boolean>(true);

  // Custody quick verify state
  const [verifyingCustody, setVerifyingCustody] = useState(false);
  const [custodyResult, setCustodyResult] = useState<any | null>(null);

  const fetchEvidenceAndJobs = (evId: string) => {
    fetchApi(`/evidence/${evId}`)
      .then(res => res.json())
      .then(data => setUploadResult(data))
      .catch(err => console.error("Error fetching evidence", err));

    fetchApi(`/evidence/${evId}/jobs`)
      .then(res => res.json())
      .then((jobsList: any[]) => {
        if (Array.isArray(jobsList)) {
          const jobsMap: any = {};
          jobsList.forEach(j => {
            const key = j.analysis_type.toLowerCase();
            const hypKey = key.replace(/_/g, '-');
            jobsMap[key] = j;
            jobsMap[hypKey] = j;
            if (j.status === 'COMPLETED' && j.analysis_id) {
              fetchApi(`/analysis/${j.analysis_id}`)
                .then(r => r.json())
                .then(resData => {
                  setResults((prev: any) => ({ ...prev, [key]: resData, [hypKey]: resData }));
                })
                .catch(() => {});
            }
          });
          setJobs(jobsMap);
        }
      })
      .catch(err => console.error("Error fetching jobs", err));

    fetchApi(`/evidence/${evId}/heatmap`)
      .then(res => res.json())
      .then(hData => setHeatmap(hData))
      .catch(() => {});
  };

  useEffect(() => {
    if (evidenceId && evidenceId !== 'new') {
      fetchEvidenceAndJobs(evidenceId);
    }
  }, [evidenceId]);

  const runAsyncJob = async (analysisType: string) => {
    try {
      const res = await fetchApi(`/jobs/analysis/${uploadResult.id}/${analysisType}`, { method: 'POST' });
      const jobData = await res.json();
      if (!res.ok) throw new Error(jobData.detail || 'Failed to queue job');
      
      setJobs((prev: any) => ({ ...prev, [analysisType]: jobData }));

      let isComplete = jobData.status === 'COMPLETED' || jobData.status === 'FAILED';
      let finalJob = jobData;
      while (!isComplete) {
        await new Promise(resolve => setTimeout(resolve, 1500));
        const pollRes = await fetchApi(`/jobs/${finalJob.id}`);
        finalJob = await pollRes.json();
        setJobs((prev: any) => ({ ...prev, [analysisType]: finalJob }));
        
        if (finalJob.status === 'COMPLETED' || finalJob.status === 'FAILED') {
          isComplete = true;
        }
      }
      
      if (finalJob.status === 'COMPLETED' && finalJob.analysis_id) {
        const resultRes = await fetchApi(`/analysis/${finalJob.analysis_id}`);
        const resultData = await resultRes.json();
        setResults((prev: any) => ({ ...prev, [analysisType]: resultData }));
        // Refresh heatmap after analysis completion
        fetchApi(`/evidence/${uploadResult.id}/heatmap`)
          .then(r => r.json())
          .then(h => setHeatmap(h))
          .catch(() => {});
      }
    } catch (err: any) {
      console.error(err);
    }
  };

  const handleUpload = () => {
    if (!file || !caseId) return;
    setUploading(true);
    setError('');
    
    const formData = new FormData();
    formData.append('case_id', caseId || '');
    formData.append('file', file);

    fetchApi(`/cases/${caseId}/evidence`, {
      method: 'POST',
      body: formData
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || 'Upload failed');
        setUploadResult(data);
        setUploading(false);
        setFile(null);
        fetchEvidenceAndJobs(String(data.id));
      })
      .catch((_err: any) => {
        setError(_err.message);
        setUploading(false);
      });
  };

  const handleVerifyCustody = () => {
    if (!uploadResult) return;
    setVerifyingCustody(true);
    fetchApi(`/evidence/${uploadResult.id}/verify-custody`, { method: 'POST' })
      .then(res => res.json())
      .then(data => {
        setCustodyResult(data);
        setVerifyingCustody(false);
      })
      .catch(() => setVerifyingCustody(false));
  };

  const handleNormalize = () => {
    if (!uploadResult) return;
    setNormalizing(true);
    fetchApi(`/evidence/${uploadResult.id}/fusion/normalize`, { method: 'POST' })
      .then(async (res) => {
        const data = await res.json();
        setResults((prev: any) => ({ ...prev, normalize: data }));
        setNormalizing(false);
      })
      .catch(() => setNormalizing(false));
  };

  const handleCorrelate = () => {
    if (!uploadResult) return;
    setCorrelating(true);
    fetchApi(`/evidence/${uploadResult.id}/fusion/correlate`, { method: 'POST' })
      .then(async (res) => {
        const data = await res.json();
        setResults((prev: any) => ({ ...prev, correlate: data }));
        setCorrelating(false);
      })
      .catch(() => setCorrelating(false));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Evidence Acquisition Form (if new) */}
      {!uploadResult && (
        <div className="card">
          <h2 className="card-title">Evidence Acquisition & Cryptographic Ingestion</h2>
          {!caseId ? (
            <p style={{ color: 'var(--text-muted)' }}>No Case ID found.</p>
          ) : (
            <div>
              <p style={{ marginBottom: '1rem', color: 'var(--primary-color)' }}>Active Case: {caseId}</p>
              <input 
                type="file" 
                accept="image/png, image/jpeg, image/webp"
                onChange={e => setFile(e.target.files?.[0] || null)}
                style={{ marginBottom: '1rem', display: 'block', width: '100%', padding: '0.5rem', background: 'var(--surface-color-light)', border: '1px solid var(--border-color)', borderRadius: '0.25rem', color: 'var(--text-main)' }}
              />
              <button className="btn btn-primary" onClick={handleUpload} disabled={!file || uploading} style={{ width: '100%' }}>
                {uploading ? 'Processing Cryptographic Ingestion...' : 'Acquire & Compute SHA-256 Hash'}
              </button>
              {error && <div style={{ marginTop: '1rem', color: '#ef4444', background: 'rgba(239, 68, 68, 0.1)', padding: '0.75rem', borderRadius: '0.25rem' }}>{error}</div>}
            </div>
          )}
        </div>
      )}

      {uploadResult && (
        <>
          {/* Top Bar: Integrity Card + Quick Verify */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '1rem' }}>
            <EvidenceIntegrityCard evidence={uploadResult} />

            {/* Custody Card */}
            <div className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <h3 style={{ margin: 0, fontSize: '1.05rem' }}>Chain of Custody & Storage Verification</h3>
                  <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#10b981', background: 'rgba(16, 185, 129, 0.1)', padding: '0.15rem 0.45rem', borderRadius: '4px' }}>
                    SHA-256 INVARIANT
                  </span>
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
                  Real-time disk bitstream verification against immutable acquisition hash.
                </div>

                {custodyResult && (
                  <div style={{ padding: '0.6rem', background: custodyResult.integrity_intact ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)', border: `1px solid ${custodyResult.integrity_intact ? '#10b981' : '#ef4444'}`, borderRadius: '4px', fontSize: '0.75rem', marginBottom: '0.75rem' }}>
                    <strong>{custodyResult.status}:</strong> {custodyResult.message}
                  </div>
                )}
              </div>

              <button 
                className="secondary-button"
                onClick={handleVerifyCustody}
                disabled={verifyingCustody}
                style={{ width: '100%', fontSize: '0.8rem', padding: '0.45rem' }}
              >
                {verifyingCustody ? 'Reading Physical Disk Bytes...' : '🛡️ On-Demand Hash Re-Verification'}
              </button>
            </div>
          </div>

          {/* Multi-Modality Forensic Anomaly Heatmap */}
          {heatmap && (
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', marginBottom: '1rem' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                    <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#ec4899', background: 'rgba(236, 72, 153, 0.1)', padding: '0.15rem 0.45rem', borderRadius: '4px', textTransform: 'uppercase' }}>
                      Spatial Attention Synthesis
                    </span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      {heatmap.composite_regions_count} Anomaly Zones Identified
                    </span>
                  </div>
                  <h3 style={{ margin: 0, fontSize: '1.2rem' }}>Multi-Modality Forensic Anomaly Heatmap</h3>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    Spatial convergence of Error Level Analysis, Noise Residual Discrepancies, and Keypoint Clusters
                  </div>
                </div>

                {/* Heatmap Controls */}
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap', background: 'var(--surface-color-light)', padding: '0.5rem 0.75rem', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem' }}>
                    <label style={{ fontWeight: 600 }}>Opacity: {Math.round(heatmapOpacity * 100)}%</label>
                    <input 
                      type="range" 
                      min="0.1" 
                      max="1.0" 
                      step="0.05"
                      value={heatmapOpacity}
                      onChange={e => setHeatmapOpacity(parseFloat(e.target.value))}
                      style={{ width: '80px', cursor: 'pointer' }}
                    />
                  </div>

                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.75rem', cursor: 'pointer' }}>
                    <input type="checkbox" checked={showElaLayer} onChange={e => setShowElaLayer(e.target.checked)} />
                    <span style={{ color: '#ef4444', fontWeight: 600 }}>ELA Layer</span>
                  </label>

                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.75rem', cursor: 'pointer' }}>
                    <input type="checkbox" checked={showNoiseLayer} onChange={e => setShowNoiseLayer(e.target.checked)} />
                    <span style={{ color: '#06b6d4', fontWeight: 600 }}>Noise Layer</span>
                  </label>

                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.75rem', cursor: 'pointer' }}>
                    <input type="checkbox" checked={showCloneLayer} onChange={e => setShowCloneLayer(e.target.checked)} />
                    <span style={{ color: '#10b981', fontWeight: 600 }}>Clone Layer</span>
                  </label>
                </div>
              </div>

              {/* Canvas/Overlay Container */}
              <div style={{ position: 'relative', width: '100%', maxWidth: '900px', margin: '0 auto', background: '#000', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--border-color)' }}>
                <AuthenticatedImage
                  src={`/api/evidence/${uploadResult.id}/raw`}
                  alt={uploadResult.original_filename}
                  style={{ width: '100%', height: 'auto', display: 'block' }}
                />

                {/* Overlay SVG */}
                <svg 
                  style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
                  viewBox="0 0 1000 1000"
                  preserveAspectRatio="none"
                >
                  {heatmap.layers.map(layer => {
                    if (layer.modality === 'ELA' && !showElaLayer) return null;
                    if (layer.modality === 'NOISE' && !showNoiseLayer) return null;
                    if (layer.modality === 'COPY_MOVE' && !showCloneLayer) return null;

                    const color = layer.modality === 'ELA' ? '#ef4444' : layer.modality === 'NOISE' ? '#06b6d4' : '#10b981';

                    return layer.regions.map((r, rIdx) => (
                      <rect
                        key={`${layer.modality}-${rIdx}`}
                        x={r.x * 1000}
                        y={r.y * 1000}
                        width={r.width * 1000}
                        height={r.height * 1000}
                        fill={color}
                        fillOpacity={r.intensity * heatmapOpacity * 0.45}
                        stroke={color}
                        strokeWidth="2"
                        strokeDasharray="4 2"
                      />
                    ));
                  })}
                </svg>
              </div>

              {/* Scientific Principles Context Card */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem', marginTop: '1rem' }}>
                <div style={{ background: 'var(--surface-color-light)', borderLeft: '3px solid #3b82f6', borderRadius: '4px', padding: '0.75rem' }}>
                  <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#3b82f6', textTransform: 'uppercase' }}>WHAT WAS FOUND?</div>
                  <div style={{ fontSize: '0.8rem', marginTop: '0.25rem' }}>{heatmap.what_was_found}</div>
                </div>

                <div style={{ background: 'var(--surface-color-light)', borderLeft: '3px solid #10b981', borderRadius: '4px', padding: '0.75rem' }}>
                  <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#10b981', textTransform: 'uppercase' }}>WHY DOES IT MATTER?</div>
                  <div style={{ fontSize: '0.8rem', marginTop: '0.25rem' }}>{heatmap.why_it_matters}</div>
                </div>

                <div style={{ background: 'var(--surface-color-light)', borderLeft: '3px solid #f59e0b', borderRadius: '4px', padding: '0.75rem' }}>
                  <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#f59e0b', textTransform: 'uppercase' }}>WHAT SHOULD YOU DO NEXT?</div>
                  <ul style={{ margin: '0.25rem 0 0 1rem', padding: 0, fontSize: '0.75rem' }}>
                    {heatmap.recommended_next_steps.slice(0, 3).map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                </div>
              </div>

              <div style={{ fontSize: '0.7rem', color: '#f59e0b', fontStyle: 'italic', marginTop: '0.75rem' }}>
                <strong>Limitation:</strong> {heatmap.limitations}
              </div>
            </div>
          )}

          {/* Analysis Jobs Grid */}
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h2 className="card-title" style={{ margin: 0, color: 'var(--primary-color)' }}>
                FORENSIC / DIP ENGINE WORKLOADS (FROZEN CORE)
              </h2>
            </div>
            
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1rem' }}>
              <AnalysisJobCard job={jobs['metadata']} analysisType="Metadata" result={results['metadata']} onRun={() => runAsyncJob('metadata')} disabled={false} />
              <AnalysisJobCard job={jobs['ela']} analysisType="Error Level Analysis" result={results['ela']} onRun={() => runAsyncJob('ela')} disabled={false} />
              <AnalysisJobCard job={jobs['noise']} analysisType="Noise Residual" result={results['noise']} onRun={() => runAsyncJob('noise')} disabled={false} />
              <AnalysisJobCard job={jobs['jpeg-dct']} analysisType="JPEG / DCT" result={results['jpeg-dct']} onRun={() => runAsyncJob('jpeg-dct')} disabled={false} />
              <AnalysisJobCard job={jobs['copy-move']} analysisType="Copy-Move" result={results['copy-move']} onRun={() => runAsyncJob('copy-move')} disabled={false} />
            </div>

            {/* V4 Step 2: Advanced JPEG & File Forensics Extension Viewer */}
            <div style={{ marginTop: '2rem' }}>
              <AdvancedJpegViewer
                evidenceId={uploadResult.id}
                containerFormat={uploadResult.file_format || ''}
                structureResult={results['jpeg-structure'] || results['jpeg_structure']}
                qtResult={results['jpeg-qt'] || results['jpeg_qt']}
                huffmanResult={results['jpeg-huffman'] || results['jpeg_huffman']}
                onRefresh={() => fetchEvidenceAndJobs(evidenceId!)}
              />
            </div>

            {/* V4 Step 3: JPEG Compression History Forensics Viewer */}
            <div style={{ marginTop: '2rem' }}>
              <CompressionHistoryViewer
                evidenceId={uploadResult.id}
                containerFormat={uploadResult.file_format || ''}
                ghostResult={results['jpeg-ghost'] || results['jpeg_ghost']}
                adjpegResult={results['adjpeg']}
                nadjpegResult={results['nadjpeg']}
                onRefresh={() => fetchEvidenceAndJobs(evidenceId!)}
              />
            </div>

            {/* V4 Step 4: JPEG 8×8 Blocking Artifact Forensics Viewer */}
            <div style={{ marginTop: '2rem' }}>
              <BlockingArtifactViewer
                evidenceId={uploadResult.id}
                containerFormat={uploadResult.file_format || ''}
                blockingResult={results['blocking-artifact'] || results['blocking_artifact']}
                onRefresh={() => fetchEvidenceAndJobs(evidenceId!)}
              />
            </div>

            {/* V4 Step 5: Histogram Distribution Forensics Viewer */}
            <div style={{ marginTop: '2rem' }}>
              <HistogramViewer
                evidenceId={uploadResult.id}
                containerFormat={uploadResult.file_format || ''}
                histogramResult={results['histogram']}
                onRefresh={() => fetchEvidenceAndJobs(evidenceId!)}
              />
            </div>

            {/* V4 Step 5: Color Channel Discrepancy Forensics Viewer */}
            <div style={{ marginTop: '2rem' }}>
              <ColorChannelViewer
                evidenceId={uploadResult.id}
                containerFormat={uploadResult.file_format || ''}
                colorChannelResult={results['color-channel'] || results['color_channel']}
                onRefresh={() => fetchEvidenceAndJobs(evidenceId!)}
              />
            </div>

            {/* V4 Step 5: Fourier 2D Frequency Spectrum Forensics Viewer */}
            <div style={{ marginTop: '2rem' }}>
              <FourierViewer
                evidenceId={uploadResult.id}
                containerFormat={uploadResult.file_format || ''}
                fourierResult={results['fourier']}
                onRefresh={() => fetchEvidenceAndJobs(evidenceId!)}
              />
            </div>

            {/* V4 Step 6: Advanced Spatial Noise Residual Forensics Viewer */}
            <div style={{ marginTop: '2rem' }}>
              <AdvancedNoiseViewer
                evidenceId={uploadResult.id}
                containerFormat={uploadResult.file_format || ''}
                advancedNoiseResult={results['advanced-noise'] || results['advanced_noise']}
                onRefresh={() => fetchEvidenceAndJobs(evidenceId!)}
              />
            </div>

            {/* V4 Step 6: Periodic Resampling & Interpolation Forensics Viewer */}
            <div style={{ marginTop: '2rem' }}>
              <ResamplingViewer
                evidenceId={uploadResult.id}
                containerFormat={uploadResult.file_format || ''}
                resamplingResult={results['resampling']}
                onRefresh={() => fetchEvidenceAndJobs(evidenceId!)}
              />
            </div>

            {/* V4 Step 7: Block-Based Copy-Move Clone Forensics Viewer */}
            <div style={{ marginTop: '2rem' }}>
              <CloneBlockViewer
                evidenceId={uploadResult.id}
                containerFormat={uploadResult.file_format || ''}
                cloneBlockResult={results['clone-block'] || results['clone_block']}
                onRefresh={() => fetchEvidenceAndJobs(evidenceId!)}
              />
            </div>

            {/* V4 Step 7: Keypoint-Based Copy-Move Clone Forensics Viewer */}
            <div style={{ marginTop: '2rem' }}>
              <CloneKeypointViewer
                evidenceId={uploadResult.id}
                containerFormat={uploadResult.file_format || ''}
                cloneKeypointResult={results['clone-keypoint'] || results['clone_keypoint']}
                onRefresh={() => fetchEvidenceAndJobs(evidenceId!)}
              />
            </div>

            
            <h2 className="card-title" style={{ marginTop: '2rem', marginBottom: '1rem', borderTop: '1px solid var(--border-color)', paddingTop: '2rem' }}>
              FUSION & ASSESSMENT
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <button 
                className="btn" 
                onClick={handleNormalize}
                disabled={normalizing}
                style={{ background: '#1e3a8a', color: '#ffffff', padding: '0.85rem 1.25rem', borderRadius: '6px', fontWeight: 600, border: 'none', cursor: normalizing ? 'not-allowed' : 'pointer', opacity: normalizing ? 0.7 : 1 }}
              >
                {normalizing ? 'Normalizing Observations...' : '1. Normalize Observations'}
              </button>
              <button 
                className="btn" 
                onClick={handleCorrelate}
                disabled={correlating}
                style={{ background: '#0284c7', color: '#ffffff', padding: '0.85rem 1.25rem', borderRadius: '6px', fontWeight: 600, border: 'none', cursor: correlating ? 'not-allowed' : 'pointer', opacity: correlating ? 0.7 : 1 }}
              >
                {correlating ? 'Correlating & Assessing...' : '2. Correlate & Assess'}
              </button>
            </div>
            
            {results.correlate && (
              <div style={{ marginTop: '1.5rem', background: 'var(--surface-color-light)', padding: '1.5rem', borderRadius: '8px', border: '1px solid var(--border-color)', borderLeft: '4px solid #0284c7' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <h3 style={{ margin: 0, color: 'var(--text-main)', fontSize: '1.05rem' }}>Correlated Forensic Assessment</h3>
                  <span className="status-badge">{results.correlate.assessment?.level}</span>
                </div>
                <div style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-main)', marginTop: '0.25rem' }}>{results.correlate.assessment?.level}</div>
                <div style={{ marginTop: '0.5rem', color: 'var(--text-body)', lineHeight: 1.5 }}>{results.correlate.assessment?.summary}</div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
