import React, { useState } from 'react';
import { fetchApi } from '../../api';
import AuthenticatedImage from './AuthenticatedImage';

interface PRNUViewerProps {
  evidenceId: number;
  containerFormat: string;
  prnuResult?: any;
  onRefresh?: () => void;
}

export const PRNUViewer: React.FC<PRNUViewerProps> = ({
  evidenceId,
  containerFormat,
  prnuResult,
  onRefresh,
}) => {
  const [running, setRunning] = useState<boolean>(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'residual' | 'diagnostic' | 'metrics'>('residual');

  const handleRunAnalysis = async () => {
    setRunning(true);
    setActionError(null);
    try {
      const res = await fetchApi(`/evidence/${evidenceId}/analysis/prnu`, {
        method: 'POST',
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || 'PRNU analysis execution failed.');
      }
      if (onRefresh) onRefresh();
    } catch (err: any) {
      setActionError(err.message || 'Failed to trigger PRNU analysis.');
    } finally {
      setRunning(false);
    }
  };

  const findings = prnuResult?.structured_findings || {};
  const suitability = findings.suitability || {};
  const isCompleted = prnuResult && prnuResult.status === 'completed';

  const residualArtifact = prnuResult?.artifacts?.find((a: any) => a.filename?.includes('residual') || a.artifact_type === 'VISUALIZATION');
  const diagnosticArtifact = prnuResult?.artifacts?.find((a: any) => a.filename?.includes('analysis.png') || a.artifact_type === 'PLOT');

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <h3 style={{ margin: 0, fontSize: '1.15rem', color: 'var(--text-main)' }}>
              Photo-Response Non-Uniformity (PRNU) Sensor Noise
            </h3>
            <span style={{ fontSize: '0.7rem', padding: '0.15rem 0.5rem', background: '#0284c7', color: '#fff', borderRadius: '4px', fontWeight: 600 }}>
              PRNU v1.0.0
            </span>
            {containerFormat && (
              <span style={{ fontSize: '0.7rem', padding: '0.15rem 0.5rem', background: 'var(--surface-color-light)', border: '1px solid var(--border-color)', color: 'var(--text-muted)', borderRadius: '4px', fontWeight: 600 }}>
                {containerFormat.toUpperCase()}
              </span>
            )}
          </div>
          <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Extracts high-frequency sensor pattern noise residuals, evaluates empirical acquisition suitability, and suppresses readout banding.
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
            {running ? 'Extracting PRNU...' : isCompleted ? 'Re-run PRNU Analysis' : 'Execute PRNU Analysis'}
          </button>
        </div>
      </div>

      {actionError && (
        <div style={{ padding: '0.75rem', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid #ef4444', borderRadius: '6px', color: '#b91c1c', fontSize: '0.85rem' }}>
          {actionError}
        </div>
      )}

      {isCompleted ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Diagnostic Metrics Banner */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem' }}>
            <div style={{ padding: '0.75rem', background: 'var(--surface-color-light)', border: '1px solid var(--border-color)', borderRadius: '6px' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Suitability Status</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 700, color: suitability.status === 'SUITABLE' ? '#16a34a' : '#ea580c' }}>
                {suitability.status || 'N/A'}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                Index: {suitability.suitability_index !== undefined ? Number(suitability.suitability_index).toFixed(2) : 'N/A'} / 1.00
              </div>
            </div>

            <div style={{ padding: '0.75rem', background: 'var(--surface-color-light)', border: '1px solid var(--border-color)', borderRadius: '6px' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Residual Variance</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-main)' }}>
                {suitability.residual_variance !== undefined ? Number(suitability.residual_variance).toFixed(5) : 'N/A'}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                Energy: {suitability.residual_energy !== undefined ? Number(suitability.residual_energy).toFixed(5) : 'N/A'}
              </div>
            </div>

            <div style={{ padding: '0.75rem', background: 'var(--surface-color-light)', border: '1px solid var(--border-color)', borderRadius: '6px' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Dynamic Range</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-main)' }}>
                {suitability.dynamic_range !== undefined ? `${suitability.dynamic_range} / 255` : 'N/A'}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                Saturated: {suitability.saturated_ratio !== undefined ? `${(suitability.saturated_ratio * 100).toFixed(1)}%` : '0%'}
              </div>
            </div>

            <div style={{ padding: '0.75rem', background: 'var(--surface-color-light)', border: '1px solid var(--border-color)', borderRadius: '6px' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Camera Identification</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 700, color: findings.match_status === 'CONSISTENT' ? '#16a34a' : 'var(--text-muted)' }}>
                {findings.match_status || 'NOT_ESTIMATED'}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                {findings.correlation !== null && findings.correlation !== undefined ? `Correlation: ${Number(findings.correlation).toFixed(4)}` : 'Residual Extracted'}
              </div>
            </div>
          </div>

          {/* View Tab Selector */}
          <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
            <button
              onClick={() => setActiveTab('residual')}
              style={{
                background: activeTab === 'residual' ? 'var(--surface-color-light)' : 'transparent',
                border: 'none',
                borderBottom: activeTab === 'residual' ? '2px solid #0284c7' : 'none',
                padding: '0.4rem 0.8rem',
                fontSize: '0.85rem',
                fontWeight: 600,
                color: activeTab === 'residual' ? 'var(--text-main)' : 'var(--text-muted)',
                cursor: 'pointer',
              }}
            >
              PRNU Residual Map (W)
            </button>
            <button
              onClick={() => setActiveTab('diagnostic')}
              style={{
                background: activeTab === 'diagnostic' ? 'var(--surface-color-light)' : 'transparent',
                border: 'none',
                borderBottom: activeTab === 'diagnostic' ? '2px solid #0284c7' : 'none',
                padding: '0.4rem 0.8rem',
                fontSize: '0.85rem',
                fontWeight: 600,
                color: activeTab === 'diagnostic' ? 'var(--text-main)' : 'var(--text-muted)',
                cursor: 'pointer',
              }}
            >
              Diagnostic Profiler
            </button>
            <button
              onClick={() => setActiveTab('metrics')}
              style={{
                background: activeTab === 'metrics' ? 'var(--surface-color-light)' : 'transparent',
                border: 'none',
                borderBottom: activeTab === 'metrics' ? '2px solid #0284c7' : 'none',
                padding: '0.4rem 0.8rem',
                fontSize: '0.85rem',
                fontWeight: 600,
                color: activeTab === 'metrics' ? 'var(--text-main)' : 'var(--text-muted)',
                cursor: 'pointer',
              }}
            >
              Suitability & Audit
            </button>
          </div>

          {/* Tab 1: Residual Map */}
          {activeTab === 'residual' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <div style={{ background: '#000', borderRadius: '6px', overflow: 'hidden', display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '340px' }}>
                {residualArtifact ? (
                  <AuthenticatedImage
                    src={`/api/artifacts/${residualArtifact.file_path || residualArtifact.filename}`}
                    alt="PRNU Noise Residual Map"
                    style={{ maxHeight: '480px', width: 'auto', objectFit: 'contain' }}
                  />
                ) : (
                  <div style={{ color: '#94a3b8', fontSize: '0.85rem' }}>Residual map artifact unavailable.</div>
                )}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                Normalized spatial representation of sensor noise residual W = I - F(I) with zero-mean row/column demosaicing artifact suppression.
              </div>
            </div>
          )}

          {/* Tab 2: Diagnostic Profiler */}
          {activeTab === 'diagnostic' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <div style={{ background: '#000', borderRadius: '6px', overflow: 'hidden', display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '340px' }}>
                {diagnosticArtifact ? (
                  <AuthenticatedImage
                    src={`/api/artifacts/${diagnosticArtifact.file_path || diagnosticArtifact.filename}`}
                    alt="PRNU Diagnostic Plots"
                    style={{ maxHeight: '480px', width: 'auto', objectFit: 'contain' }}
                  />
                ) : (
                  <div style={{ color: '#94a3b8', fontSize: '0.85rem' }}>Diagnostic plot artifact unavailable.</div>
                )}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                Residual amplitude distribution, suitability index meter, and zero-mean row/column readout suppression profiles.
              </div>
            </div>
          )}

          {/* Tab 3: Metrics & Scientific Audit */}
          {activeTab === 'metrics' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div style={{ padding: '0.75rem', background: 'var(--surface-color-light)', border: '1px solid var(--border-color)', borderRadius: '6px' }}>
                <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.9rem', color: 'var(--text-main)' }}>Forensic Interpretation</h4>
                <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                  {suitability.notes || 'Sensor pattern noise extracted successfully.'}
                </p>
              </div>

              <table style={{ width: '100%', fontSize: '0.85rem', borderCollapse: 'collapse', textAlign: 'left' }}>
                <tbody>
                  <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <td style={{ padding: '0.5rem', color: 'var(--text-muted)' }}>Suitability Index</td>
                    <td style={{ padding: '0.5rem', fontWeight: 600 }}>{suitability.suitability_index ?? 'N/A'}</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <td style={{ padding: '0.5rem', color: 'var(--text-muted)' }}>Saturated Pixel Ratio</td>
                    <td style={{ padding: '0.5rem', fontWeight: 600 }}>{suitability.saturated_ratio !== undefined ? `${(suitability.saturated_ratio * 100).toFixed(2)}%` : 'N/A'}</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <td style={{ padding: '0.5rem', color: 'var(--text-muted)' }}>Residual Variance</td>
                    <td style={{ padding: '0.5rem', fontWeight: 600 }}>{suitability.residual_variance ?? 'N/A'}</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <td style={{ padding: '0.5rem', color: 'var(--text-muted)' }}>Residual Energy</td>
                    <td style={{ padding: '0.5rem', fontWeight: 600 }}>{suitability.residual_energy ?? 'N/A'}</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <td style={{ padding: '0.5rem', color: 'var(--text-muted)' }}>Adaptive Filter Window</td>
                    <td style={{ padding: '0.5rem', fontWeight: 600 }}>{findings.parameters?.filter_window ?? 5}x{findings.parameters?.filter_window ?? 5} (sigma={findings.parameters?.filter_sigma ?? 1.5})</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <div style={{ textAlign: 'center', padding: '2rem 1rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
          PRNU sensor noise residual has not been extracted for this evidence yet. Click <strong>Execute PRNU Analysis</strong> to begin.
        </div>
      )}
    </div>
  );
};

export default PRNUViewer;
