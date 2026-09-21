import React, { useState } from 'react';
import { fetchApi } from '../../api';
import AuthenticatedImage from './AuthenticatedImage';

interface BlockingArtifactViewerProps {
  evidenceId: number;
  containerFormat: string;
  blockingResult?: any;
  onRefresh?: () => void;
}

export const BlockingArtifactViewer: React.FC<BlockingArtifactViewerProps> = ({
  evidenceId,
  containerFormat,
  blockingResult,
  onRefresh,
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'map' | 'regions' | 'boundaries'>('overview');
  const [running, setRunning] = useState<boolean>(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const isJpeg = ['JPEG', 'JPG'].includes((containerFormat || '').toUpperCase());

  const handleRunAnalysis = async () => {
    setRunning(true);
    setActionError(null);
    try {
      const res = await fetchApi(`/evidence/${evidenceId}/analysis/blocking-artifact`, {
        method: 'POST',
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || 'Analysis trigger failed.');
      }
      if (onRefresh) onRefresh();
    } catch (err: any) {
      setActionError(err.message || 'Blocking Artifact analysis failed to execute.');
    } finally {
      setRunning(false);
    }
  };

  // Scientific Guardrail for Non-JPEG Formats
  if (!isJpeg) {
    return (
      <div className="card" style={{ borderLeft: '4px solid #f59e0b' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
          <h3 style={{ margin: 0, fontSize: '1.15rem' }}>JPEG 8×8 Blocking Artifact Forensics (V4 Step 4)</h3>
          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#f59e0b', background: 'rgba(245, 158, 11, 0.1)', padding: '0.2rem 0.6rem', borderRadius: '4px' }}>
            NOT APPLICABLE ({containerFormat.toUpperCase()})
          </span>
        </div>
        <div style={{ padding: '0.85rem', background: 'rgba(245, 158, 11, 0.08)', border: '1px solid rgba(245, 158, 11, 0.3)', borderRadius: '6px', fontSize: '0.85rem' }}>
          <strong style={{ color: '#f59e0b' }}>SCIENTIFIC GUARDRAIL NOTICE:</strong>
          <p style={{ margin: '0.4rem 0 0 0', color: 'var(--text-main)', lineHeight: 1.45 }}>
            Blocking artifact grid (BAG) analysis measures 8×8 Discrete Cosine Transform (DCT) block boundary discontinuities.
            Non-JPEG container formats (such as <strong>{containerFormat.toUpperCase()}</strong>) do not possess 8×8 lossy DCT quantization grids.
            Inapplicability is a mathematical constraint, <em>NOT</em> negative evidence of manipulation or proof of authenticity.
          </p>
        </div>
      </div>
    );
  }

  const findings = blockingResult?.structured_findings || {};
  const globalStats = findings.global_statistics || {};
  const hStats = findings.horizontal_boundary_statistics || {};
  const vStats = findings.vertical_boundary_statistics || {};
  const inputInfo = findings.input_information || {};
  const candidateRegions = findings.candidate_regions || [];
  const artifacts = findings.artifacts || {};
  const isCompleted = blockingResult && blockingResult.status === 'completed';

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Header & Trigger Button */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
            <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#2563eb', background: 'rgba(37, 99, 235, 0.08)', border: '1px solid rgba(37, 99, 235, 0.2)', padding: '0.15rem 0.5rem', borderRadius: '4px' }}>
              V4 LOCAL ANALYSIS ENGINE
            </span>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>ITU-T T.81 / ISO 10918-1 8×8 Grid</span>
          </div>
          <h3 style={{ margin: 0, fontSize: '1.25rem' }}>JPEG 8×8 Blocking Artifact & Boundary Discontinuity Analysis</h3>
        </div>

        <div>
          <button
            className="secondary-button"
            onClick={handleRunAnalysis}
            disabled={running}
            style={{ fontSize: '0.8rem', padding: '0.45rem 0.9rem' }}
          >
            {running ? 'Evaluating 8×8 Block Boundaries...' : isCompleted ? 'Re-run Blocking Analysis' : 'Run Blocking Analysis'}
          </button>
        </div>
      </div>

      {actionError && (
        <div style={{ padding: '0.6rem 0.8rem', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid #ef4444', borderRadius: '4px', fontSize: '0.8rem', color: '#ef4444' }}>
          {actionError}
        </div>
      )}

      {/* Tab Navigation */}
      <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
        <button
          onClick={() => setActiveTab('overview')}
          style={{
            background: activeTab === 'overview' ? 'var(--primary-color)' : 'transparent',
            color: activeTab === 'overview' ? '#fff' : 'var(--text-muted)',
            border: 'none',
            borderRadius: '6px',
            padding: '0.45rem 0.9rem',
            cursor: 'pointer',
            fontSize: '0.85rem',
            fontWeight: 600,
            transition: 'all 0.15s ease',
          }}
        >
          📊 Overview & Global Stats
        </button>
        <button
          onClick={() => setActiveTab('map')}
          style={{
            background: activeTab === 'map' ? 'var(--primary-color)' : 'transparent',
            color: activeTab === 'map' ? '#fff' : 'var(--text-muted)',
            border: 'none',
            borderRadius: '6px',
            padding: '0.45rem 0.9rem',
            cursor: 'pointer',
            fontSize: '0.85rem',
            fontWeight: 600,
            transition: 'all 0.15s ease',
          }}
        >
          🗺️ 2D Blocking Map
        </button>
        <button
          onClick={() => setActiveTab('boundaries')}
          style={{
            background: activeTab === 'boundaries' ? 'var(--primary-color)' : 'transparent',
            color: activeTab === 'boundaries' ? '#fff' : 'var(--text-muted)',
            border: 'none',
            borderRadius: '6px',
            padding: '0.45rem 0.9rem',
            cursor: 'pointer',
            fontSize: '0.85rem',
            fontWeight: 600,
            transition: 'all 0.15s ease',
          }}
        >
          📐 Boundary Discontinuity (H vs V)
        </button>
        <button
          onClick={() => setActiveTab('regions')}
          style={{
            background: activeTab === 'regions' ? 'var(--primary-color)' : 'transparent',
            color: activeTab === 'regions' ? '#fff' : 'var(--text-muted)',
            border: 'none',
            borderRadius: '6px',
            padding: '0.45rem 0.9rem',
            cursor: 'pointer',
            fontSize: '0.85rem',
            fontWeight: 600,
            transition: 'all 0.15s ease',
          }}
        >
          🎯 Candidate Anomaly Regions ({candidateRegions.length})
        </button>
      </div>

      {/* Tab 1: Overview & Global Stats */}
      {activeTab === 'overview' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {!isCompleted ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
              Analysis has not been run for this evidence item. Click "Run Blocking Analysis" above to evaluate 8×8 boundary steps.
            </div>
          ) : (
            <>
              {/* Summary KPIs */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                <div style={{ padding: '1rem', background: 'var(--surface-color-light)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Global Blocking Strength</div>
                  <div style={{ fontSize: '1.75rem', fontWeight: 800, marginTop: '0.35rem', color: 'var(--text-main)' }}>
                    {globalStats.global_blocking_strength ?? 'N/A'}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                    Standard Deviation: ±{globalStats.global_std_deviation ?? 'N/A'}
                  </div>
                </div>

                <div style={{ padding: '1rem', background: 'var(--surface-color-light)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Boundary Energy</div>
                  <div style={{ fontSize: '1.75rem', fontWeight: 800, marginTop: '0.35rem', color: '#2563eb' }}>
                    {globalStats.boundary_energy ?? 'N/A'}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                    Mean squared excess boundary step
                  </div>
                </div>

                <div style={{ padding: '1rem', background: 'var(--surface-color-light)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Grid Periodicity Peak</div>
                  <div style={{ fontSize: '1.75rem', fontWeight: 800, marginTop: '0.35rem', color: '#059669' }}>
                    {globalStats.grid_periodicity_strength ?? 'N/A'}%
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                    Autocorrelation harmonic ratio at lag 8
                  </div>
                </div>

                <div style={{ padding: '1rem', background: 'var(--surface-color-light)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Candidate Regions</div>
                  <div style={{ fontSize: '1.75rem', fontWeight: 800, marginTop: '0.35rem', color: candidateRegions.length > 0 ? '#d97706' : '#059669' }}>
                    {candidateRegions.length}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                    {candidateRegions.length > 0 ? 'Requires analyst review' : 'Uniform blocking observed'}
                  </div>
                </div>
              </div>

              {/* Grid Specifications */}
              <div style={{ padding: '1rem', background: 'var(--surface-color-light)', borderRadius: '8px', border: '1px solid var(--border-color)', fontSize: '0.85rem' }}>
                <div style={{ fontWeight: 700, marginBottom: '0.5rem', color: 'var(--text-main)' }}>8×8 Block Grid Dimensions</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem' }}>
                  <div>Total 8×8 Blocks: <strong>{inputInfo.total_blocks?.toLocaleString() || 'N/A'}</strong></div>
                  <div>Grid Geometry: <strong>{inputInfo.block_grid_dimensions ? `${inputInfo.block_grid_dimensions[0]} rows × ${inputInfo.block_grid_dimensions[1]} cols` : 'N/A'}</strong></div>
                  <div>Analyzed Pixels: <strong>{inputInfo.analyzed_dimensions ? `${inputInfo.analyzed_dimensions[0]} × ${inputInfo.analyzed_dimensions[1]} px` : 'N/A'}</strong></div>
                  <div>Engine ID: <strong>BLOCKING-ARTIFACT v1.0.0</strong></div>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Tab 2: 2D Spatial Blocking Map */}
      {activeTab === 'map' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {!artifacts.blocking_artifact_map ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
              No spatial blocking map generated yet. Run analysis to create the visualization.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', alignItems: 'center' }}>
              <div style={{ width: '100%', maxWidth: '850px', background: '#0f172a', borderRadius: '10px', overflow: 'hidden', border: '1px solid var(--border-color)', boxShadow: '0 4px 20px rgba(0,0,0,0.1)' }}>
                <AuthenticatedImage
                  src={`/api/artifacts/${artifacts.blocking_artifact_map}`}
                  alt="Blocking Artifact Discontinuity Map"
                  style={{ width: '100%', height: 'auto', display: 'block' }}
                />
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textAlign: 'center', maxWidth: '750px', lineHeight: 1.4 }}>
                <strong>Map Legend:</strong> Color gradient (Inferno palette) visualizes local 8×8 block boundary step discontinuity normalized by intra-block roughness.
                Brighter regions exhibit higher boundary gradient excess. Colored bounding boxes indicate candidate clusters where local blocking diverges from the image mean.
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab 3: Boundary Discontinuity (H vs V) */}
      {activeTab === 'boundaries' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {!isCompleted ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
              Analysis has not been run. Please trigger analysis to view boundary discontinuity metrics.
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.25rem' }}>
              {/* Horizontal Boundary Stats */}
              <div style={{ padding: '1.25rem', background: 'var(--surface-color-light)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                  <h4 style={{ margin: 0, fontSize: '1rem', color: 'var(--text-main)' }}>Horizontal 8×8 Boundaries</h4>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#2563eb', background: 'rgba(37, 99, 235, 0.08)', padding: '0.15rem 0.5rem', borderRadius: '4px' }}>
                    Row Transitions
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', fontSize: '0.85rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Mean Discontinuity:</span>
                    <strong>{hStats.mean_discontinuity ?? 'N/A'}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Median Discontinuity:</span>
                    <strong>{hStats.median_discontinuity ?? 'N/A'}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Std Deviation:</span>
                    <strong>±{hStats.std_discontinuity ?? 'N/A'}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Boundary-to-Internal Ratio:</span>
                    <strong style={{ color: '#2563eb' }}>{hStats.boundary_to_internal_ratio ?? 'N/A'}x</strong>
                  </div>
                </div>
              </div>

              {/* Vertical Boundary Stats */}
              <div style={{ padding: '1.25rem', background: 'var(--surface-color-light)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                  <h4 style={{ margin: 0, fontSize: '1rem', color: 'var(--text-main)' }}>Vertical 8×8 Boundaries</h4>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#0284c7', background: 'rgba(2, 132, 199, 0.08)', padding: '0.15rem 0.5rem', borderRadius: '4px' }}>
                    Column Transitions
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', fontSize: '0.85rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Mean Discontinuity:</span>
                    <strong>{vStats.mean_discontinuity ?? 'N/A'}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Median Discontinuity:</span>
                    <strong>{vStats.median_discontinuity ?? 'N/A'}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Std Deviation:</span>
                    <strong>±{vStats.std_discontinuity ?? 'N/A'}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Boundary-to-Internal Ratio:</span>
                    <strong style={{ color: '#0284c7' }}>{vStats.boundary_to_internal_ratio ?? 'N/A'}x</strong>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab 4: Candidate Anomaly Regions */}
      {activeTab === 'regions' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {candidateRegions.length === 0 ? (
            <div style={{ padding: '2.5rem', textAlign: 'center', background: 'var(--surface-color-light)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
              <div style={{ fontSize: '1.8rem', marginBottom: '0.5rem' }}>✅</div>
              <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-main)', marginBottom: '0.25rem' }}>
                No Spatially Unusual Blocking Clusters
              </div>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', maxWidth: '550px', margin: '0 auto' }}>
                Measured block boundary step discrepancies are homogeneous across the 8×8 grid. No localized clusters exceeded the statistical z-score threshold.
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                Identified {candidateRegions.length} candidate region(s) where local 8×8 blocking energy deviates from the image baseline:
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', fontSize: '0.825rem', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={{ padding: '0.6rem 0.8rem', textAlign: 'left' }}>Region</th>
                      <th style={{ padding: '0.6rem 0.8rem', textAlign: 'left' }}>Observation Type</th>
                      <th style={{ padding: '0.6rem 0.8rem', textAlign: 'left' }}>Blocks / Area</th>
                      <th style={{ padding: '0.6rem 0.8rem', textAlign: 'left' }}>Z-Score</th>
                      <th style={{ padding: '0.6rem 0.8rem', textAlign: 'left' }}>Blocking Strength</th>
                      <th style={{ padding: '0.6rem 0.8rem', textAlign: 'left' }}>Bounding Box (px)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {candidateRegions.map((cr: any) => (
                      <tr key={cr.region_id}>
                        <td style={{ padding: '0.6rem 0.8rem', fontWeight: 700 }}>#{cr.region_id}</td>
                        <td style={{ padding: '0.6rem 0.8rem' }}>
                          <span style={{ 
                            padding: '0.2rem 0.5rem', 
                            borderRadius: '4px', 
                            fontSize: '0.75rem', 
                            fontWeight: 700,
                            background: cr.type === 'elevated_discontinuity' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(245, 158, 11, 0.1)',
                            color: cr.type === 'elevated_discontinuity' ? '#b91c1c' : '#b45309'
                          }}>
                            {cr.type.replace('_', ' ').toUpperCase()}
                          </span>
                        </td>
                        <td style={{ padding: '0.6rem 0.8rem' }}>{cr.block_count} blocks ({cr.pixel_area} px)</td>
                        <td style={{ padding: '0.6rem 0.8rem', fontWeight: 600 }}>{cr.mean_z_score > 0 ? `+${cr.mean_z_score}` : cr.mean_z_score}σ</td>
                        <td style={{ padding: '0.6rem 0.8rem' }}>{cr.mean_blocking_strength}</td>
                        <td style={{ padding: '0.6rem 0.8rem', fontFamily: 'var(--font-mono)' }}>
                          x:{cr.bounding_box_pixels?.x}, y:{cr.bounding_box_pixels?.y}, w:{cr.bounding_box_pixels?.width}, h:{cr.bounding_box_pixels?.height}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Scientific Limitations & NIST / SWGDE Standards Notice */}
      <div style={{ marginTop: '0.5rem', padding: '0.85rem', background: 'rgba(241, 245, 249, 0.7)', borderRadius: '8px', border: '1px solid var(--border-color)', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
        <strong style={{ color: 'var(--text-main)' }}>SCIENTIFIC METHODOLOGICAL GUARDRAILS:</strong>
        <ul style={{ margin: '0.35rem 0 0 1.25rem', padding: 0, lineHeight: 1.45 }}>
          <li>Blocking artifact measurement evaluates periodic step differences across 8×8 DCT boundaries. It does <em>not</em> yield a binary authenticity verdict or manipulation probability.</li>
          <li>Natural image features (sharp contrast edges, fine line art, shadows) or post-capture filtering can alter boundary steps without manual tampering.</li>
          <li>All candidate regions represent statistical observations intended for corroboration with other modalities (ELA, PRNU noise, metadata, and double-compression history).</li>
        </ul>
      </div>
    </div>
  );
};

export default BlockingArtifactViewer;
