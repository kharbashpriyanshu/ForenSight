import React, { useState } from 'react';
import { fetchApi } from '../../api';
import AuthenticatedImage from './AuthenticatedImage';

interface CloneKeypointViewerProps {
  evidenceId: number;
  containerFormat: string;
  cloneKeypointResult?: any;
  onRefresh?: () => void;
}

export const CloneKeypointViewer: React.FC<CloneKeypointViewerProps> = ({
  evidenceId,
  containerFormat,
  cloneKeypointResult,
  onRefresh,
}) => {
  const [running, setRunning] = useState<boolean>(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'map' | 'diagnostic'>('map');

  const handleRunAnalysis = async () => {
    setRunning(true);
    setActionError(null);
    try {
      const res = await fetchApi(`/evidence/${evidenceId}/analysis/clone-keypoint`, {
        method: 'POST',
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || 'Keypoint-based clone analysis execution failed.');
      }
      if (onRefresh) onRefresh();
    } catch (err: any) {
      setActionError(err.message || 'Failed to trigger Keypoint-based clone analysis.');
    } finally {
      setRunning(false);
    }
  };

  const findings = cloneKeypointResult?.structured_findings || {};
  const affineModel = findings.affine_model || null;
  const candidateRegions = findings.candidate_regions || [];
  const artifacts = findings.artifacts || {};
  const isCompleted = cloneKeypointResult && cloneKeypointResult.status === 'completed';

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <h3 style={{ margin: 0, fontSize: '1.15rem', color: 'var(--text-main)' }}>
              Keypoint-Based Geometric Clone Detection
            </h3>
            <span style={{ fontSize: '0.7rem', padding: '0.15rem 0.5rem', background: '#8b5cf6', color: '#fff', borderRadius: '4px', fontWeight: 600 }}>
              CLONE-KEYPOINT v1.0.0
            </span>
            {containerFormat && (
              <span style={{ fontSize: '0.7rem', padding: '0.15rem 0.5rem', background: 'var(--surface-color-light)', border: '1px solid var(--border-color)', color: 'var(--text-muted)', borderRadius: '4px', fontWeight: 600 }}>
                {containerFormat.toUpperCase()}
              </span>
            )}
          </div>
          <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Independent ORB keypoint extraction, Hamming distance self-matching, Lowe's ratio test, and affine RANSAC geometric consensus modeling.
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
            {running ? 'Evaluating RANSAC...' : isCompleted ? 'Re-run Keypoint Clone Analysis' : 'Execute Keypoint Clone Analysis'}
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
            No keypoint-based clone analysis data available. Click "Execute Keypoint Clone Analysis" above.
          </p>
        </div>
      ) : (
        <>
          {/* Key Metric Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '0.75rem' }}>
            <div style={{ padding: '0.85rem', background: 'var(--surface-color-light)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>ORB Keypoints</div>
              <div style={{ fontSize: '1.35rem', fontWeight: 700, color: 'var(--text-main)', marginTop: '0.25rem' }}>
                {findings.keypoint_count !== undefined ? findings.keypoint_count : '0'}
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                Max Features: {findings.parameters?.max_features || 1000}
              </div>
            </div>

            <div style={{ padding: '0.85rem', background: 'var(--surface-color-light)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Filtered Matches</div>
              <div style={{ fontSize: '1.35rem', fontWeight: 700, color: 'var(--text-main)', marginTop: '0.25rem' }}>
                {findings.filtered_match_count !== undefined ? findings.filtered_match_count : '0'}
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                Lowe's Ratio ≤ {findings.parameters?.ratio_threshold || 0.75}
              </div>
            </div>

            <div style={{ padding: '0.85rem', background: 'var(--surface-color-light)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>RANSAC Inliers</div>
              <div style={{ fontSize: '1.35rem', fontWeight: 700, color: findings.geometric_inlier_count >= 4 ? '#16a34a' : 'var(--text-main)', marginTop: '0.25rem' }}>
                {findings.geometric_inlier_count || 0}
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                Inlier Ratio: {findings.geometric_inlier_ratio !== undefined ? `${(findings.geometric_inlier_ratio * 100).toFixed(1)}%` : '0%'}
              </div>
            </div>

            <div style={{ padding: '0.85rem', background: 'var(--surface-color-light)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Candidate Regions</div>
              <div style={{ fontSize: '1.35rem', fontWeight: 700, color: candidateRegions.length > 0 ? '#ea580c' : '#16a34a', marginTop: '0.25rem' }}>
                {candidateRegions.length}
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                Geometric Consensus Pairs
              </div>
            </div>
          </div>

          {/* Affine Transformation Summary Card */}
          {affineModel && (
            <div style={{ padding: '0.85rem', background: 'var(--surface-color-light)', borderRadius: '8px', border: '1px solid var(--border-color)', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.75rem' }}>
              <div>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Estimated Scale</span>
                <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-main)', marginTop: '0.15rem' }}>
                  {affineModel.scale}x
                </div>
              </div>
              <div>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Rotation Angle</span>
                <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-main)', marginTop: '0.15rem' }}>
                  {affineModel.rotation_deg}°
                </div>
              </div>
              <div>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Translation Vector</span>
                <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-main)', marginTop: '0.15rem' }}>
                  ({affineModel.translation?.[0]}, {affineModel.translation?.[1]}) px
                </div>
              </div>
              <div>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Reprojection Error</span>
                <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#16a34a', marginTop: '0.15rem' }}>
                  {affineModel.mean_reprojection_error} px
                </div>
              </div>
            </div>
          )}

          {/* Visual Artifacts Tab Switcher */}
          <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
            <button
              onClick={() => setActiveTab('map')}
              style={{
                background: activeTab === 'map' ? '#8b5cf6' : 'transparent',
                color: activeTab === 'map' ? '#fff' : 'var(--text-muted)',
                border: 'none',
                padding: '0.35rem 0.8rem',
                borderRadius: '6px',
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Keypoint Match Map
            </button>
            <button
              onClick={() => setActiveTab('diagnostic')}
              style={{
                background: activeTab === 'diagnostic' ? '#8b5cf6' : 'transparent',
                color: activeTab === 'diagnostic' ? '#fff' : 'var(--text-muted)',
                border: 'none',
                padding: '0.35rem 0.8rem',
                borderRadius: '6px',
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Geometric Consensus Diagnostic
            </button>
          </div>

          {/* Artifact Renderer */}
          <div style={{ display: 'flex', justifyContent: 'center', background: '#f8fafc', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
            {activeTab === 'map' ? (
              artifacts.clone_keypoint_map ? (
                <AuthenticatedImage
                  src={`/api/v1/analysis/artifacts/${artifacts.clone_keypoint_map}`}
                  alt="Keypoint Clone Match Map"
                  style={{ maxWidth: '100%', maxHeight: '420px', objectFit: 'contain', borderRadius: '6px' }}
                />
              ) : (
                <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Match map artifact unavailable</span>
              )
            ) : (
              artifacts.clone_keypoint_analysis ? (
                <AuthenticatedImage
                  src={`/api/v1/analysis/artifacts/${artifacts.clone_keypoint_analysis}`}
                  alt="Keypoint Clone Diagnostic Plot"
                  style={{ maxWidth: '100%', maxHeight: '420px', objectFit: 'contain', borderRadius: '6px' }}
                />
              ) : (
                <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Diagnostic plot artifact unavailable</span>
              )
            )}
          </div>

          {/* Candidate Duplicated Regions Table */}
          {candidateRegions.length > 0 && (
            <div>
              <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '0.4rem' }}>
                Candidate Cloned Regions via Affine Consensus ({candidateRegions.length})
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                  <thead>
                    <tr style={{ background: 'var(--surface-color-light)', borderBottom: '1px solid var(--border-color)', textAlign: 'left' }}>
                      <th style={{ padding: '0.4rem 0.6rem' }}>Region ID</th>
                      <th style={{ padding: '0.4rem 0.6rem' }}>Source BBox [x1, y1, x2, y2]</th>
                      <th style={{ padding: '0.4rem 0.6rem' }}>Target BBox [x1, y1, x2, y2]</th>
                      <th style={{ padding: '0.4rem 0.6rem' }}>Inliers</th>
                      <th style={{ padding: '0.4rem 0.6rem' }}>Estimated Rotation</th>
                      <th style={{ padding: '0.4rem 0.6rem' }}>Estimated Scale</th>
                      <th style={{ padding: '0.4rem 0.6rem' }}>Reproj Error</th>
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
                        <td style={{ padding: '0.4rem 0.6rem', fontWeight: 600, color: '#16a34a' }}>
                          {reg.inlier_keypoint_count} pts
                        </td>
                        <td style={{ padding: '0.4rem 0.6rem' }}>
                          {reg.estimated_rotation_degrees}°
                        </td>
                        <td style={{ padding: '0.4rem 0.6rem' }}>
                          {reg.estimated_scale}x
                        </td>
                        <td style={{ padding: '0.4rem 0.6rem', color: '#2563eb' }}>
                          {reg.mean_reprojection_error} px
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
