import React, { useState } from 'react';
import { fetchApi } from '../../api';
import AuthenticatedImage from './AuthenticatedImage';

interface HistogramViewerProps {
  evidenceId: number;
  containerFormat: string;
  histogramResult?: any;
  onRefresh?: () => void;
}

export const HistogramViewer: React.FC<HistogramViewerProps> = ({
  evidenceId,
  containerFormat,
  histogramResult,
  onRefresh,
}) => {
  const [selectedChannel, setSelectedChannel] = useState<'luminance' | 'red' | 'green' | 'blue'>('luminance');
  const [running, setRunning] = useState<boolean>(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const handleRunAnalysis = async () => {
    setRunning(true);
    setActionError(null);
    try {
      const res = await fetchApi(`/evidence/${evidenceId}/analysis/histogram`, {
        method: 'POST',
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || 'Histogram analysis execution failed.');
      }
      if (onRefresh) onRefresh();
    } catch (err: any) {
      setActionError(err.message || 'Failed to trigger histogram analysis.');
    } finally {
      setRunning(false);
    }
  };

  const findings = histogramResult?.structured_findings || {};
  const channelStats = findings.channel_statistics || {};
  const artifacts = findings.artifacts || {};
  const isCompleted = histogramResult && histogramResult.status === 'completed';
  const lumStats = channelStats['luminance'] || {};
  const activeStats = channelStats[selectedChannel] || {};

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <h3 style={{ margin: 0, fontSize: '1.15rem', color: 'var(--text-main)' }}>
              Color Histogram & Dynamic Range Analysis
            </h3>
            <span style={{ fontSize: '0.7rem', padding: '0.15rem 0.5rem', background: '#0284c7', color: '#fff', borderRadius: '4px', fontWeight: 600 }}>
              HISTOGRAM v1.0.0
            </span>
            {containerFormat && (
              <span style={{ fontSize: '0.7rem', padding: '0.15rem 0.5rem', background: 'var(--surface-color-light)', border: '1px solid var(--border-color)', color: 'var(--text-muted)', borderRadius: '4px', fontWeight: 600 }}>
                {containerFormat.toUpperCase()}
              </span>
            )}
          </div>
          <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Evaluates discrete tonal distributions, Shannon entropy, dynamic range occupancy, and comb-like gaps.
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
            {running ? 'Computing Distribution...' : isCompleted ? 'Re-run Histogram' : 'Execute Histogram Analysis'}
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
            No histogram distribution data available for this evidence item. Click "Execute Histogram Analysis" above.
          </p>
        </div>
      ) : (
        <>
          {/* Key Metric Highlights */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.85rem' }}>
            <div style={{ padding: '0.85rem', background: 'var(--surface-color-light)', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
                Luminance Entropy
              </div>
              <div style={{ fontSize: '1.35rem', fontWeight: 700, color: '#0284c7', marginTop: '0.2rem' }}>
                {lumStats.shannon_entropy !== undefined ? `${lumStats.shannon_entropy} b/px` : 'N/A'}
              </div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                Theoretical maximum: 8.0 bits/px
              </div>
            </div>

            <div style={{ padding: '0.85rem', background: 'var(--surface-color-light)', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
                Comb-Like Gaps
              </div>
              <div style={{ fontSize: '1.35rem', fontWeight: 700, color: lumStats.comb_gaps_count > 10 ? '#ea580c' : '#16a34a', marginTop: '0.2rem' }}>
                {lumStats.comb_gaps_count !== undefined ? lumStats.comb_gaps_count : 'N/A'}
              </div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                Interior empty bins inside dynamic range
              </div>
            </div>

            <div style={{ padding: '0.85rem', background: 'var(--surface-color-light)', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
                Dynamic Range Occupancy
              </div>
              <div style={{ fontSize: '1.35rem', fontWeight: 700, color: 'var(--text-main)', marginTop: '0.2rem' }}>
                {lumStats.min !== undefined ? `[${lumStats.min}, ${lumStats.max}]` : 'N/A'}
              </div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                Span: {lumStats.dynamic_range !== undefined ? `${lumStats.dynamic_range} levels` : 'N/A'}
              </div>
            </div>

            <div style={{ padding: '0.85rem', background: 'var(--surface-color-light)', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
                Clipping (Shadow / High)
              </div>
              <div style={{ fontSize: '1.35rem', fontWeight: 700, color: 'var(--text-main)', marginTop: '0.2rem' }}>
                {lumStats.shadow_clipping_pct !== undefined ? `${lumStats.shadow_clipping_pct}% / ${lumStats.highlight_clipping_pct}%` : 'N/A'}
              </div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                Bins 0 and 255 saturation
              </div>
            </div>
          </div>

          {/* Histogram Visualization Plot */}
          {artifacts.histogram_analysis_plot && (
            <div style={{ background: 'var(--surface-color-light)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <h4 style={{ margin: 0, fontSize: '0.95rem', color: 'var(--text-main)' }}>Multi-Channel Histogram Distributions & CDF</h4>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Solid: Pixel Counts | Dashed: Cumulative Distribution (CDF)</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'center', background: '#fff', borderRadius: '6px', overflow: 'hidden', padding: '0.5rem' }}>
                <AuthenticatedImage
                  src={`/api/artifacts/${artifacts.histogram_analysis_plot}`}
                  alt="Histogram Analysis Plot"
                  style={{ maxHeight: '480px', width: 'auto', objectFit: 'contain' }}
                />
              </div>
            </div>
          )}

          {/* Detailed Channel Statistics Selector & Table */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
              {(['luminance', 'red', 'green', 'blue'] as const).map((ch) => (
                <button
                  key={ch}
                  onClick={() => setSelectedChannel(ch)}
                  style={{
                    padding: '0.35rem 0.8rem',
                    borderRadius: '4px',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    border: '1px solid',
                    borderColor: selectedChannel === ch ? '#0284c7' : 'var(--border-color)',
                    background: selectedChannel === ch ? '#0284c7' : 'var(--surface-color)',
                    color: selectedChannel === ch ? '#fff' : 'var(--text-main)',
                    cursor: 'pointer',
                    textTransform: 'capitalize',
                  }}
                >
                  {ch} Channel
                </button>
              ))}
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ background: 'var(--surface-color-light)', borderBottom: '1px solid var(--border-color)' }}>
                    <th style={{ textAlign: 'left', padding: '0.5rem 0.75rem', color: 'var(--text-muted)' }}>Metric</th>
                    <th style={{ textAlign: 'right', padding: '0.5rem 0.75rem', color: 'var(--text-muted)' }}>Value</th>
                    <th style={{ textAlign: 'left', padding: '0.5rem 0.75rem', color: 'var(--text-muted)' }}>Description</th>
                  </tr>
                </thead>
                <tbody>
                  <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <td style={{ padding: '0.5rem 0.75rem', fontWeight: 600 }}>Mean Intensity</td>
                    <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right', fontFamily: 'monospace' }}>{activeStats.mean ?? 'N/A'}</td>
                    <td style={{ padding: '0.5rem 0.75rem', color: 'var(--text-muted)' }}>Average tonal value in channel (0-255)</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <td style={{ padding: '0.5rem 0.75rem', fontWeight: 600 }}>Standard Deviation</td>
                    <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right', fontFamily: 'monospace' }}>{activeStats.std_dev ?? 'N/A'}</td>
                    <td style={{ padding: '0.5rem 0.75rem', color: 'var(--text-muted)' }}>Contrast spread across tonal levels</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <td style={{ padding: '0.5rem 0.75rem', fontWeight: 600 }}>Median Intensity</td>
                    <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right', fontFamily: 'monospace' }}>{activeStats.median ?? 'N/A'}</td>
                    <td style={{ padding: '0.5rem 0.75rem', color: 'var(--text-muted)' }}>50th percentile distribution point</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <td style={{ padding: '0.5rem 0.75rem', fontWeight: 600 }}>Percentiles (p10 / p25 / p75 / p90)</td>
                    <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right', fontFamily: 'monospace' }}>
                      {activeStats.percentiles ? `${activeStats.percentiles.p10} / ${activeStats.percentiles.p25} / ${activeStats.percentiles.p75} / ${activeStats.percentiles.p90}` : 'N/A'}
                    </td>
                    <td style={{ padding: '0.5rem 0.75rem', color: 'var(--text-muted)' }}>Cumulative distribution quantiles</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <td style={{ padding: '0.5rem 0.75rem', fontWeight: 600 }}>Shannon Entropy</td>
                    <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right', fontFamily: 'monospace' }}>{activeStats.shannon_entropy ?? 'N/A'} b/px</td>
                    <td style={{ padding: '0.5rem 0.75rem', color: 'var(--text-muted)' }}>Information entropy of discrete probability density function</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <td style={{ padding: '0.5rem 0.75rem', fontWeight: 600 }}>Comb-Like Zero Gaps</td>
                    <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right', fontFamily: 'monospace' }}>{activeStats.comb_gaps_count ?? 'N/A'}</td>
                    <td style={{ padding: '0.5rem 0.75rem', color: 'var(--text-muted)' }}>Unoccupied intermediate bins (indicates non-linear tonal mapping)</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <td style={{ padding: '0.5rem 0.75rem', fontWeight: 600 }}>Shadow / Highlight Clipping</td>
                    <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right', fontFamily: 'monospace' }}>
                      {activeStats.shadow_clipping_pct !== undefined ? `${activeStats.shadow_clipping_pct}% / ${activeStats.highlight_clipping_pct}%` : 'N/A'}
                    </td>
                    <td style={{ padding: '0.5rem 0.75rem', color: 'var(--text-muted)' }}>Percentage of total pixels pinned to boundary extrema</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Scientific Limitations Notice */}
          <div style={{ padding: '0.85rem', background: 'rgba(2, 132, 199, 0.06)', border: '1px solid rgba(2, 132, 199, 0.2)', borderRadius: '6px', fontSize: '0.8rem' }}>
            <strong style={{ color: '#0284c7' }}>FORENSIC LIMITATION & SCIENTIFIC PRINCIPLE:</strong>
            <p style={{ margin: '0.35rem 0 0 0', color: 'var(--text-main)', lineHeight: 1.45 }}>
              Intensity distributions depend intrinsically on scene illuminants, exposure calibration, dynamic range compression, and camera tone curve profiles.
              Comb-like gaps and clipping occur legitimately through global color grading and auto-contrast adjustments; they do <em>NOT</em> by themselves prove intentional deceptive forgery or localized tampering.
            </p>
          </div>
        </>
      )}
    </div>
  );
};

export default HistogramViewer;
