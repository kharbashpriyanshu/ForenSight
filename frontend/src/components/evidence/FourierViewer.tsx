import React, { useState } from 'react';
import { fetchApi } from '../../api';
import AuthenticatedImage from './AuthenticatedImage';

interface FourierViewerProps {
  evidenceId: number;
  containerFormat: string;
  fourierResult?: any;
  onRefresh?: () => void;
}

export const FourierViewer: React.FC<FourierViewerProps> = ({
  evidenceId,
  containerFormat,
  fourierResult,
  onRefresh,
}) => {
  const [running, setRunning] = useState<boolean>(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const handleRunAnalysis = async () => {
    setRunning(true);
    setActionError(null);
    try {
      const res = await fetchApi(`/evidence/${evidenceId}/analysis/fourier`, {
        method: 'POST',
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || 'Fourier analysis execution failed.');
      }
      if (onRefresh) onRefresh();
    } catch (err: any) {
      setActionError(err.message || 'Failed to trigger Fourier 2D frequency analysis.');
    } finally {
      setRunning(false);
    }
  };

  const findings = fourierResult?.structured_findings || {};
  const energyRatios = findings.radial_energy_ratios || {};
  const peaks = findings.dominant_peaks || [];
  const artifacts = findings.artifacts || {};
  const isCompleted = fourierResult && fourierResult.status === 'completed';

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <h3 style={{ margin: 0, fontSize: '1.15rem', color: 'var(--text-main)' }}>
              Fourier 2D Frequency Spectrum Analysis
            </h3>
            <span style={{ fontSize: '0.7rem', padding: '0.15rem 0.5rem', background: '#7c3aed', color: '#fff', borderRadius: '4px', fontWeight: 600 }}>
              FOURIER v1.0.0
            </span>
            {containerFormat && (
              <span style={{ fontSize: '0.7rem', padding: '0.15rem 0.5rem', background: 'var(--surface-color-light)', border: '1px solid var(--border-color)', color: 'var(--text-muted)', borderRadius: '4px', fontWeight: 600 }}>
                {containerFormat.toUpperCase()}
              </span>
            )}
          </div>
          <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Evaluates 2D FFT magnitude spectrum, radial frequency energy bands, and discrete periodic harmonic spikes.
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
            {running ? 'Computing 2D FFT...' : isCompleted ? 'Re-run Fourier Analysis' : 'Execute Fourier 2D Analysis'}
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
            No 2D frequency spectrum data available for this evidence item. Click "Execute Fourier 2D Analysis" above.
          </p>
        </div>
      ) : (
        <>
          {/* Key Metric Highlights */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.85rem' }}>
            <div style={{ padding: '0.85rem', background: 'var(--surface-color-light)', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
                Low Freq Energy (0-15%)
              </div>
              <div style={{ fontSize: '1.35rem', fontWeight: 700, color: '#0284c7', marginTop: '0.2rem' }}>
                {energyRatios.low_frequency !== undefined ? `${(energyRatios.low_frequency * 100).toFixed(1)}%` : 'N/A'}
              </div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                Base illumination & macroscopic structures
              </div>
            </div>

            <div style={{ padding: '0.85rem', background: 'var(--surface-color-light)', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
                Mid Freq Energy (15-50%)
              </div>
              <div style={{ fontSize: '1.35rem', fontWeight: 700, color: '#7c3aed', marginTop: '0.2rem' }}>
                {energyRatios.mid_frequency !== undefined ? `${(energyRatios.mid_frequency * 100).toFixed(1)}%` : 'N/A'}
              </div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                Object contours & intermediate textures
              </div>
            </div>

            <div style={{ padding: '0.85rem', background: 'var(--surface-color-light)', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
                High Freq Energy (50-100%)
              </div>
              <div style={{ fontSize: '1.35rem', fontWeight: 700, color: '#db2777', marginTop: '0.2rem' }}>
                {energyRatios.high_frequency !== undefined ? `${(energyRatios.high_frequency * 100).toFixed(1)}%` : 'N/A'}
              </div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                Fine detail, noise floor & sharp edges
              </div>
            </div>

            <div style={{ padding: '0.85rem', background: 'var(--surface-color-light)', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
                Periodic Harmonic Peaks
              </div>
              <div style={{ fontSize: '1.35rem', fontWeight: 700, color: peaks.length > 0 ? '#ea580c' : '#16a34a', marginTop: '0.2rem' }}>
                {peaks.length}
              </div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                Non-DC spectral spikes ≥ 3.0σ
              </div>
            </div>
          </div>

          {/* 2D Frequency Spectrum Artifact */}
          {artifacts.fourier_spectrum_plot && (
            <div style={{ background: 'var(--surface-color-light)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <h4 style={{ margin: 0, fontSize: '0.95rem', color: 'var(--text-main)' }}>2D Fourier Log Magnitude Spectrum ln(1+|F|)</h4>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Dashed Rings: 15% & 50% Radial Bands | Red Markers: Periodic Peaks</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'center', background: '#fff', borderRadius: '6px', overflow: 'hidden', padding: '0.5rem' }}>
                <AuthenticatedImage
                  src={`/api/artifacts/${artifacts.fourier_spectrum_plot}`}
                  alt="Fourier 2D Magnitude Spectrum"
                  style={{ maxHeight: '480px', width: 'auto', objectFit: 'contain' }}
                />
              </div>
            </div>
          )}

          {/* Dominant Periodic Peaks Table */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <h4 style={{ margin: 0, fontSize: '0.95rem', color: 'var(--text-main)' }}>
              Detected Periodic Harmonic Peaks ({peaks.length})
            </h4>
            {peaks.length === 0 ? (
              <div style={{ padding: '1rem', textAlign: 'center', background: 'var(--surface-color-light)', borderRadius: '6px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                No isolated periodic frequency peaks detected above the 3.0σ spectral prominence threshold. Frequency spectrum is continuous.
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                  <thead>
                    <tr style={{ background: 'var(--surface-color-light)', borderBottom: '1px solid var(--border-color)' }}>
                      <th style={{ textAlign: 'left', padding: '0.5rem', color: 'var(--text-muted)' }}>Peak Index</th>
                      <th style={{ textAlign: 'left', padding: '0.5rem', color: 'var(--text-muted)' }}>Coordinates (u, v)</th>
                      <th style={{ textAlign: 'right', padding: '0.5rem', color: 'var(--text-muted)' }}>Normalized Radius</th>
                      <th style={{ textAlign: 'right', padding: '0.5rem', color: 'var(--text-muted)' }}>Orientation</th>
                      <th style={{ textAlign: 'right', padding: '0.5rem', color: 'var(--text-muted)' }}>Magnitude</th>
                      <th style={{ textAlign: 'right', padding: '0.5rem', color: 'var(--text-muted)' }}>Prominence</th>
                    </tr>
                  </thead>
                  <tbody>
                    {peaks.map((pk: any, idx: number) => (
                      <tr key={idx} style={{ borderBottom: '1px solid var(--border-color)' }}>
                        <td style={{ padding: '0.5rem', fontWeight: 600 }}>#{idx + 1}</td>
                        <td style={{ padding: '0.5rem', fontFamily: 'monospace' }}>({pk.u}, {pk.v})</td>
                        <td style={{ padding: '0.5rem', textAlign: 'right', fontFamily: 'monospace' }}>{pk.normalized_radius}</td>
                        <td style={{ padding: '0.5rem', textAlign: 'right', fontFamily: 'monospace' }}>{pk.orientation_deg}°</td>
                        <td style={{ padding: '0.5rem', textAlign: 'right', fontFamily: 'monospace' }}>{pk.magnitude}</td>
                        <td style={{ padding: '0.5rem', textAlign: 'right', fontFamily: 'monospace', color: pk.prominence_sigma >= 5.0 ? '#ef4444' : '#ea580c', fontWeight: 600 }}>
                          {pk.prominence_sigma}σ
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Scientific Guardrail */}
          <div style={{ padding: '0.85rem', background: 'rgba(124, 58, 237, 0.06)', border: '1px solid rgba(124, 58, 237, 0.2)', borderRadius: '6px', fontSize: '0.8rem' }}>
            <strong style={{ color: '#7c3aed' }}>FORENSIC LIMITATION & SCIENTIFIC PRINCIPLE:</strong>
            <p style={{ margin: '0.35rem 0 0 0', color: 'var(--text-main)', lineHeight: 1.45 }}>
              Periodic frequency peaks indicate spatial periodicity in the luminance signal. Such harmonics arise routinely from legitimate physical sources:
              halftone print patterns, textiles, repeated architectural lattices, and sensor color filter arrays (Bayer pattern CFAs).
              The presence of periodic peaks does <em>NOT</em> by itself establish image forgery or manipulation.
            </p>
          </div>
        </>
      )}
    </div>
  );
};

export default FourierViewer;
