import React, { useState } from 'react';
import { fetchApi } from '../../api';
import AuthenticatedImage from './AuthenticatedImage';

interface CompressionHistoryViewerProps {
  evidenceId: number;
  containerFormat: string;
  ghostResult?: any;
  adjpegResult?: any;
  nadjpegResult?: any;
  onRefresh?: () => void;
}

export const CompressionHistoryViewer: React.FC<CompressionHistoryViewerProps> = ({
  evidenceId,
  containerFormat,
  ghostResult,
  adjpegResult,
  nadjpegResult,
  onRefresh,
}) => {
  const [activeTab, setActiveTab] = useState<'ghost' | 'adjpeg' | 'nadjpeg'>('ghost');
  const [runningEngine, setRunningEngine] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const isJpeg = ['JPEG', 'JPG'].includes((containerFormat || '').toUpperCase());

  const handleRunAnalysis = async (engineSlug: string) => {
    setRunningEngine(engineSlug);
    setActionError(null);
    try {
      const res = await fetchApi(`/evidence/${evidenceId}/analysis/${engineSlug}`, {
        method: 'POST',
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || `Analysis ${engineSlug} failed.`);
      }
      if (onRefresh) onRefresh();
    } catch (err: any) {
      setActionError(err.message || 'Analysis trigger failed.');
    } finally {
      setRunningEngine(null);
    }
  };

  // Guardrail for non-JPEG
  if (!isJpeg) {
    return (
      <div className="card" style={{ borderLeft: '4px solid #f59e0b' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
          <h3 style={{ margin: 0, fontSize: '1.15rem' }}>JPEG Compression History Forensics (V4 Step 3)</h3>
          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#f59e0b', background: 'rgba(245, 158, 11, 0.1)', padding: '0.2rem 0.6rem', borderRadius: '4px' }}>
            NOT APPLICABLE ({containerFormat.toUpperCase()})
          </span>
        </div>
        <div style={{ padding: '0.85rem', background: 'rgba(245, 158, 11, 0.08)', border: '1px solid rgba(245, 158, 11, 0.3)', borderRadius: '6px', fontSize: '0.85rem' }}>
          <strong style={{ color: '#f59e0b' }}>SCIENTIFIC GUARDRAIL NOTICE:</strong>
          <p style={{ margin: '0.4rem 0 0 0', color: 'var(--text-main)', lineHeight: 1.4 }}>
            Compression history methods (JPEG Ghost, ADJPEG, NADJPEG) evaluate Discrete Cosine Transform (DCT) block quantization cycles.
            Non-JPEG containers (such as <strong>{containerFormat.toUpperCase()}</strong>) do not possess lossy DCT compression histories and cannot be evaluated.
            Inapplicability is a mathematical constraint, <em>NOT</em> negative evidence of manipulation or proof of authenticity.
          </p>
        </div>
      </div>
    );
  }

  const ghostFindings = ghostResult?.structured_findings || {};
  const adjpegFindings = adjpegResult?.structured_findings || {};
  const nadjpegFindings = nadjpegResult?.structured_findings || {};

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Header & Trigger Buttons */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
            <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#ec4899', background: 'rgba(236, 72, 153, 0.1)', padding: '0.15rem 0.5rem', borderRadius: '4px' }}>
              V4 COMPRESSION FORENSICS
            </span>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>DCT Quantization Cycle Analysis</span>
          </div>
          <h3 style={{ margin: 0, fontSize: '1.25rem' }}>JPEG Compression History & Double-Compression Analysis</h3>
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button
            className="secondary-button"
            onClick={() => handleRunAnalysis('jpeg-ghost')}
            disabled={runningEngine === 'jpeg-ghost'}
            style={{ fontSize: '0.75rem', padding: '0.4rem 0.75rem' }}
          >
            {runningEngine === 'jpeg-ghost' ? 'Evaluating Ghost Sweep...' : 'Run JPEG Ghost'}
          </button>
          <button
            className="secondary-button"
            onClick={() => handleRunAnalysis('adjpeg')}
            disabled={runningEngine === 'adjpeg'}
            style={{ fontSize: '0.75rem', padding: '0.4rem 0.75rem' }}
          >
            {runningEngine === 'adjpeg' ? 'Analyzing ADJPEG...' : 'Run ADJPEG'}
          </button>
          <button
            className="secondary-button"
            onClick={() => handleRunAnalysis('nadjpeg')}
            disabled={runningEngine === 'nadjpeg'}
            style={{ fontSize: '0.75rem', padding: '0.4rem 0.75rem' }}
          >
            {runningEngine === 'nadjpeg' ? 'Analyzing NADJPEG...' : 'Run NADJPEG'}
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
          onClick={() => setActiveTab('ghost')}
          style={{
            background: activeTab === 'ghost' ? 'var(--primary-color)' : 'transparent',
            color: activeTab === 'ghost' ? '#fff' : 'var(--text-muted)',
            border: 'none',
            borderRadius: '4px',
            padding: '0.45rem 0.9rem',
            cursor: 'pointer',
            fontSize: '0.85rem',
            fontWeight: 600,
          }}
        >
          👻 JPEG Ghost (Candidate: {ghostFindings.candidate_quality ? `Q~${ghostFindings.candidate_quality}` : 'Unrun'})
        </button>
        <button
          onClick={() => setActiveTab('adjpeg')}
          style={{
            background: activeTab === 'adjpeg' ? 'var(--primary-color)' : 'transparent',
            color: activeTab === 'adjpeg' ? '#fff' : 'var(--text-muted)',
            border: 'none',
            borderRadius: '4px',
            padding: '0.45rem 0.9rem',
            cursor: 'pointer',
            fontSize: '0.85rem',
            fontWeight: 600,
          }}
        >
          📐 Aligned Double JPEG (ADJPEG: {adjpegFindings.periodic_modes_count !== undefined ? `${adjpegFindings.periodic_modes_count} Modes` : 'Unrun'})
        </button>
        <button
          onClick={() => setActiveTab('nadjpeg')}
          style={{
            background: activeTab === 'nadjpeg' ? 'var(--primary-color)' : 'transparent',
            color: activeTab === 'nadjpeg' ? '#fff' : 'var(--text-muted)',
            border: 'none',
            borderRadius: '4px',
            padding: '0.45rem 0.9rem',
            cursor: 'pointer',
            fontSize: '0.85rem',
            fontWeight: 600,
          }}
        >
          🔀 Non-Aligned Double JPEG (NADJPEG: {nadjpegFindings.candidate_shift_offset ? `(${nadjpegFindings.candidate_shift_offset.row_shift},${nadjpegFindings.candidate_shift_offset.col_shift})` : 'Unrun'})
        </button>
      </div>

      {/* Tab 1: JPEG Ghost */}
      {activeTab === 'ghost' && (
        <div>
          {!ghostResult ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
              JPEG Ghost analysis has not been executed on this evidence. Click <strong>"Run JPEG Ghost"</strong> above.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {/* Summary Cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem' }}>
                <div style={{ background: 'var(--surface-color-light)', padding: '0.75rem', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>CANDIDATE QUALITY MINIMUM</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 700, marginTop: '0.2rem', color: '#10b981' }}>
                    Q ~ {ghostFindings.candidate_quality || 'N/A'}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    Sweep: {ghostFindings.quality_curve ? `${ghostFindings.quality_curve[0]?.quality} to ${ghostFindings.quality_curve[ghostFindings.quality_curve.length - 1]?.quality}` : 'N/A'}
                  </div>
                </div>

                <div style={{ background: 'var(--surface-color-light)', padding: '0.75rem', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>CANDIDATE DIVERGENT REGIONS</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 700, marginTop: '0.2rem', color: ghostFindings.candidate_regions_count > 0 ? '#ef4444' : '#10b981' }}>
                    {ghostFindings.candidate_regions_count || 0} Zone(s)
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    {ghostFindings.candidate_regions_count > 0 ? 'Requires analyst review' : 'Uniform compression response'}
                  </div>
                </div>

                <div style={{ background: 'var(--surface-color-light)', padding: '0.75rem', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>RESIDUAL DISPERSION (IQR)</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 700, marginTop: '0.2rem' }}>
                    {ghostFindings.global_statistics?.iqr || 0}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    Median error: {ghostFindings.global_statistics?.median_difference || 0}
                  </div>
                </div>
              </div>

              {/* Quality Response Curve & Difference Map Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1rem', alignItems: 'start' }}>
                {/* Visual Difference Map */}
                <div style={{ background: 'var(--surface-color-light)', padding: '0.75rem', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                  <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                    JPEG GHOST DIFFERENCE MAP (Q~{ghostFindings.candidate_quality}):
                  </div>
                  {ghostFindings.artifacts?.jpeg_ghost_map ? (
                    <div style={{ background: '#000', borderRadius: '4px', overflow: 'hidden', textAlign: 'center' }}>
                      <AuthenticatedImage
                        src={`/api/artifacts/${ghostFindings.artifacts.jpeg_ghost_map}`}
                        alt="JPEG Ghost Map"
                        style={{ maxWidth: '100%', maxHeight: '300px', objectFit: 'contain' }}
                      />
                    </div>
                  ) : (
                    <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>No map artifact available.</div>
                  )}
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.4rem' }}>
                    Viridis scale: Dark blue (minimum residual difference) to yellow (high residual difference).
                  </div>
                </div>

                {/* Quality Response Curve Display */}
                <div style={{ background: 'var(--surface-color-light)', padding: '0.75rem', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                  <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                    GLOBAL QUALITY RESPONSE CURVE:
                  </div>
                  <div style={{ display: 'flex', gap: '4px', alignItems: 'flex-end', height: '180px', background: 'var(--surface-color)', padding: '8px 4px', borderRadius: '4px' }}>
                    {ghostFindings.quality_curve?.map((pt: any, idx: number) => {
                      const maxVal = Math.max(...ghostFindings.quality_curve.map((p: any) => p.mean_difference), 1.0);
                      const hPct = Math.max(10, Math.round((pt.mean_difference / maxVal) * 100));
                      const isCandidate = pt.quality === ghostFindings.candidate_quality;
                      return (
                        <div
                          key={idx}
                          style={{
                            flex: 1,
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'flex-end',
                            alignItems: 'center',
                            height: '100%',
                          }}
                          title={`Q=${pt.quality}: Mean Diff ${pt.mean_difference}`}
                        >
                          <div
                            style={{
                              width: '100%',
                              height: `${hPct}%`,
                              background: isCandidate ? '#10b981' : '#3b82f6',
                              borderRadius: '2px 2px 0 0',
                            }}
                          />
                          <span style={{ fontSize: '0.55rem', color: isCandidate ? '#10b981' : 'var(--text-muted)', marginTop: '4px', fontWeight: isCandidate ? 700 : 400 }}>
                            {pt.quality}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                    Green bar highlights the candidate quality minimum Q~{ghostFindings.candidate_quality}.
                  </div>
                </div>
              </div>

              {/* Candidate Regions List (if any) */}
              {ghostFindings.candidate_regions && ghostFindings.candidate_regions.length > 0 && (
                <div style={{ background: 'var(--surface-color-light)', padding: '0.75rem', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                  <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#ef4444', marginBottom: '0.4rem' }}>
                    CANDIDATE DIVERGENT REGIONS ({ghostFindings.candidate_regions.length}):
                  </div>
                  <div style={{ maxHeight: '160px', overflowY: 'auto' }}>
                    <table style={{ width: '100%', fontSize: '0.75rem', borderCollapse: 'collapse', textAlign: 'left' }}>
                      <thead style={{ background: 'var(--surface-color)' }}>
                        <tr>
                          <th style={{ padding: '0.35rem 0.5rem' }}>Region</th>
                          <th style={{ padding: '0.35rem 0.5rem' }}>Bounding Box (x, y, w, h)</th>
                          <th style={{ padding: '0.35rem 0.5rem' }}>Area</th>
                          <th style={{ padding: '0.35rem 0.5rem' }}>Contrast to Median</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ghostFindings.candidate_regions.map((reg: any) => (
                          <tr key={reg.region_id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                            <td style={{ padding: '0.3rem 0.5rem', fontWeight: 600 }}>Zone #{reg.region_id}</td>
                            <td style={{ padding: '0.3rem 0.5rem', fontFamily: 'monospace' }}>
                              [{reg.x}, {reg.y}, {reg.width}×{reg.height}]
                            </td>
                            <td style={{ padding: '0.3rem 0.5rem' }}>{reg.area_pixels} px</td>
                            <td style={{ padding: '0.3rem 0.5rem', color: reg.contrast_to_median > 0 ? '#f87171' : '#60a5fa' }}>
                              {reg.contrast_to_median > 0 ? `+${reg.contrast_to_median}` : reg.contrast_to_median}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Limitations Notice */}
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                <strong>Methodological Limitation:</strong> Local differences in JPEG Ghost response may stem naturally from complex textures, sharp edges, or smooth gradients. Spliced detection assumes the foreign fragment was originally saved at a different quality setting.
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab 2: ADJPEG */}
      {activeTab === 'adjpeg' && (
        <div>
          {!adjpegResult ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
              ADJPEG analysis has not been executed on this evidence. Click <strong>"Run ADJPEG"</strong> above.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {/* Summary Cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem' }}>
                <div style={{ background: 'var(--surface-color-light)', padding: '0.75rem', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>ALIGNED DOUBLE COMPRESSION TRACES</div>
                  <div style={{ fontSize: '1.15rem', fontWeight: 700, marginTop: '0.2rem', color: adjpegFindings.has_aligned_double_jpeg_traces ? '#f59e0b' : '#10b981' }}>
                    {adjpegFindings.has_aligned_double_jpeg_traces ? 'OBSERVED IN MODES' : 'NO CLEAR TRACES'}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    Periodic in {adjpegFindings.periodic_modes_count || 0} / {adjpegFindings.mode_evaluations?.length || 8} modes
                  </div>
                </div>

                <div style={{ background: 'var(--surface-color-light)', padding: '0.75rem', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>PEAK PERIODICITY RATIO</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 700, marginTop: '0.2rem' }}>
                    {adjpegFindings.max_periodicity_ratio || 1.0}×
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    Threshold: ≥ 3.20× for double quantization
                  </div>
                </div>

                <div style={{ background: 'var(--surface-color-light)', padding: '0.75rem', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>TOTAL EVALUATED BLOCKS</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 700, marginTop: '0.2rem' }}>
                    {adjpegFindings.total_blocks || 0} Blocks
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    8×8 luminance blocks
                  </div>
                </div>
              </div>

              {/* Diagnostic Plot Visualization */}
              <div style={{ background: 'var(--surface-color-light)', padding: '0.75rem', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                  DCT COEFFICIENT HISTOGRAM & FOURIER SPECTRUM DIAGNOSTIC:
                </div>
                {adjpegFindings.artifacts?.adjpeg_spectrum ? (
                  <div style={{ background: '#111827', borderRadius: '4px', overflow: 'hidden', textAlign: 'center' }}>
                    <AuthenticatedImage
                      src={`/api/artifacts/${adjpegFindings.artifacts.adjpeg_spectrum}`}
                      alt="ADJPEG Diagnostic Plot"
                      style={{ maxWidth: '100%', maxHeight: '320px', objectFit: 'contain' }}
                    />
                  </div>
                ) : (
                  <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>No plot artifact available.</div>
                )}
              </div>

              {/* Evaluated Modes Breakdown */}
              {adjpegFindings.mode_evaluations && (
                <div style={{ background: 'var(--surface-color-light)', padding: '0.75rem', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                  <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.4rem' }}>
                    EVALUATED AC FREQUENCY MODES:
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.5rem' }}>
                    {adjpegFindings.mode_evaluations.map((m: any, idx: number) => (
                      <div
                        key={idx}
                        style={{
                          padding: '0.5rem',
                          background: 'var(--surface-color)',
                          borderRadius: '4px',
                          border: `1px solid ${m.is_periodic ? '#f59e0b' : 'var(--border-color)'}`,
                          fontSize: '0.75rem',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600 }}>
                          <span>Mode {m.mode}</span>
                          <span style={{ color: m.is_periodic ? '#f59e0b' : '#10b981' }}>
                            {m.is_periodic ? 'PERIODIC' : 'NOMINAL'}
                          </span>
                        </div>
                        <div style={{ color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                          Ratio: <strong>{m.periodicity_ratio}×</strong> | Est. Period: <strong>{m.estimated_period}</strong>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                <strong>Methodological Limitation:</strong> ADJPEG requires the original and secondary compression grids to be strictly aligned. If the image was cropped or translated prior to recompression, use NADJPEG.
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab 3: NADJPEG */}
      {activeTab === 'nadjpeg' && (
        <div>
          {!nadjpegResult ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
              NADJPEG analysis has not been executed on this evidence. Click <strong>"Run NADJPEG"</strong> above.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {/* Summary Cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem' }}>
                <div style={{ background: 'var(--surface-color-light)', padding: '0.75rem', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>CANDIDATE GRID PHASE OFFSET</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 700, marginTop: '0.2rem', color: nadjpegFindings.has_non_aligned_double_jpeg_traces ? '#f59e0b' : '#10b981' }}>
                    {nadjpegFindings.candidate_shift_offset
                      ? `(Δr=${nadjpegFindings.candidate_shift_offset.row_shift}, Δc=${nadjpegFindings.candidate_shift_offset.col_shift})`
                      : 'None'}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    {nadjpegFindings.has_non_aligned_double_jpeg_traces ? 'Shifted primary grid detected' : 'Aligned or single-compressed'}
                  </div>
                </div>

                <div style={{ background: 'var(--surface-color-light)', padding: '0.75rem', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>PEAK BOUNDARY CONTRAST RATIO</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 700, marginTop: '0.2rem' }}>
                    {nadjpegFindings.peak_contrast_ratio || 1.0}×
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    Threshold: ≥ 1.35× across 64 phases
                  </div>
                </div>

                <div style={{ background: 'var(--surface-color-light)', padding: '0.75rem', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>ALIGNED (0,0) CONTRAST RATIO</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 700, marginTop: '0.2rem' }}>
                    {nadjpegFindings.aligned_contrast_ratio || 1.0}×
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    Zero-shift baseline
                  </div>
                </div>
              </div>

              {/* 64-Phase Grid Visualization Plot */}
              <div style={{ background: 'var(--surface-color-light)', padding: '0.75rem', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                  64-PHASE BOUNDARY DISCONTINUITY MATRIX [0..7]×[0..7]:
                </div>
                {nadjpegFindings.artifacts?.nadjpeg_matrix ? (
                  <div style={{ background: '#111827', borderRadius: '4px', overflow: 'hidden', textAlign: 'center' }}>
                    <AuthenticatedImage
                      src={`/api/artifacts/${nadjpegFindings.artifacts.nadjpeg_matrix}`}
                      alt="NADJPEG Matrix Plot"
                      style={{ maxWidth: '100%', maxHeight: '360px', objectFit: 'contain' }}
                    />
                  </div>
                ) : (
                  <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>No matrix artifact available.</div>
                )}
              </div>

              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                <strong>Methodological Limitation:</strong> Non-aligned double compression occurs when an image is cropped or translated prior to subsequent saving. If an image is cropped exactly by multiples of 8 pixels, the grid remains aligned and will not trigger NADJPEG.
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default CompressionHistoryViewer;
