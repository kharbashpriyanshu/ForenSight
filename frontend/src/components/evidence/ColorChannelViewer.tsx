import React, { useState } from 'react';
import { fetchApi } from '../../api';
import AuthenticatedImage from './AuthenticatedImage';

interface ColorChannelViewerProps {
  evidenceId: number;
  containerFormat: string;
  colorChannelResult?: any;
  onRefresh?: () => void;
}

export const ColorChannelViewer: React.FC<ColorChannelViewerProps> = ({
  evidenceId,
  containerFormat,
  colorChannelResult,
  onRefresh,
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'channels' | 'difference_maps' | 'candidates'>('overview');
  const [running, setRunning] = useState<boolean>(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const handleRunAnalysis = async () => {
    setRunning(true);
    setActionError(null);
    try {
      const res = await fetchApi(`/evidence/${evidenceId}/analysis/color-channel`, {
        method: 'POST',
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || 'Color Channel analysis execution failed.');
      }
      if (onRefresh) onRefresh();
    } catch (err: any) {
      setActionError(err.message || 'Failed to trigger color channel analysis.');
    } finally {
      setRunning(false);
    }
  };

  const findings = colorChannelResult?.structured_findings || {};
  const corr = findings.correlation_matrix || {};
  const diffStats = findings.channel_difference_statistics || {};
  const candidateRegions = findings.candidate_regions || [];
  const artifacts = findings.artifacts || {};
  const isCompleted = colorChannelResult && colorChannelResult.status === 'completed';

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <h3 style={{ margin: 0, fontSize: '1.15rem', color: 'var(--text-main)' }}>
              Color Channel Discrepancy Analysis
            </h3>
            <span style={{ fontSize: '0.7rem', padding: '0.15rem 0.5rem', background: '#059669', color: '#fff', borderRadius: '4px', fontWeight: 600 }}>
              COLOR-CHANNEL v1.0.0
            </span>
            {containerFormat && (
              <span style={{ fontSize: '0.7rem', padding: '0.15rem 0.5rem', background: 'var(--surface-color-light)', border: '1px solid var(--border-color)', color: 'var(--text-muted)', borderRadius: '4px', fontWeight: 600 }}>
                {containerFormat.toUpperCase()}
              </span>
            )}
          </div>
          <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Evaluates inter-channel Pearson correlations (R vs G vs B), spatial difference maps, and localized chromaticity departures.
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
            {running ? 'Analyzing Color Channels...' : isCompleted ? 'Re-run Color Analysis' : 'Execute Color Channel Analysis'}
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
            No color channel disparity findings available for this evidence item. Click "Execute Color Channel Analysis" above.
          </p>
        </div>
      ) : (
        <>
          {/* Key Metric Highlights */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.85rem' }}>
            <div style={{ padding: '0.85rem', background: 'var(--surface-color-light)', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
                R-G Correlation
              </div>
              <div style={{ fontSize: '1.35rem', fontWeight: 700, color: corr.r_vs_g < 0.8 ? '#ea580c' : '#059669', marginTop: '0.2rem' }}>
                {corr.r_vs_g !== undefined ? corr.r_vs_g : 'N/A'}
              </div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                Pearson correlation coefficient
              </div>
            </div>

            <div style={{ padding: '0.85rem', background: 'var(--surface-color-light)', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
                R-B / G-B Correlation
              </div>
              <div style={{ fontSize: '1.35rem', fontWeight: 700, color: 'var(--text-main)', marginTop: '0.2rem' }}>
                {corr.r_vs_b !== undefined ? `${corr.r_vs_b} / ${corr.g_vs_b}` : 'N/A'}
              </div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                Cross-channel coherence
              </div>
            </div>

            <div style={{ padding: '0.85rem', background: 'var(--surface-color-light)', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
                Mean Composite Difference
              </div>
              <div style={{ fontSize: '1.35rem', fontWeight: 700, color: 'var(--text-main)', marginTop: '0.2rem' }}>
                {diffStats.composite?.mean !== undefined ? `${diffStats.composite.mean}` : 'N/A'}
              </div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                Average |R-G| + |R-B| + |G-B|
              </div>
            </div>

            <div style={{ padding: '0.85rem', background: 'var(--surface-color-light)', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
                Candidate Anomaly Regions
              </div>
              <div style={{ fontSize: '1.35rem', fontWeight: 700, color: candidateRegions.length > 0 ? '#ef4444' : '#16a34a', marginTop: '0.2rem' }}>
                {candidateRegions.length}
              </div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                Clusters with |Z| ≥ 2.5 local deviation
              </div>
            </div>
          </div>

          {/* Tab Navigation */}
          <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
            <button
              onClick={() => setActiveTab('overview')}
              style={{
                padding: '0.4rem 0.85rem',
                borderRadius: '4px',
                fontSize: '0.8rem',
                fontWeight: 600,
                border: '1px solid',
                borderColor: activeTab === 'overview' ? '#059669' : 'var(--border-color)',
                background: activeTab === 'overview' ? '#059669' : 'var(--surface-color)',
                color: activeTab === 'overview' ? '#fff' : 'var(--text-main)',
                cursor: 'pointer',
              }}
            >
              Overview & Matrix
            </button>
            <button
              onClick={() => setActiveTab('channels')}
              style={{
                padding: '0.4rem 0.85rem',
                borderRadius: '4px',
                fontSize: '0.8rem',
                fontWeight: 600,
                border: '1px solid',
                borderColor: activeTab === 'channels' ? '#059669' : 'var(--border-color)',
                background: activeTab === 'channels' ? '#059669' : 'var(--surface-color)',
                color: activeTab === 'channels' ? '#fff' : 'var(--text-main)',
                cursor: 'pointer',
              }}
            >
              Channel Decomposition
            </button>
            <button
              onClick={() => setActiveTab('difference_maps')}
              style={{
                padding: '0.4rem 0.85rem',
                borderRadius: '4px',
                fontSize: '0.8rem',
                fontWeight: 600,
                border: '1px solid',
                borderColor: activeTab === 'difference_maps' ? '#059669' : 'var(--border-color)',
                background: activeTab === 'difference_maps' ? '#059669' : 'var(--surface-color)',
                color: activeTab === 'difference_maps' ? '#fff' : 'var(--text-main)',
                cursor: 'pointer',
              }}
            >
              Difference Heatmap
            </button>
            <button
              onClick={() => setActiveTab('candidates')}
              style={{
                padding: '0.4rem 0.85rem',
                borderRadius: '4px',
                fontSize: '0.8rem',
                fontWeight: 600,
                border: '1px solid',
                borderColor: activeTab === 'candidates' ? '#059669' : 'var(--border-color)',
                background: activeTab === 'candidates' ? '#059669' : 'var(--surface-color)',
                color: activeTab === 'candidates' ? '#fff' : 'var(--text-main)',
                cursor: 'pointer',
              }}
            >
              Candidate Regions ({candidateRegions.length})
            </button>
          </div>

          {/* Tab Content */}
          {activeTab === 'overview' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                  <thead>
                    <tr style={{ background: 'var(--surface-color-light)', borderBottom: '1px solid var(--border-color)' }}>
                      <th style={{ textAlign: 'left', padding: '0.5rem 0.75rem', color: 'var(--text-muted)' }}>Channel Pair</th>
                      <th style={{ textAlign: 'right', padding: '0.5rem 0.75rem', color: 'var(--text-muted)' }}>Pearson Correlation</th>
                      <th style={{ textAlign: 'right', padding: '0.5rem 0.75rem', color: 'var(--text-muted)' }}>Mean Absolute Difference</th>
                      <th style={{ textAlign: 'right', padding: '0.5rem 0.75rem', color: 'var(--text-muted)' }}>Max Difference</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <td style={{ padding: '0.5rem 0.75rem', fontWeight: 600 }}>Red vs. Green (R - G)</td>
                      <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right', fontFamily: 'monospace' }}>{corr.r_vs_g ?? 'N/A'}</td>
                      <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right', fontFamily: 'monospace' }}>{diffStats.rg?.mean ?? 'N/A'}</td>
                      <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right', fontFamily: 'monospace' }}>{diffStats.rg?.max ?? 'N/A'}</td>
                    </tr>
                    <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <td style={{ padding: '0.5rem 0.75rem', fontWeight: 600 }}>Red vs. Blue (R - B)</td>
                      <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right', fontFamily: 'monospace' }}>{corr.r_vs_b ?? 'N/A'}</td>
                      <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right', fontFamily: 'monospace' }}>{diffStats.rb?.mean ?? 'N/A'}</td>
                      <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right', fontFamily: 'monospace' }}>{diffStats.rb?.max ?? 'N/A'}</td>
                    </tr>
                    <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <td style={{ padding: '0.5rem 0.75rem', fontWeight: 600 }}>Green vs. Blue (G - B)</td>
                      <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right', fontFamily: 'monospace' }}>{corr.g_vs_b ?? 'N/A'}</td>
                      <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right', fontFamily: 'monospace' }}>{diffStats.gb?.mean ?? 'N/A'}</td>
                      <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right', fontFamily: 'monospace' }}>{diffStats.gb?.max ?? 'N/A'}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'channels' && artifacts.color_channel_overview_plot && (
            <div style={{ background: 'var(--surface-color-light)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
              <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.95rem', color: 'var(--text-main)' }}>Isolated R, G, B Channels & Normalized Chromaticity</h4>
              <div style={{ display: 'flex', justifyContent: 'center', background: '#fff', borderRadius: '6px', overflow: 'hidden', padding: '0.5rem' }}>
                <AuthenticatedImage
                  src={`/api/artifacts/${artifacts.color_channel_overview_plot}`}
                  alt="Color Channel Decomposition"
                  style={{ maxHeight: '480px', width: 'auto', objectFit: 'contain' }}
                />
              </div>
            </div>
          )}

          {activeTab === 'difference_maps' && artifacts.color_channel_maps_plot && (
            <div style={{ background: 'var(--surface-color-light)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
              <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.95rem', color: 'var(--text-main)' }}>Composite Difference Map & Candidate Anomaly Bounding Boxes</h4>
              <div style={{ display: 'flex', justifyContent: 'center', background: '#fff', borderRadius: '6px', overflow: 'hidden', padding: '0.5rem' }}>
                <AuthenticatedImage
                  src={`/api/artifacts/${artifacts.color_channel_maps_plot}`}
                  alt="Color Channel Difference Maps"
                  style={{ maxHeight: '480px', width: 'auto', objectFit: 'contain' }}
                />
              </div>
            </div>
          )}

          {activeTab === 'candidates' && (
            <div>
              {candidateRegions.length === 0 ? (
                <div style={{ padding: '1.5rem', textAlign: 'center', background: 'var(--surface-color-light)', borderRadius: '6px' }}>
                  <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                    No anomalous candidate regions met the statistical threshold (|Z| ≥ 2.5 with contiguous block clustering).
                  </p>
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                    <thead>
                      <tr style={{ background: 'var(--surface-color-light)', borderBottom: '1px solid var(--border-color)' }}>
                        <th style={{ textAlign: 'left', padding: '0.5rem', color: 'var(--text-muted)' }}>ID</th>
                        <th style={{ textAlign: 'left', padding: '0.5rem', color: 'var(--text-muted)' }}>Bounding Box (x, y, w, h)</th>
                        <th style={{ textAlign: 'right', padding: '0.5rem', color: 'var(--text-muted)' }}>Blocks</th>
                        <th style={{ textAlign: 'right', padding: '0.5rem', color: 'var(--text-muted)' }}>Mean Z-Score</th>
                        <th style={{ textAlign: 'left', padding: '0.5rem', color: 'var(--text-muted)' }}>Interpretation</th>
                      </tr>
                    </thead>
                    <tbody>
                      {candidateRegions.map((cand: any) => (
                        <tr key={cand.region_id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                          <td style={{ padding: '0.5rem', fontWeight: 600 }}>#{cand.region_id}</td>
                          <td style={{ padding: '0.5rem', fontFamily: 'monospace' }}>[{cand.x}, {cand.y}, {cand.width}, {cand.height}]</td>
                          <td style={{ padding: '0.5rem', textAlign: 'right', fontFamily: 'monospace' }}>{cand.block_count}</td>
                          <td style={{ padding: '0.5rem', textAlign: 'right', fontFamily: 'monospace', color: Math.abs(cand.mean_z_score) >= 3.0 ? '#ef4444' : '#ea580c' }}>
                            {cand.mean_z_score}
                          </td>
                          <td style={{ padding: '0.5rem', color: 'var(--text-muted)' }}>{cand.interpretation}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Scientific Guardrail */}
          <div style={{ padding: '0.85rem', background: 'rgba(5, 150, 105, 0.06)', border: '1px solid rgba(5, 150, 105, 0.2)', borderRadius: '6px', fontSize: '0.8rem' }}>
            <strong style={{ color: '#059669' }}>FORENSIC LIMITATION & SCIENTIFIC PRINCIPLE:</strong>
            <p style={{ margin: '0.35rem 0 0 0', color: 'var(--text-main)', lineHeight: 1.45 }}>
              Vivid, saturated objects (such as garments, signs, or foliage) legitimately depart from host chromaticity distributions.
              Candidate regions flag statistical divergence in inter-channel relationships for visual examiner inspection and do <em>NOT</em> prove photographic manipulation.
            </p>
          </div>
        </>
      )}
    </div>
  );
};

export default ColorChannelViewer;
