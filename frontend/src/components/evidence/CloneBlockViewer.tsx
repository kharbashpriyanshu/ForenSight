import React, { useState } from 'react';
import { fetchApi } from '../../api';
import AuthenticatedImage from './AuthenticatedImage';

interface CloneBlockViewerProps {
  evidenceId: number;
  containerFormat: string;
  cloneBlockResult?: any;
  onRefresh?: () => void;
}

export const CloneBlockViewer: React.FC<CloneBlockViewerProps> = ({
  evidenceId,
  containerFormat,
  cloneBlockResult,
  onRefresh,
}) => {
  const [running, setRunning] = useState<boolean>(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'map' | 'diagnostic'>('map');

  const handleRunAnalysis = async () => {
    setRunning(true);
    setActionError(null);
    try {
      const res = await fetchApi(`/evidence/${evidenceId}/analysis/clone-block`, {
        method: 'POST',
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || 'Block-based clone analysis execution failed.');
      }
      if (onRefresh) onRefresh();
    } catch (err: any) {
      setActionError(err.message || 'Failed to trigger Block-based clone analysis.');
    } finally {
      setRunning(false);
    }
  };

  const findings = cloneBlockResult?.structured_findings || {};
  const candidateRegions = findings.candidate_regions || [];
  const artifacts = findings.artifacts || {};
  const isCompleted = cloneBlockResult && cloneBlockResult.status === 'completed';

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <h3 style={{ margin: 0, fontSize: '1.15rem', color: 'var(--text-main)' }}>
              Dense Block-Based Clone Detection
            </h3>
            <span style={{ fontSize: '0.7rem', padding: '0.15rem 0.5rem', background: '#3b82f6', color: '#fff', borderRadius: '4px', fontWeight: 600 }}>
              CLONE-BLOCK v1.0.0
            </span>
            {containerFormat && (
              <span style={{ fontSize: '0.7rem', padding: '0.15rem 0.5rem', background: 'var(--surface-color-light)', border: '1px solid var(--border-color)', color: 'var(--text-muted)', borderRadius: '4px', fontWeight: 600 }}>
                {containerFormat.toUpperCase()}
              </span>
            )}
          </div>
          <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Sliding-window block decomposition, 2D DCT feature vectors, lexicographical similarity sorting, and displacement vector clustering.
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
            {running ? 'Evaluating Blocks...' : isCompleted ? 'Re-run Block Clone Analysis' : 'Execute Block Clone Analysis'}
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
            No block-based clone analysis data available. Click "Execute Block Clone Analysis" above.
          </p>
        </div>
      ) : (
        <>
          {/* Key Metric Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '0.75rem' }}>
            <div style={{ padding: '0.85rem', background: 'var(--surface-color-light)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Matched Pairs</div>
              <div style={{ fontSize: '1.35rem', fontWeight: 700, color: 'var(--text-main)', marginTop: '0.25rem' }}>
                {findings.total_matches !== undefined ? findings.total_matches : '0'}
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                Cosine Sim ≥ {findings.parameters?.similarity_threshold || 0.96}
              </div>
            </div>

            <div style={{ padding: '0.85rem', background: 'var(--surface-color-light)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Candidate Regions</div>
              <div style={{ fontSize: '1.35rem', fontWeight: 700, color: candidateRegions.length > 0 ? '#ea580c' : '#16a34a', marginTop: '0.25rem' }}>
                {candidateRegions.length}
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                Displacement Clusters
              </div>
            </div>

            <div style={{ padding: '0.85rem', background: 'var(--surface-color-light)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Max Cluster Size</div>
              <div style={{ fontSize: '1.35rem', fontWeight: 700, color: findings.max_cluster_size >= 3 ? '#2563eb' : 'var(--text-main)', marginTop: '0.25rem' }}>
                {findings.max_cluster_size || 0}
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                Supporting Block Pairs
              </div>
            </div>

            <div style={{ padding: '0.85rem', background: 'var(--surface-color-light)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Active Blocks</div>
              <div style={{ fontSize: '1.35rem', fontWeight: 700, color: 'var(--text-main)', marginTop: '0.25rem' }}>
                {findings.active_blocks_count || 0}
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                Window: {findings.parameters?.block_size || 16}px (Stride: {findings.parameters?.stride || 8}px)
              </div>
            </div>
          </div>

          {/* Visual Artifacts Tab Switcher */}
          <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
            <button
              onClick={() => setActiveTab('map')}
              style={{
                background: activeTab === 'map' ? '#3b82f6' : 'transparent',
                color: activeTab === 'map' ? '#fff' : 'var(--text-muted)',
                border: 'none',
                padding: '0.35rem 0.8rem',
                borderRadius: '6px',
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Clone Match Overlay Map
            </button>
            <button
              onClick={() => setActiveTab('diagnostic')}
              style={{
                background: activeTab === 'diagnostic' ? '#3b82f6' : 'transparent',
                color: activeTab === 'diagnostic' ? '#fff' : 'var(--text-muted)',
                border: 'none',
                padding: '0.35rem 0.8rem',
                borderRadius: '6px',
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Cluster & Histogram Diagnostic
            </button>
          </div>

          {/* Artifact Renderer */}
          <div style={{ display: 'flex', justifyContent: 'center', background: '#f8fafc', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
            {activeTab === 'map' ? (
              artifacts.clone_block_map ? (
                <AuthenticatedImage
                  src={`/api/v1/analysis/artifacts/${artifacts.clone_block_map}`}
                  alt="Block Clone Match Map"
                  style={{ maxWidth: '100%', maxHeight: '420px', objectFit: 'contain', borderRadius: '6px' }}
                />
              ) : (
                <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Clone match map artifact unavailable</span>
              )
            ) : (
              artifacts.clone_block_analysis ? (
                <AuthenticatedImage
                  src={`/api/v1/analysis/artifacts/${artifacts.clone_block_analysis}`}
                  alt="Block Clone Diagnostic Visualization"
                  style={{ maxWidth: '100%', maxHeight: '420px', objectFit: 'contain', borderRadius: '6px' }}
                />
              ) : (
                <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Diagnostic visualization artifact unavailable</span>
              )
            )}
          </div>

          {/* Candidate Duplicated Regions Table */}
          {candidateRegions.length > 0 && (
            <div>
              <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '0.4rem' }}>
                Candidate Duplicated Regions ({candidateRegions.length})
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                  <thead>
                    <tr style={{ background: 'var(--surface-color-light)', borderBottom: '1px solid var(--border-color)', textAlign: 'left' }}>
                      <th style={{ padding: '0.4rem 0.6rem' }}>Region ID</th>
                      <th style={{ padding: '0.4rem 0.6rem' }}>Source Bounding Box [x1, y1, x2, y2]</th>
                      <th style={{ padding: '0.4rem 0.6rem' }}>Target Bounding Box [x1, y1, x2, y2]</th>
                      <th style={{ padding: '0.4rem 0.6rem' }}>Supporting Pairs</th>
                      <th style={{ padding: '0.4rem 0.6rem' }}>Displacement (Δx, Δy)</th>
                      <th style={{ padding: '0.4rem 0.6rem' }}>Mean Similarity</th>
                    </tr>
                  </thead>
                  <tbody>
                    {candidateRegions.map((reg: any, i: number) => (
                      <tr key={i} style={{ borderBottom: '1px solid var(--border-color)' }}>
                        <td style={{ padding: '0.4rem 0.6rem', fontWeight: 600 }}>{reg.region_id}</td>
                        <td style={{ padding: '0.4rem 0.6rem', fontFamily: 'monospace' }}>
                          [{reg.source_bounding_box?.join(', ')}]
                        </td>
                        <td style={{ padding: '0.4rem 0.6rem', fontFamily: 'monospace' }}>
                          [{reg.target_bounding_box?.join(', ')}]
                        </td>
                        <td style={{ padding: '0.4rem 0.6rem', fontWeight: 600, color: '#2563eb' }}>
                          {reg.supporting_pairs_count}
                        </td>
                        <td style={{ padding: '0.4rem 0.6rem' }}>
                          ({reg.nominal_displacement?.[0]}, {reg.nominal_displacement?.[1]}) px
                        </td>
                        <td style={{ padding: '0.4rem 0.6rem', color: '#16a34a' }}>
                          {reg.mean_similarity !== undefined ? reg.mean_similarity.toFixed(4) : 'N/A'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
