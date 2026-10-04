import React, { useState, useRef } from 'react';
import { Compass, Eye, Layers, AlertTriangle, CheckCircle2, Info, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';
import AuthenticatedImage from './AuthenticatedImage';

interface VanishingPoint {
  vp_index: number;
  x: number;
  y: number;
  conforming_lines: number;
  mean_residual_deg: number;
  is_at_infinity: boolean;
}

interface HorizonLine {
  slope: number;
  intercept: number;
  camera_roll_deg: number;
  camera_vertical_fraction: number;
}

interface PerspectiveOutlier {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  length: number;
  min_angular_error_deg: number;
}

interface PerspectiveFindings {
  total_segments: number;
  clustered_segments: number;
  outlier_segments: number;
  outlier_ratio: number;
  perspective_inconsistency_score: number;
  verdict: string;
  vanishing_points: VanishingPoint[];
  horizon?: HorizonLine | null;
  outliers: PerspectiveOutlier[];
  interpretation: string;
  artifacts?: {
    perspective_map?: string;
  };
}

interface PerspectiveForensicsViewerProps {
  evidenceId: number;
  findings: PerspectiveFindings;
  rawImageSrc: string;
}

export const PerspectiveForensicsViewer: React.FC<PerspectiveForensicsViewerProps> = ({
  evidenceId: _evidenceId,
  findings,
  rawImageSrc,
}) => {
  const [showVPRays, setShowVPRays] = useState<boolean>(true);
  const [showHorizon, setShowHorizon] = useState<boolean>(true);
  const [showOutliers, setShowOutliers] = useState<boolean>(true);
  const [showBackendArtifact, setShowBackendArtifact] = useState<boolean>(false);
  const [selectedVP, setSelectedVP] = useState<number | null>(null);
  const [scale, setScale] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const containerRef = useRef<HTMLDivElement>(null);

  const vpColors = ['#38bdf8', '#f59e0b', '#10b981', '#a855f7'];

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
  };

  const handleMouseUp = () => setIsDragging(false);

  const resetView = () => {
    setScale(1);
    setPan({ x: 0, y: 0 });
  };

  const getVerdictBadge = (verdict: string) => {
    if (verdict === 'PERSPECTIVE_CONSISTENT') {
      return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', color: '#10b981', background: 'rgba(16, 185, 129, 0.1)', padding: '0.25rem 0.65rem', borderRadius: '9999px', fontSize: '0.8rem', fontWeight: 700 }}>
          <CheckCircle2 size={14} /> Consistent Projective Geometry
        </span>
      );
    }
    if (verdict === 'PERSPECTIVE_ANOMALY') {
      return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', color: '#ef4444', background: 'rgba(239, 68, 68, 0.12)', padding: '0.25rem 0.65rem', borderRadius: '9999px', fontSize: '0.8rem', fontWeight: 700 }}>
          <AlertTriangle size={14} /> Perspective Inconsistency Candidate
        </span>
      );
    }
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', color: '#f59e0b', background: 'rgba(245, 158, 11, 0.1)', padding: '0.25rem 0.65rem', borderRadius: '9999px', fontSize: '0.8rem', fontWeight: 700 }}>
        <Info size={14} /> {verdict.replace(/_/g, ' ')}
      </span>
    );
  };

  const backendArtifactUrl = findings.artifacts?.perspective_map
    ? `/api/artifacts/download?storage_path=${encodeURIComponent(findings.artifacts.perspective_map)}`
    : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Header bar */}
      <div style={{
        background: 'var(--surface-color)',
        border: '1px solid var(--border-color)',
        borderRadius: '10px',
        padding: '1.25rem',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '1rem'
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.35rem' }}>
            <Compass size={20} color="#b8872a" />
            <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-color)' }}>
              Projective Geometry & Vanishing Point Analysis
            </h3>
            {getVerdictBadge(findings.verdict)}
          </div>
          <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            Hough straight line extraction, RANSAC vanishing point clustering, and ground horizon estimation.
          </p>
        </div>

        {/* Quick Metrics Badges */}
        <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
          <div style={{ background: 'var(--surface-color-light)', padding: '0.4rem 0.75rem', borderRadius: '6px', textAlign: 'center', border: '1px solid var(--border-color)' }}>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Total Segments</div>
            <div style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-color)' }}>{findings.total_segments}</div>
          </div>
          <div style={{ background: 'var(--surface-color-light)', padding: '0.4rem 0.75rem', borderRadius: '6px', textAlign: 'center', border: '1px solid var(--border-color)' }}>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Conforming Lines</div>
            <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#10b981' }}>{findings.clustered_segments}</div>
          </div>
          <div style={{ background: 'var(--surface-color-light)', padding: '0.4rem 0.75rem', borderRadius: '6px', textAlign: 'center', border: '1px solid var(--border-color)' }}>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Outlier Violations</div>
            <div style={{ fontSize: '0.95rem', fontWeight: 700, color: findings.outlier_segments > 0 ? '#ef4444' : 'var(--text-color)' }}>
              {findings.outlier_segments} ({((findings.outlier_ratio || 0) * 100).toFixed(1)}%)
            </div>
          </div>
          <div style={{ background: 'var(--surface-color-light)', padding: '0.4rem 0.75rem', borderRadius: '6px', textAlign: 'center', border: '1px solid var(--border-color)' }}>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Camera Roll</div>
            <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#38bdf8' }}>
              {findings.horizon ? `${findings.horizon.camera_roll_deg > 0 ? '+' : ''}${findings.horizon.camera_roll_deg.toFixed(1)}°` : 'N/A'}
            </div>
          </div>
        </div>
      </div>

      {/* Main Workbench: Viewer + Inspector Sidebar */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 450px), 1fr))', gap: '1.25rem', alignItems: 'start' }}>
        {/* Interactive Viewer Viewport */}
        <div style={{
          background: '#0d131a',
          border: '1px solid var(--border-color)',
          borderRadius: '10px',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          position: 'relative'
        }}>
          {/* Viewport Toolbar */}
          <div style={{
            padding: '0.5rem 0.75rem',
            background: 'rgba(15, 23, 33, 0.85)',
            borderBottom: '1px solid var(--border-color)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            zIndex: 10
          }}>
            <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
              <button
                onClick={() => setShowVPRays(!showVPRays)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.3rem',
                  fontSize: '0.75rem',
                  padding: '0.3rem 0.6rem',
                  borderRadius: '5px',
                  border: showVPRays ? '1px solid #38bdf8' : '1px solid var(--border-color)',
                  background: showVPRays ? 'rgba(56, 189, 248, 0.15)' : 'transparent',
                  color: showVPRays ? '#38bdf8' : 'var(--text-muted)',
                  cursor: 'pointer'
                }}
              >
                <Layers size={13} /> VP Rays
              </button>

              <button
                onClick={() => setShowHorizon(!showHorizon)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.3rem',
                  fontSize: '0.75rem',
                  padding: '0.3rem 0.6rem',
                  borderRadius: '5px',
                  border: showHorizon ? '1px solid #b8872a' : '1px solid var(--border-color)',
                  background: showHorizon ? 'rgba(184, 135, 42, 0.15)' : 'transparent',
                  color: showHorizon ? '#b8872a' : 'var(--text-muted)',
                  cursor: 'pointer'
                }}
              >
                <Compass size={13} /> Horizon
              </button>

              <button
                onClick={() => setShowOutliers(!showOutliers)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.3rem',
                  fontSize: '0.75rem',
                  padding: '0.3rem 0.6rem',
                  borderRadius: '5px',
                  border: showOutliers ? '1px solid #ef4444' : '1px solid var(--border-color)',
                  background: showOutliers ? 'rgba(239, 68, 68, 0.15)' : 'transparent',
                  color: showOutliers ? '#ef4444' : 'var(--text-muted)',
                  cursor: 'pointer'
                }}
              >
                <AlertTriangle size={13} /> Outliers
              </button>

              {backendArtifactUrl && (
                <button
                  onClick={() => setShowBackendArtifact(!showBackendArtifact)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.3rem',
                    fontSize: '0.75rem',
                    padding: '0.3rem 0.6rem',
                    borderRadius: '5px',
                    border: showBackendArtifact ? '1px solid #10b981' : '1px solid var(--border-color)',
                    background: showBackendArtifact ? 'rgba(16, 185, 129, 0.15)' : 'transparent',
                    color: showBackendArtifact ? '#10b981' : 'var(--text-muted)',
                    cursor: 'pointer'
                  }}
                >
                  <Eye size={13} /> Engine Map
                </button>
              )}
            </div>

            <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
              <button
                onClick={() => setScale(s => Math.min(s * 1.25, 4.0))}
                style={{ background: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-muted)', padding: '0.3rem', borderRadius: '4px', cursor: 'pointer' }}
                title="Zoom In"
              >
                <ZoomIn size={14} />
              </button>
              <button
                onClick={() => setScale(s => Math.max(s / 1.25, 0.5))}
                style={{ background: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-muted)', padding: '0.3rem', borderRadius: '4px', cursor: 'pointer' }}
                title="Zoom Out"
              >
                <ZoomOut size={14} />
              </button>
              <button
                onClick={resetView}
                style={{ background: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-muted)', padding: '0.3rem', borderRadius: '4px', cursor: 'pointer' }}
                title="Reset Pan & Zoom"
              >
                <RotateCcw size={14} />
              </button>
            </div>
          </div>

          {/* Interactive Canvas Stage */}
          <div
            ref={containerRef}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            style={{
              height: '520px',
              cursor: isDragging ? 'grabbing' : 'grab',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
              position: 'relative',
              userSelect: 'none'
            }}
          >
            <div style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
              transformOrigin: 'center center',
              transition: isDragging ? 'none' : 'transform 0.1s ease-out',
              position: 'relative',
              display: 'inline-block'
            }}>
              {/* Target Image */}
              <AuthenticatedImage
                src={showBackendArtifact && backendArtifactUrl ? backendArtifactUrl : rawImageSrc}
                alt="Perspective Forensic Stage"
                style={{
                  maxWidth: '100%',
                  maxHeight: '480px',
                  display: 'block',
                  borderRadius: '4px',
                  boxShadow: '0 4px 20px rgba(0,0,0,0.5)'
                }}
              />
            </div>
          </div>
        </div>

        {/* Sidebar: Vanishing Points & Outlier Inspector */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Vanishing Points Card */}
          <div style={{
            background: 'var(--surface-color)',
            border: '1px solid var(--border-color)',
            borderRadius: '10px',
            padding: '1rem'
          }}>
            <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-color)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Layers size={16} color="#b8872a" /> Clustered Vanishing Points ({findings.vanishing_points.length})
            </h4>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {findings.vanishing_points.length === 0 ? (
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontStyle: 'italic', padding: '0.5rem' }}>
                  No dominant vanishing points detected.
                </div>
              ) : (
                findings.vanishing_points.map((vp, idx) => {
                  const col = vpColors[idx % vpColors.length];
                  const isSelected = selectedVP === vp.vp_index;
                  return (
                    <div
                      key={vp.vp_index}
                      onClick={() => setSelectedVP(isSelected ? null : vp.vp_index)}
                      style={{
                        padding: '0.6rem 0.75rem',
                        borderRadius: '6px',
                        background: isSelected ? 'var(--surface-color-light)' : 'rgba(255,255,255,0.02)',
                        border: `1px solid ${isSelected ? col : 'var(--border-color)'}`,
                        cursor: 'pointer',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                          <span style={{ width: '9px', height: '9px', borderRadius: '50%', background: col, display: 'inline-block' }} />
                          <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-color)' }}>
                            Vanishing Point #{vp.vp_index}
                          </span>
                        </div>
                        <span style={{ fontSize: '0.72rem', color: col, fontWeight: 600 }}>
                          {vp.conforming_lines} lines
                        </span>
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between' }}>
                        <span>Coords: ({vp.x.toFixed(0)}, {vp.y.toFixed(0)})</span>
                        <span>Res: ±{vp.mean_residual_deg.toFixed(1)}°</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Outlier Lines Card */}
          <div style={{
            background: 'var(--surface-color)',
            border: '1px solid var(--border-color)',
            borderRadius: '10px',
            padding: '1rem',
            maxHeight: '260px',
            display: 'flex',
            flexDirection: 'column'
          }}>
            <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-color)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <AlertTriangle size={15} color="#ef4444" /> Perspective Outliers ({findings.outliers.length})
            </h4>
            <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.4rem', paddingRight: '0.25rem' }}>
              {findings.outliers.length === 0 ? (
                <div style={{ fontSize: '0.8rem', color: '#10b981', padding: '0.5rem', fontStyle: 'italic' }}>
                  Zero perspective outliers detected. All edges converge to dominant vanishing points.
                </div>
              ) : (
                findings.outliers.map((out, i) => (
                  <div
                    key={i}
                    style={{
                      background: 'rgba(239, 68, 68, 0.05)',
                      border: '1px solid rgba(239, 68, 68, 0.2)',
                      borderRadius: '5px',
                      padding: '0.45rem 0.6rem',
                      fontSize: '0.75rem'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#ef4444', fontWeight: 600 }}>
                      <span>Segment #{i + 1} (L: {out.length.toFixed(0)}px)</span>
                      <span>Dev: +{out.min_angular_error_deg.toFixed(1)}°</span>
                    </div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem', marginTop: '0.15rem' }}>
                      P1: ({out.x1.toFixed(0)}, {out.y1.toFixed(0)}) → P2: ({out.x2.toFixed(0)}, {out.y2.toFixed(0)})
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Forensic Scientific Interpretation */}
          <div style={{
            background: 'rgba(184, 135, 42, 0.05)',
            border: '1px solid rgba(184, 135, 42, 0.25)',
            borderRadius: '10px',
            padding: '1rem'
          }}>
            <h5 style={{ margin: '0 0 0.35rem 0', fontSize: '0.82rem', fontWeight: 700, color: '#b8872a', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Engine Interpretation
            </h5>
            <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-color)', lineHeight: 1.45 }}>
              {findings.interpretation}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
