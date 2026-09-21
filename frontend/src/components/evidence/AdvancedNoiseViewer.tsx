import React, { useState } from 'react';
import { fetchApi } from '../../api';
import AuthenticatedImage from './AuthenticatedImage';

interface AdvancedNoiseViewerProps {
  evidenceId: number;
  containerFormat: string;
  advancedNoiseResult?: any;
  onRefresh?: () => void;
}

export const AdvancedNoiseViewer: React.FC<AdvancedNoiseViewerProps> = ({
  evidenceId,
  containerFormat,
  advancedNoiseResult,
  onRefresh,
}) => {
  const [running, setRunning] = useState<boolean>(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'map' | 'diagnostic'>('map');

  const handleRunAnalysis = async () => {
    setRunning(true);
    setActionError(null);
    try {
      const res = await fetchApi(`/evidence/${evidenceId}/analysis/advanced-noise`, {
        method: 'POST',
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || 'Advanced Noise execution failed.');
      }
      if (onRefresh) onRefresh();
    } catch (err: any) {
      setActionError(err.message || 'Failed to trigger Advanced Noise analysis.');
    } finally {
      setRunning(false);
    }
  };

  const findings = advancedNoiseResult?.structured_findings || {};
  const globalMetrics = findings.global_metrics || {};
  const lumMetrics = globalMetrics.luminance || {};
  const freqDecomp = findings.residual_frequency_decomposition || {};
  const localConsistency = findings.local_consistency || {};
  const candidateRegions = localConsistency.candidate_regions || [];
  const artifacts = findings.artifacts || {};
  const isCompleted = advancedNoiseResult && advancedNoiseResult.status === 'completed';

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <h3 style={{ margin: 0, fontSize: '1.15rem', color: 'var(--text-main)' }}>
              Advanced Spatial Noise Residual Analysis
            </h3>
            <span style={{ fontSize: '0.7rem', padding: '0.15rem 0.5rem', background: '#0284c7', color: '#fff', borderRadius: '4px', fontWeight: 600 }}>
              ADVANCED-NOISE v1.0.0
            </span>
            {containerFormat && (
              <span style={{ fontSize: '0.7rem', padding: '0.15rem 0.5rem', background: 'var(--surface-color-light)', border: '1px solid var(--border-color)', color: 'var(--text-muted)', borderRadius: '4px', fontWeight: 600 }}>
                {containerFormat.toUpperCase()}
              </span>
            )}
          </div>
          <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Extracts deterministic high-frequency noise residuals, computes robust MAD scales, and evaluates spatial block consistency.
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
            {running ? 'Extracting Residuals...' : isCompleted ? 'Re-run Noise Analysis' : 'Execute Advanced Noise Analysis'}
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
            No advanced spatial noise residual data available. Click "Execute Advanced Noise Analysis" above.
          </p>
        </div>
      ) : (
        <>
          {/* Key Metric Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '0.75rem' }}>
            <div style={{ padding: '0.85rem', background: 'var(--surface-color-light)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Residual Variance</div>
              <div style={{ fontSize: '1.35rem', fontWeight: 700, color: 'var(--text-main)', marginTop: '0.25rem' }}>
                {lumMetrics.variance !== undefined ? lumMetrics.variance.toFixed(3) : 'N/A'}
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                σ = {lumMetrics.std_dev !== undefined ? lumMetrics.std_dev.toFixed(3) : 'N/A'}
              </div>
            </div>

            <div style={{ padding: '0.85rem', background: 'var(--surface-color-light)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Robust Scale (MAD)</div>
              <div style={{ fontSize: '1.35rem', fontWeight: 700, color: '#0284c7', marginTop: '0.25rem' }}>
                {lumMetrics.robust_noise_scale !== undefined ? lumMetrics.robust_noise_scale.toFixed(3) : 'N/A'}
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                Raw MAD: {lumMetrics.mad !== undefined ? lumMetrics.mad.toFixed(3) : 'N/A'}
              </div>
            </div>

            <div style={{ padding: '0.85rem', background: 'var(--surface-color-light)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Residual Entropy</div>
              <div style={{ fontSize: '1.35rem', fontWeight: 700, color: 'var(--text-main)', marginTop: '0.25rem' }}>
                {lumMetrics.residual_entropy !== undefined ? `${lumMetrics.residual_entropy.toFixed(2)} b` : 'N/A'}
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                Shannon Information Measure
              </div>
            </div>

            <div style={{ padding: '0.85rem', background: 'var(--surface-color-light)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Candidate Regions</div>
              <div style={{ fontSize: '1.35rem', fontWeight: 700, color: candidateRegions.length > 0 ? '#ea580c' : '#16a34a', marginTop: '0.25rem' }}>
                {candidateRegions.length}
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                Blocks |z| ≥ {findings.parameters?.z_score_threshold || 2.5}
              </div>
            </div>
          </div>

          {/* Residual Frequency Decomposition */}
          <div style={{ padding: '1rem', background: 'var(--surface-color-light)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
              <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-main)' }}>
                Residual Spectral Energy Partition
              </span>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                High-Freq Energy Ratio: {(lumMetrics.high_frequency_energy_ratio * 100).toFixed(3)}%
              </span>
            </div>
            <div style={{ display: 'flex', height: '14px', borderRadius: '4px', overflow: 'hidden', background: '#e2e8f0', gap: '2px' }}>
              <div
                style={{ width: `${(freqDecomp.low_band_ratio || 0) * 100}%`, background: '#3b82f6' }}
                title={`Low Freq: ${((freqDecomp.low_band_ratio || 0) * 100).toFixed(1)}%`}
              />
              <div
                style={{ width: `${(freqDecomp.mid_band_ratio || 0) * 100}%`, background: '#10b981' }}
                title={`Mid Freq: ${((freqDecomp.mid_band_ratio || 0) * 100).toFixed(1)}%`}
              />
              <div
                style={{ width: `${(freqDecomp.high_band_ratio || 0) * 100}%`, background: '#f59e0b' }}
                title={`High Freq: ${((freqDecomp.high_band_ratio || 0) * 100).toFixed(1)}%`}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.4rem', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              <span>Low (0-15%): {((freqDecomp.low_band_ratio || 0) * 100).toFixed(1)}%</span>
              <span>Mid (15-50%): {((freqDecomp.mid_band_ratio || 0) * 100).toFixed(1)}%</span>
              <span>High (50-100%): {((freqDecomp.high_band_ratio || 0) * 100).toFixed(1)}%</span>
            </div>
          </div>

          {/* Visual Artifacts Tab Switcher */}
          <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
            <button
              onClick={() => setActiveTab('map')}
              style={{
                background: activeTab === 'map' ? '#0284c7' : 'transparent',
                color: activeTab === 'map' ? '#fff' : 'var(--text-muted)',
                border: 'none',
                padding: '0.35rem 0.8rem',
                borderRadius: '6px',
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Spatial Inconsistency Heatmap
            </button>
            <button
              onClick={() => setActiveTab('diagnostic')}
              style={{
                background: activeTab === 'diagnostic' ? '#0284c7' : 'transparent',
                color: activeTab === 'diagnostic' ? '#fff' : 'var(--text-muted)',
                border: 'none',
                padding: '0.35rem 0.8rem',
                borderRadius: '6px',
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Diagnostic Statistics Plot
            </button>
          </div>

          {/* Artifact Renderer */}
          <div style={{ display: 'flex', justifyContent: 'center', background: '#f8fafc', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
            {activeTab === 'map' ? (
              artifacts.advanced_noise_map ? (
                <AuthenticatedImage
                  src={`/api/v1/analysis/artifacts/${artifacts.advanced_noise_map}`}
                  alt="Spatial Noise Inconsistency Heatmap"
                  style={{ maxWidth: '100%', maxHeight: '420px', objectFit: 'contain', borderRadius: '6px' }}
                />
              ) : (
                <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Spatial map artifact unavailable</span>
              )
            ) : (
              artifacts.advanced_noise_analysis ? (
                <AuthenticatedImage
                  src={`/api/v1/analysis/artifacts/${artifacts.advanced_noise_analysis}`}
                  alt="Advanced Noise Diagnostic Plot"
                  style={{ maxWidth: '100%', maxHeight: '420px', objectFit: 'contain', borderRadius: '6px' }}
                />
              ) : (
                <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Diagnostic plot artifact unavailable</span>
              )
            )}
          </div>

          {/* Candidate Inconsistency Regions Table */}
          {candidateRegions.length > 0 && (
            <div>
              <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '0.4rem' }}>
                Candidate Noise-Inconsistency Regions ({candidateRegions.length})
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                  <thead>
                    <tr style={{ background: 'var(--surface-color-light)', borderBottom: '1px solid var(--border-color)', textAlign: 'left' }}>
                      <th style={{ padding: '0.4rem 0.6rem' }}>Region ID</th>
                      <th style={{ padding: '0.4rem 0.6rem' }}>Bounding Box [x, y, w, h]</th>
                      <th style={{ padding: '0.4rem 0.6rem' }}>Blocks</th>
                      <th style={{ padding: '0.4rem 0.6rem' }}>Mean z</th>
                      <th style={{ padding: '0.4rem 0.6rem' }}>Max |z|</th>
                      <th style={{ padding: '0.4rem 0.6rem' }}>Local Var</th>
                      <th style={{ padding: '0.4rem 0.6rem' }}>Baseline Var</th>
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
                        <td style={{ padding: '0.4rem 0.6rem' }}>{reg.local_variance}</td>
                        <td style={{ padding: '0.4rem 0.6rem' }}>{reg.baseline_variance}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Scientific Limitation Notice */}
          <div style={{ padding: '0.75rem', background: 'rgba(2, 132, 199, 0.06)', borderLeft: '3px solid #0284c7', borderRadius: '4px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            <strong>Scientific Guardrail Notice:</strong> Noise residual measurements are empirical physical observations.
            Variations in local noise scale frequently reflect natural scene textures, lighting gradients, or depth-of-field blur,
            and must be evaluated alongside complementary forensic modalities.
          </div>
        </>
      )}
    </div>
  );
};
