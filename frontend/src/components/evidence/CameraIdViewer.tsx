import React, { useState, useEffect } from 'react';
import { fetchApi } from '../../api';
import AuthenticatedImage from './AuthenticatedImage';

interface CameraIdViewerProps {
  evidenceId: number;
  caseId: string | number;
  containerFormat: string;
  cameraIdResult?: any;
  onRefresh?: () => void;
}

interface CameraReference {
  reference_id: string;
  camera_label: string;
  make_model?: string;
  serial_number?: string;
  width: number;
  height: number;
  num_images_aggregated: number;
  created_at: string;
  notes?: string;
}

export const CameraIdViewer: React.FC<CameraIdViewerProps> = ({
  evidenceId,
  caseId,
  containerFormat,
  cameraIdResult,
  onRefresh,
}) => {
  const [running, setRunning] = useState<boolean>(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'surface' | 'comparison' | 'candidates' | 'library'>('surface');

  // Reference library state
  const [references, setReferences] = useState<CameraReference[]>([]);
  const [loadingRefs, setLoadingRefs] = useState<boolean>(false);
  const [showUploadModal, setShowUploadModal] = useState<boolean>(false);
  const [uploadLabel, setUploadLabel] = useState<string>('');
  const [uploadMakeModel, setUploadMakeModel] = useState<string>('');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState<boolean>(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const loadReferences = async () => {
    if (!caseId) return;
    setLoadingRefs(true);
    try {
      const res = await fetchApi(`/cases/${caseId}/camera-references`);
      if (res.ok) {
        const data = await res.json();
        setReferences(data || []);
      }
    } catch {
      // Ignored
    } finally {
      setLoadingRefs(false);
    }
  };

  useEffect(() => {
    loadReferences();
  }, [caseId]);

  const handleRunAnalysis = async () => {
    setRunning(true);
    setActionError(null);
    try {
      const res = await fetchApi(`/evidence/${evidenceId}/analysis/camera-id`, {
        method: 'POST',
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || 'Camera identification execution failed.');
      }
      if (onRefresh) onRefresh();
    } catch (err: any) {
      setActionError(err.message || 'Failed to trigger Camera-ID analysis.');
    } finally {
      setRunning(false);
    }
  };

  const handleUploadReference = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFile || !uploadLabel.trim()) {
      setUploadError('Please provide a camera label and select an image or .npy file.');
      return;
    }
    setUploading(true);
    setUploadError(null);
    try {
      const formData = new FormData();
      formData.append('file', uploadFile);
      formData.append('camera_label', uploadLabel.trim());
      if (uploadMakeModel.trim()) {
        formData.append('make_model', uploadMakeModel.trim());
      }
      const res = await fetchApi(`/cases/${caseId}/camera-references`, {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || 'Failed to register camera reference.');
      }
      setShowUploadModal(false);
      setUploadFile(null);
      setUploadLabel('');
      setUploadMakeModel('');
      loadReferences();
    } catch (err: any) {
      setUploadError(err.message || 'Upload failed.');
    } finally {
      setUploading(false);
    }
  };

  const findings = cameraIdResult?.structured_findings || {};
  const topCandidate = findings.top_candidate;
  const candidates: any[] = findings.candidates || [];
  const isCompleted = cameraIdResult && cameraIdResult.status === 'completed';

  const analysisPlotArtifact = cameraIdResult?.artifacts?.find((a: any) => a.filename?.includes('analysis.png') || a.artifact_type === 'PLOT');
  const comparisonPlotArtifact = cameraIdResult?.artifacts?.find((a: any) => a.filename?.includes('comparison.png') || a.artifact_type === 'VISUALIZATION');

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <h3 style={{ margin: 0, fontSize: '1.15rem', color: 'var(--text-main)' }}>
              Source Camera Hardware Identification
            </h3>
            <span style={{ fontSize: '0.7rem', padding: '0.15rem 0.5rem', background: '#0284c7', color: '#fff', borderRadius: '4px', fontWeight: 600 }}>
              CAMERA-ID v1.0.0
            </span>
            {containerFormat && (
              <span style={{ fontSize: '0.7rem', padding: '0.15rem 0.5rem', background: 'var(--surface-color-light)', border: '1px solid var(--border-color)', color: 'var(--text-muted)', borderRadius: '4px', fontWeight: 600 }}>
                {containerFormat.toUpperCase()}
              </span>
            )}
          </div>
          <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            2D FFT circular cross-correlation and Peak-to-Correlation Energy (PCE) attribution against case reference library.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <button
            className="btn btn-secondary"
            onClick={() => setShowUploadModal(true)}
            style={{ fontSize: '0.8rem', padding: '0.4rem 0.85rem' }}
          >
            + Register Reference Fingerprint
          </button>
          {isCompleted && (
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#16a34a', background: 'rgba(22, 163, 74, 0.1)', padding: '0.25rem 0.6rem', borderRadius: '4px' }}>
              ATTRIBUTION EVALUATED
            </span>
          )}
          <button
            className="btn btn-primary"
            onClick={handleRunAnalysis}
            disabled={running}
            style={{ fontSize: '0.8rem', padding: '0.4rem 0.85rem' }}
          >
            {running ? 'Evaluating Attribution...' : isCompleted ? 'Re-run Camera-ID' : 'Execute Camera-ID'}
          </button>
        </div>
      </div>

      {actionError && (
        <div style={{ padding: '0.75rem', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid #ef4444', borderRadius: '6px', color: '#b91c1c', fontSize: '0.85rem' }}>
          {actionError}
        </div>
      )}

      {/* Upload Reference Modal */}
      {showUploadModal && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0, 0, 0, 0.5)',
          display: 'flex', justifyContent: 'center', alignItems: 'center',
          zIndex: 1000
        }}>
          <div style={{
            background: 'var(--surface-color)',
            padding: '1.5rem',
            borderRadius: '8px',
            width: '420px',
            maxWidth: '90%',
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem',
            boxShadow: '0 8px 30px rgba(0,0,0,0.3)',
            border: '1px solid var(--border-color)',
          }}>
            <h4 style={{ margin: 0, fontSize: '1.05rem', color: 'var(--text-main)' }}>Register Camera Reference Fingerprint</h4>
            <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Upload a candidate camera image (PRNU will be extracted) or a pre-computed .npy sensor fingerprint array.
            </p>

            <form onSubmit={handleUploadReference} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <div>
                <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem' }}>
                  Camera Label *
                </label>
                <input
                  type="text"
                  placeholder="e.g. Suspect Device 1 (Nikon D7000)"
                  value={uploadLabel}
                  onChange={(e) => setUploadLabel(e.target.value)}
                  style={{ width: '100%', padding: '0.4rem 0.6rem', fontSize: '0.85rem', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'var(--surface-color-light)', color: 'var(--text-main)' }}
                  required
                />
              </div>

              <div>
                <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem' }}>
                  Make / Model (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Apple iPhone 13 Pro"
                  value={uploadMakeModel}
                  onChange={(e) => setUploadMakeModel(e.target.value)}
                  style={{ width: '100%', padding: '0.4rem 0.6rem', fontSize: '0.85rem', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'var(--surface-color-light)', color: 'var(--text-main)' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem' }}>
                  File (.jpg, .png, .tif, or .npy) *
                </label>
                <input
                  type="file"
                  accept="image/*,.npy"
                  onChange={(e) => setUploadFile(e.target.files ? e.target.files[0] : null)}
                  style={{ width: '100%', fontSize: '0.8rem', color: 'var(--text-muted)' }}
                  required
                />
              </div>

              {uploadError && (
                <div style={{ color: '#ef4444', fontSize: '0.8rem' }}>{uploadError}</div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowUploadModal(false)}
                  disabled={uploading}
                  style={{ fontSize: '0.8rem', padding: '0.35rem 0.75rem' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={uploading}
                  style={{ fontSize: '0.8rem', padding: '0.35rem 0.75rem' }}
                >
                  {uploading ? 'Processing...' : 'Register'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isCompleted ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Top Candidate Banner */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem' }}>
            <div style={{ padding: '0.75rem', background: 'var(--surface-color-light)', border: '1px solid var(--border-color)', borderRadius: '6px' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Top Candidate</div>
              <div style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-main)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {topCandidate ? topCandidate.camera_label : 'No References'}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                {topCandidate?.make_model || 'Case Reference'}
              </div>
            </div>

            <div style={{ padding: '0.75rem', background: 'var(--surface-color-light)', border: '1px solid var(--border-color)', borderRadius: '6px' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Attribution Status</div>
              <div style={{
                fontSize: '1.1rem',
                fontWeight: 700,
                color: topCandidate?.status === 'CONSISTENT' ? '#16a34a' : (topCandidate?.status === 'INCONCLUSIVE' ? '#ea580c' : '#ef4444')
              }}>
                {topCandidate ? topCandidate.status : 'NOT_ESTIMATED'}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                Confidence: {topCandidate?.confidence || 'NONE'}
              </div>
            </div>

            <div style={{ padding: '0.75rem', background: 'var(--surface-color-light)', border: '1px solid var(--border-color)', borderRadius: '6px' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Peak-to-Correlation Energy (PCE)</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 700, color: topCandidate?.pce >= 50.0 ? '#16a34a' : 'var(--text-main)' }}>
                {topCandidate?.pce !== undefined ? Number(topCandidate.pce).toFixed(1) : '0.0'}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                Decision Threshold: 50.0
              </div>
            </div>

            <div style={{ padding: '0.75rem', background: 'var(--surface-color-light)', border: '1px solid var(--border-color)', borderRadius: '6px' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>PCE Margin Gap</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 700, color: findings.pce_gap >= 30.0 ? '#16a34a' : 'var(--text-main)' }}>
                +{findings.pce_gap !== undefined ? Number(findings.pce_gap).toFixed(1) : '0.0'}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                Vs Runner-Up Candidate
              </div>
            </div>
          </div>

          {/* Finding Statement */}
          <div style={{ padding: '0.75rem', background: 'var(--surface-color-light)', border: '1px solid var(--border-color)', borderRadius: '6px' }}>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-main)', lineHeight: '1.4' }}>
              {findings.primary_finding || 'Camera attribution evaluation completed.'}
            </div>
          </div>

          {/* View Tab Selector */}
          <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
            <button
              onClick={() => setActiveTab('surface')}
              style={{
                background: activeTab === 'surface' ? 'var(--surface-color-light)' : 'transparent',
                border: 'none',
                borderBottom: activeTab === 'surface' ? '2px solid #0284c7' : 'none',
                padding: '0.4rem 0.8rem',
                fontSize: '0.85rem',
                fontWeight: 600,
                color: activeTab === 'surface' ? 'var(--text-main)' : 'var(--text-muted)',
                cursor: 'pointer',
              }}
            >
              Cross-Correlation Surface & Ranking
            </button>
            <button
              onClick={() => setActiveTab('comparison')}
              style={{
                background: activeTab === 'comparison' ? 'var(--surface-color-light)' : 'transparent',
                border: 'none',
                borderBottom: activeTab === 'comparison' ? '2px solid #0284c7' : 'none',
                padding: '0.4rem 0.8rem',
                fontSize: '0.85rem',
                fontWeight: 600,
                color: activeTab === 'comparison' ? 'var(--text-main)' : 'var(--text-muted)',
                cursor: 'pointer',
              }}
            >
              Residual vs Reference Alignment
            </button>
            <button
              onClick={() => setActiveTab('candidates')}
              style={{
                background: activeTab === 'candidates' ? 'var(--surface-color-light)' : 'transparent',
                border: 'none',
                borderBottom: activeTab === 'candidates' ? '2px solid #0284c7' : 'none',
                padding: '0.4rem 0.8rem',
                fontSize: '0.85rem',
                fontWeight: 600,
                color: activeTab === 'candidates' ? 'var(--text-main)' : 'var(--text-muted)',
                cursor: 'pointer',
              }}
            >
              All Candidate Scores ({candidates.length})
            </button>
            <button
              onClick={() => setActiveTab('library')}
              style={{
                background: activeTab === 'library' ? 'var(--surface-color-light)' : 'transparent',
                border: 'none',
                borderBottom: activeTab === 'library' ? '2px solid #0284c7' : 'none',
                padding: '0.4rem 0.8rem',
                fontSize: '0.85rem',
                fontWeight: 600,
                color: activeTab === 'library' ? 'var(--text-main)' : 'var(--text-muted)',
                cursor: 'pointer',
              }}
            >
              Case Reference Library ({references.length})
            </button>
          </div>

          {/* Tab 1: Correlation Surface & Ranking */}
          {activeTab === 'surface' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <div style={{ background: '#000', borderRadius: '6px', overflow: 'hidden', display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '340px' }}>
                {analysisPlotArtifact ? (
                  <AuthenticatedImage
                    src={`/api/artifacts/${analysisPlotArtifact.file_path || analysisPlotArtifact.filename}`}
                    alt="Cross-correlation surface and candidate ranking"
                    style={{ maxHeight: '480px', width: 'auto', objectFit: 'contain' }}
                  />
                ) : (
                  <div style={{ color: '#94a3b8', fontSize: '0.85rem' }}>Analysis plot artifact unavailable.</div>
                )}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                2D circular cross-correlation peak height, exclusion window neighborhood, and candidate sensor ranking bar chart.
              </div>
            </div>
          )}

          {/* Tab 2: Visual Comparison */}
          {activeTab === 'comparison' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <div style={{ background: '#000', borderRadius: '6px', overflow: 'hidden', display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '340px' }}>
                {comparisonPlotArtifact ? (
                  <AuthenticatedImage
                    src={`/api/artifacts/${comparisonPlotArtifact.file_path || comparisonPlotArtifact.filename}`}
                    alt="Query residual vs reference visual alignment"
                    style={{ maxHeight: '480px', width: 'auto', objectFit: 'contain' }}
                  />
                ) : (
                  <div style={{ color: '#94a3b8', fontSize: '0.85rem' }}>Comparison plot artifact unavailable.</div>
                )}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                Side-by-side visualization of query high-frequency PRNU noise residual (W) and suspect camera reference fingerprint (K).
              </div>
            </div>
          )}

          {/* Tab 3: Candidate Scores Table */}
          {activeTab === 'candidates' && (
            <div style={{ overflowX: 'auto' }}>
              {candidates.length > 0 ? (
                <table style={{ width: '100%', fontSize: '0.85rem', borderCollapse: 'collapse', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)' }}>
                      <th style={{ padding: '0.5rem' }}>Rank</th>
                      <th style={{ padding: '0.5rem' }}>Camera Label</th>
                      <th style={{ padding: '0.5rem' }}>PCE</th>
                      <th style={{ padding: '0.5rem' }}>Peak Correlation</th>
                      <th style={{ padding: '0.5rem' }}>Offset (dy, dx)</th>
                      <th style={{ padding: '0.5rem' }}>Status</th>
                      <th style={{ padding: '0.5rem' }}>Confidence</th>
                    </tr>
                  </thead>
                  <tbody>
                    {candidates.map((cand, idx) => (
                      <tr key={cand.reference_id || idx} style={{ borderBottom: '1px solid var(--border-color)' }}>
                        <td style={{ padding: '0.5rem', fontWeight: 700 }}>#{idx + 1}</td>
                        <td style={{ padding: '0.5rem' }}>
                          <div style={{ fontWeight: 600 }}>{cand.camera_label}</div>
                          {cand.make_model && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{cand.make_model}</div>}
                        </td>
                        <td style={{ padding: '0.5rem', fontWeight: 700, color: cand.pce >= 50.0 ? '#16a34a' : 'inherit' }}>
                          {Number(cand.pce).toFixed(2)}
                        </td>
                        <td style={{ padding: '0.5rem' }}>{Number(cand.correlation).toFixed(5)}</td>
                        <td style={{ padding: '0.5rem', color: 'var(--text-muted)' }}>
                          {cand.peak_offset ? `(${cand.peak_offset[0]}, ${cand.peak_offset[1]})` : '(0, 0)'}
                        </td>
                        <td style={{ padding: '0.5rem' }}>
                          <span style={{
                            padding: '0.15rem 0.45rem',
                            borderRadius: '4px',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            background: cand.status === 'CONSISTENT' ? 'rgba(22, 163, 74, 0.1)' : (cand.status === 'INCONCLUSIVE' ? 'rgba(234, 88, 12, 0.1)' : 'rgba(239, 68, 68, 0.1)'),
                            color: cand.status === 'CONSISTENT' ? '#16a34a' : (cand.status === 'INCONCLUSIVE' ? '#ea580c' : '#ef4444'),
                          }}>
                            {cand.status}
                          </span>
                        </td>
                        <td style={{ padding: '0.5rem', color: 'var(--text-muted)' }}>{cand.confidence}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div style={{ padding: '1rem', color: 'var(--text-muted)', textAlign: 'center' }}>
                  No candidate reference comparisons recorded.
                </div>
              )}
            </div>
          )}

          {/* Tab 4: Reference Library */}
          {activeTab === 'library' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                  Stored PRNU references for this investigation case:
                </span>
                <button
                  className="btn btn-secondary"
                  onClick={() => setShowUploadModal(true)}
                  style={{ fontSize: '0.75rem', padding: '0.25rem 0.6rem' }}
                >
                  + Add Reference
                </button>
              </div>

              {loadingRefs ? (
                <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                  Loading camera reference fingerprints...
                </div>
              ) : references.length > 0 ? (
                <table style={{ width: '100%', fontSize: '0.85rem', borderCollapse: 'collapse', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)' }}>
                      <th style={{ padding: '0.5rem' }}>Camera Label</th>
                      <th style={{ padding: '0.5rem' }}>Sensor Dimensions</th>
                      <th style={{ padding: '0.5rem' }}>Calibration Images</th>
                      <th style={{ padding: '0.5rem' }}>Date Registered</th>
                    </tr>
                  </thead>
                  <tbody>
                    {references.map((ref) => (
                      <tr key={ref.reference_id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                        <td style={{ padding: '0.5rem' }}>
                          <div style={{ fontWeight: 600 }}>{ref.camera_label}</div>
                          {ref.make_model && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{ref.make_model}</div>}
                        </td>
                        <td style={{ padding: '0.5rem', color: 'var(--text-muted)' }}>
                          {ref.width} x {ref.height}
                        </td>
                        <td style={{ padding: '0.5rem' }}>
                          {ref.num_images_aggregated} image(s) (MLE)
                        </td>
                        <td style={{ padding: '0.5rem', color: 'var(--text-muted)' }}>
                          {ref.created_at ? new Date(ref.created_at).toLocaleDateString() : 'N/A'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                  No camera references registered for this case yet. Click <strong>+ Add Reference</strong> to register reference imagery.
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <div style={{ textAlign: 'center', padding: '2rem 1rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
          Camera hardware identification has not been performed for this evidence yet.
          {references.length === 0 ? (
            <div>
              <p style={{ marginTop: '0.5rem' }}>No camera references found for this case.</p>
              <button
                className="btn btn-secondary"
                onClick={() => setShowUploadModal(true)}
                style={{ fontSize: '0.8rem', padding: '0.35rem 0.75rem', marginTop: '0.5rem' }}
              >
                + Register First Camera Reference
              </button>
            </div>
          ) : (
            <p style={{ marginTop: '0.5rem' }}>Click <strong>Execute Camera-ID</strong> to test against {references.length} registered camera reference(s).</p>
          )}
        </div>
      )}
    </div>
  );
};

export default CameraIdViewer;
