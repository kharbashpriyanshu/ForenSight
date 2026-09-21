import React, { useState } from 'react';
import { fetchApi } from '../../api';
import AuthenticatedImage from './AuthenticatedImage';

interface ResamplingViewerProps {
  evidenceId: number;
  containerFormat: string;
  resamplingResult?: any;
  onRefresh?: () => void;
}

export const ResamplingViewer: React.FC<ResamplingViewerProps> = ({
  evidenceId,
  containerFormat,
  resamplingResult,
  onRefresh,
}) => {
  const [running, setRunning] = useState<boolean>(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'map' | 'diagnostic'>('map');

  const handleRunAnalysis = async () => {
    setRunning(true);
    setActionError(null);
    try {
      const res = await fetchApi(`/evidence/${evidenceId}/analysis/resampling`, {
        method: 'POST',
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || 'Resampling analysis execution failed.');
      }
      if (onRefresh) onRefresh();
    } catch (err: any) {
      setActionError(err.message || 'Failed to trigger Resampling analysis.');
    } finally {
      setRunning(false);
    }
  };

  const findings = resamplingResult?.structured_findings || {};
  const hMetrics = findings.horizontal_metrics || {};
  const vMetrics = findings.vertical_metrics || {};
  const localConsistency = findings.local_consistency || {};
  const candidateRegions = localConsistency.candidate_regions || [];
  const artifacts = findings.artifacts || {};
  const isCompleted = resamplingResult && resamplingResult.status === 'completed';

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <h3 style={{ margin: 0, fontSize: '1.15rem', color: 'var(--text-main)' }}>
              Periodic Resampling & Interpolation Analysis
            </h3>
            <span style={{ fontSize: '0.7rem', padding: '0.15rem 0.5rem', background: '#059669', color: '#fff', borderRadius: '4px', fontWeight: 600 }}>
              RESAMPLING v1.0.0
            </span>
            {containerFormat && (
              <span style={{ fontSize: '0.7rem', padding: '0.15rem 0.5rem', background: 'var(--surface-color-light)', border: '1px solid var(--border-color)', color: 'var(--text-muted)', borderRadius: '4px', fontWeight: 600 }}>
                {containerFormat.toUpperCase()}
              </span>
            )}
          </div>
          <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Detects periodic interpolation dependencies and directional second-derivative correlation spikes from scaling or rotation.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {isCompleted && (
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#16a34a', background: 'rgba(22, 163, 74, 0.1)', padding: '0.25rem 0.6rem', borderRadius: '4px' }}>
              ANALYSIS COMPLETE
            </span>
          )}
          <button
            className="btn btn-primary"
            onClick={handleRunAnalysis}
            disabled={running}
            style={{ fontSize: '0.8rem', padding: '0.4rem 0.85rem' }}
          >
            {running ? 'Evaluating Derivatives...' : isCompleted ? 'Re-run Resampling Analysis' : 'Execute Resampling Analysis'}
          </button>
        </div>
      </div>

      {actionError && (
        <div style={{ padding: '0.75rem', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid #ef4444', borderRadius: '6px', color: '#b91c1c', fontSize: '0.85rem' }}>
          {actionError}
        </div>
      )}

      {!isCompleted ? (
        <div style={{ padding: '2rem', textAlign: 'center', background: 'var(--surface-color-light)', borderRadius: '8px', border: '1px dashed var(--border-color)' }}>
          <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            No periodic resampling or interpolation data available. Click "Execute Resampling Analysis" above.
          </p>
        </div>
      ) : (
        <>
          {/* Key Metric Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '0.75rem' }}>
            <div style={{ padding: '0.85rem', background: 'var(--surface-color-light)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Dominant Period</div>
              <div style={{ fontSize: '1.35rem', fontWeight: 700, color: 'var(--text-main)', marginTop: '0.25rem' }}>
                {findings.dominant_period ? `${findings.dominant_period.toFixed(2)} px` : 'N/A'}
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                Axis: {findings.dominant_axis ? findings.dominant_axis.toUpperCase() : 'N/A'}
              </div>
            </div>

            <div style={{ padding: '0.85rem', background: 'var(--surface-color-light)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Peak Strength</div>
              <div style={{ fontSize: '1.35rem', fontWeight: 700, color: '#059669', marginTop: '0.25rem' }}>
                {findings.dominant_peak_strength ? `${findings.dominant_peak_strength.toFixed(2)}x` : 'N/A'}
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                Relative to Baseline
              </div>
            </div>

            <div style={{ padding: '0.85rem', background: 'var(--surface-color-light)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Directional Asymmetry</div>
              <div style={{ fontSize: '1.35rem', fontWeight: 700, color: 'var(--text-main)', marginTop: '0.25rem' }}>
                {findings.directional_asymmetry !== undefined ? findings.directional_asymmetry.toFixed(3) : 'N/A'}
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                |H - V| / (H + V)
              </div>
            </div>

            <div style={{ padding: '0.85rem', background: 'var(--surface-color-light)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Candidate Regions</div>
              <div style={{ fontSize: '1.35rem', fontWeight: 700, color: candidateRegions.length > 0 ? '#ea580c' : '#16a34a', marginTop: '0.25rem' }}>
                {candidateRegions.length}
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                Curvature z ≥ {findings.parameters?.z_score_threshold || 2.5}
              </div>
            </div>
          </div>

          {/* Directional Analysis Comparison Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div style={{ padding: '0.85rem', background: 'var(--surface-color-light)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-main)' }}>
                  Horizontal Derivative (d_xx)
                </span>
                <span style={{ fontSize: '0.75rem', color: '#3b82f6', fontWeight: 600 }}>
                  {hMetrics.peak_strength_ratio?.toFixed(2)}x baseline
                </span>
              </div>
              <div style={{ marginTop: '0.4rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Period: <strong>{hMetrics.peak_period?.toFixed(2)} px</strong> (Freq: {hMetrics.peak_frequency?.toFixed(4)} cycles/px)
              </div>
            </div>

            <div style={{ padding: '0.85rem', background: 'var(--surface-color-light)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-main)' }}>
                  Vertical Derivative (d_yy)
                </span>
                <span style={{ fontSize: '0.75rem', color: '#10b981', fontWeight: 600 }}>
                  {vMetrics.peak_strength_ratio?.toFixed(2)}x baseline
                </span>
              </div>
              <div style={{ marginTop: '0.4rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Period: <strong>{vMetrics.peak_period?.toFixed(2)} px</strong> (Freq: {vMetrics.peak_frequency?.toFixed(4)} cycles/px)
              </div>
            </div>
          </div>

          {/* Visual Artifacts Tab Switcher */}
          <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
            <button
              onClick={() => setActiveTab('map')}
              style={{
                background: activeTab === 'map' ? '#059669' : 'transparent',
                color: activeTab === 'map' ? '#fff' : 'var(--text-muted)',
                border: 'none',
                padding: '0.35rem 0.8rem',
                borderRadius: '6px',
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Spatial Resampling Map
            </button>
            <button
              onClick={() => setActiveTab('diagnostic')}
              style={{
                background: activeTab === 'diagnostic' ? '#059669' : 'transparent',
                color: activeTab === 'diagnostic' ? '#fff' : 'var(--text-muted)',
                border: 'none',
                padding: '0.35rem 0.8rem',
                borderRadius: '6px',
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Directional Spectra Diagnostic
            </button>
          </div>

          {/* Artifact Renderer */}
          <div style={{ display: 'flex', justifyContent: 'center', background: '#f8fafc', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
            {activeTab === 'map' ? (
              artifacts.resampling_map ? (
                <AuthenticatedImage
                  src={`/api/v1/analysis/artifacts/${artifacts.resampling_map}`}
                  alt="Spatial Resampling Heatmap"
                  style={{ maxWidth: '100%', maxHeight: '420px', objectFit: 'contain', borderRadius: '6px' }}
                />
              ) : (
                <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Spatial map artifact unavailable</span>
              )
            ) : (
              artifacts.resampling_analysis ? (
                <AuthenticatedImage
                  src={`/api/v1/analysis/artifacts/${artifacts.resampling_analysis}`}
                  alt="Resampling Directional Spectra Plot"
                  style={{ maxWidth: '100%', maxHeight: '420px', objectFit: 'contain', borderRadius: '6px' }}
                />
              ) : (
                <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Diagnostic plot artifact unavailable</span>
              )
            )}
          </div>

          {/* Candidate Resampling-Consistent Regions Table */}
          {candidateRegions.length > 0 && (
            <div>
              <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '0.4rem' }}>
                Candidate Resampling-Consistent Regions ({candidateRegions.length})
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                  <thead>
                    <tr style={{ background: 'var(--surface-color-light)', borderBottom: '1px solid var(--border-color)', textAlign: 'left' }}>
                      <th style={{ padding: '0.4rem 0.6rem' }}>Region ID</th>
                      <th style={{ padding: '0.4rem 0.6rem' }}>Bounding Box [x, y, w, h]</th>
                      <th style={{ padding: '0.4rem 0.6rem' }}>Blocks</th>
                      <th style={{ padding: '0.4rem 0.6rem' }}>Mean z</th>
                      <th style={{ padding: '0.4rem 0.6rem' }}>Max z</th>
                      <th style={{ padding: '0.4rem 0.6rem' }}>Local Curvature</th>
                      <th style={{ padding: '0.4rem 0.6rem' }}>Dominant Period</th>
                    </tr>
                  </thead>
                  <tbody>
                    {candidateRegions.map((reg: any, idx: number) => (
                      <tr key={idx} style={{ borderBottom: '1px solid var(--border-color)' }}>
                        <td style={{ padding: '0.4rem 0.6rem', fontWeight: 600 }}>{reg.region_id}</td>
                        <td style={{ padding: '0.4rem 0.6rem', fontFamily: 'monospace' }}>
                          [{reg.bounding_box.join(', ')}]
                        </td>
                        <td style={{ padding: '0.4rem 0.6rem' }}>{reg.block_count}</td>
                        <td style={{ padding: '0.4rem 0.6rem' }}>{reg.mean_deviation_z}</td>
                        <td style={{ padding: '0.4rem 0.6rem', color: '#ea580c', fontWeight: 600 }}>{reg.max_deviation_z}</td>
                        <td style={{ padding: '0.4rem 0.6rem' }}>{reg.local_response}</td>
                        <td style={{ padding: '0.4rem 0.6rem' }}>{reg.dominant_period} px</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Scientific Limitation Notice */}
          <div style={{ padding: '0.75rem', background: 'rgba(5, 150, 105, 0.06)', borderLeft: '3px solid #059669', borderRadius: '4px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            <strong>Scientific Guardrail Notice:</strong> Periodic derivative patterns are empirical physical indicators
            of spatial interpolation. Repetitive scene textures (e.g. woven fabrics, screens, brickwork) and camera demosaicing
            filters can also generate periodic dependencies, requiring cross-modality verification.
          </div>
        </>
      )}
    </div>
  );
};
