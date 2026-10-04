import React, { useState, useRef } from 'react';
import { Sun, Compass, AlertTriangle, CheckCircle2, Info, Eye, Layers, ZoomIn, ZoomOut, RotateCcw, MapPin, Clock } from 'lucide-react';
import AuthenticatedImage from './AuthenticatedImage';

interface IlluminationPatch {
  patch_id: string;
  box: number[]; // [x1, y1, x2, y2]
  illuminant_angle_deg: number;
  confidence: number;
  is_divergent: boolean;
  angular_discrepancy_deg: number;
}

interface DetectedShadowRay {
  caster_x: number;
  caster_y: number;
  shadow_x: number;
  shadow_y: number;
  vector_angle_deg: number;
  ray_length: number;
}

interface SolarEphemerisEvaluation {
  exif_timestamp?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  solar_elevation_deg?: number | null;
  solar_azimuth_deg?: number | null;
  expected_shadow_azimuth_deg?: number | null;
  expected_shadow_ratio?: number | null;
  astronomical_consistency: string; // CONSISTENT, INCONSISTENT, DAY_NIGHT_CONFLICT, METADATA_UNAVAILABLE
  reasoning: string;
}

interface LightingFindings {
  mean_illuminant_angle_deg: number;
  illuminant_angular_variance: number;
  total_patches: number;
  divergent_patches: number;
  divergence_ratio: number;
  patches: IlluminationPatch[];
  shadow_rays: DetectedShadowRay[];
  solar_ephemeris?: SolarEphemerisEvaluation | null;
  lighting_inconsistency_score: number;
  verdict: string;
  interpretation: string;
  artifacts?: {
    lighting_overlay?: string;
  };
}

interface LightingSolarForensicsViewerProps {
  evidenceId: number;
  findings: LightingFindings;
  rawImageSrc: string;
}

export const LightingSolarForensicsViewer: React.FC<LightingSolarForensicsViewerProps> = ({
  evidenceId: _evidenceId,
  findings,
  rawImageSrc,
}) => {
  const [showArtifactOverlay, setShowArtifactOverlay] = useState<boolean>(true);
  const [showShadowRays, setShowShadowRays] = useState<boolean>(true);
  const [scale, setScale] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const containerRef = useRef<HTMLDivElement>(null);

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
    if (verdict === 'LIGHTING_PHYSICS_CONSISTENT') {
      return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', color: '#10b981', background: 'rgba(16, 185, 129, 0.1)', padding: '0.25rem 0.65rem', borderRadius: '9999px', fontSize: '0.8rem', fontWeight: 700 }}>
          <CheckCircle2 size={14} /> Physics & Lighting Consistent
        </span>
      );
    }
    if (verdict === 'SOLAR_NIGHT_CONFLICT' || verdict === 'SOLAR_ASTRONOMICAL_ANOMALY' || verdict === 'LIGHTING_DIRECTION_ANOMALY') {
      return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', color: '#ef4444', background: 'rgba(239, 68, 68, 0.12)', padding: '0.25rem 0.65rem', borderRadius: '9999px', fontSize: '0.8rem', fontWeight: 700 }}>
          <AlertTriangle size={14} /> Candidate {verdict.replace(/_/g, ' ').toLowerCase()}
        </span>
      );
    }
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', color: '#f59e0b', background: 'rgba(245, 158, 11, 0.1)', padding: '0.25rem 0.65rem', borderRadius: '9999px', fontSize: '0.8rem', fontWeight: 700 }}>
        <Info size={14} /> {verdict.replace(/_/g, ' ')}
      </span>
    );
  };

  const solar = findings.solar_ephemeris;
  const backendArtifactUrl = findings.artifacts?.lighting_overlay
    ? `/api/artifacts/download?storage_path=${encodeURIComponent(findings.artifacts.lighting_overlay)}`
    : null;

  // Compass Angles:
  // Math angles: 0 is Right (East), 90 is Down (South).
  // Clock needle: 0 deg points to East, 270 deg points to North.
  const lightRad = (findings.mean_illuminant_angle_deg * Math.PI) / 180;
  const lightNeedleX = Math.round(50 + 36 * Math.cos(lightRad));
  const lightNeedleY = Math.round(50 + 36 * Math.sin(lightRad));

  let sunNeedleX = 50;
  let sunNeedleY = 50;
  if (solar && solar.solar_azimuth_deg != null) {
    // Azimuth is 0 at North, clockwise: East is 90, South is 180, West is 270
    const sunRad = ((solar.solar_azimuth_deg - 90) * Math.PI) / 180;
    sunNeedleX = Math.round(50 + 36 * Math.cos(sunRad));
    sunNeedleY = Math.round(50 + 36 * Math.sin(sunRad));
  }

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
            <Sun size={20} color="#b8872a" />
            <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-color)' }}>
              Physical Illumination & NOAA Solar Ephemeris Analysis
            </h3>
            {getVerdictBadge(findings.verdict)}
          </div>
          <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            Evaluates 2D Lambertian light direction vectors, cast shadow convergence, and cross-references EXIF GPS/time against NOAA solar ephemeris.
          </p>
        </div>

        {/* Quick Metrics Badges */}
        <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
          <div style={{ background: 'var(--surface-color-light)', padding: '0.4rem 0.75rem', borderRadius: '6px', textAlign: 'center', border: '1px solid var(--border-color)' }}>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Scene Light Angle</div>
            <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#10b981' }}>{findings.mean_illuminant_angle_deg.toFixed(1)}°</div>
          </div>
          <div style={{ background: 'var(--surface-color-light)', padding: '0.4rem 0.75rem', borderRadius: '6px', textAlign: 'center', border: '1px solid var(--border-color)' }}>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Angular Variance</div>
            <div style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-color)' }}>±{findings.illuminant_angular_variance.toFixed(1)}°</div>
          </div>
          <div style={{ background: 'var(--surface-color-light)', padding: '0.4rem 0.75rem', borderRadius: '6px', textAlign: 'center', border: '1px solid var(--border-color)' }}>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Divergent Quadrants</div>
            <div style={{ fontSize: '0.95rem', fontWeight: 700, color: findings.divergent_patches > 0 ? '#ef4444' : 'var(--text-color)' }}>
              {findings.divergent_patches}/{findings.total_patches} ({((findings.divergence_ratio || 0) * 100).toFixed(0)}%)
            </div>
          </div>
          <div style={{ background: 'var(--surface-color-light)', padding: '0.4rem 0.75rem', borderRadius: '6px', textAlign: 'center', border: '1px solid var(--border-color)' }}>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Solar Verification</div>
            <div style={{ fontSize: '0.95rem', fontWeight: 700, color: solar ? (solar.astronomical_consistency === 'CONSISTENT' ? '#10b981' : '#ef4444') : 'var(--text-muted)' }}>
              {solar ? solar.astronomical_consistency : 'No GPS/EXIF'}
            </div>
          </div>
        </div>
      </div>

      {/* Main Workbench: Viewer + Physics & Solar Compass Sidebar */}
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
              {backendArtifactUrl && (
                <button
                  onClick={() => setShowArtifactOverlay(!showArtifactOverlay)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.3rem',
                    fontSize: '0.75rem',
                    padding: '0.3rem 0.6rem',
                    borderRadius: '5px',
                    border: showArtifactOverlay ? '1px solid #b8872a' : '1px solid var(--border-color)',
                    background: showArtifactOverlay ? 'rgba(184, 135, 42, 0.15)' : 'transparent',
                    color: showArtifactOverlay ? '#b8872a' : 'var(--text-muted)',
                    cursor: 'pointer'
                  }}
                >
                  <Eye size={13} /> {showArtifactOverlay ? 'Physical Vector Map' : 'Raw Image'}
                </button>
              )}

              <button
                onClick={() => setShowShadowRays(!showShadowRays)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.3rem',
                  fontSize: '0.75rem',
                  padding: '0.3rem 0.6rem',
                  borderRadius: '5px',
                  border: showShadowRays ? '1px solid #38bdf8' : '1px solid var(--border-color)',
                  background: showShadowRays ? 'rgba(56, 189, 248, 0.15)' : 'transparent',
                  color: showShadowRays ? '#38bdf8' : 'var(--text-muted)',
                  cursor: 'pointer'
                }}
              >
                <Layers size={13} /> Shadow Rays ({findings.shadow_rays.length})
              </button>
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
              <AuthenticatedImage
                src={showArtifactOverlay && backendArtifactUrl ? backendArtifactUrl : rawImageSrc}
                alt="Lighting & Physics Forensic Stage"
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

        {/* Sidebar: Solar Ephemeris & Compass Rose */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Astronomical Compass Rose */}
          <div style={{
            background: 'var(--surface-color)',
            border: '1px solid var(--border-color)',
            borderRadius: '10px',
            padding: '1.25rem',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center'
          }}>
            <h4 style={{ margin: '0 0 1rem 0', fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-color)', width: '100%', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Compass size={16} color="#b8872a" /> Astronomical Solar & Light Compass
            </h4>

            <div style={{ position: 'relative', width: '130px', height: '130px', margin: '0.5rem 0' }}>
              <svg width="130" height="130" viewBox="0 0 100 100">
                {/* Compass Dial */}
                <circle cx="50" cy="50" r="46" fill="#141e28" stroke="var(--border-color)" strokeWidth="2" />
                <circle cx="50" cy="50" r="38" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="1" strokeDasharray="2,2" />

                {/* Cardinal Marks */}
                <text x="50" y="14" fill="var(--text-muted)" fontSize="8" fontWeight="bold" textAnchor="middle">N</text>
                <text x="50" y="93" fill="var(--text-muted)" fontSize="8" fontWeight="bold" textAnchor="middle">S</text>
                <text x="91" y="53" fill="var(--text-muted)" fontSize="8" fontWeight="bold" textAnchor="middle">E</text>
                <text x="9" y="53" fill="var(--text-muted)" fontSize="8" fontWeight="bold" textAnchor="middle">W</text>

                {/* Mean Scene Light Needle (Green) */}
                <line x1="50" y1="50" x2={lightNeedleX} y2={lightNeedleY} stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" />
                <circle cx={lightNeedleX} cy={lightNeedleY} r="3" fill="#10b981" />

                {/* NOAA Astronomical Sun Needle (Gold/Cyan) */}
                {solar && solar.solar_azimuth_deg != null && (
                  <>
                    <line x1="50" y1="50" x2={sunNeedleX} y2={sunNeedleY} stroke="#f59e0b" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="3,1" />
                    <circle cx={sunNeedleX} cy={sunNeedleY} r="3.5" fill="#f59e0b" />
                  </>
                )}

                <circle cx="50" cy="50" r="3.5" fill="var(--text-color)" />
              </svg>
            </div>

            <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem', fontSize: '0.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981' }} />
                <span style={{ color: 'var(--text-color)' }}>Light: {findings.mean_illuminant_angle_deg.toFixed(0)}°</span>
              </div>
              {solar && solar.solar_azimuth_deg != null && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#f59e0b' }} />
                  <span style={{ color: 'var(--text-color)' }}>Sun: {solar.solar_azimuth_deg.toFixed(0)}°</span>
                </div>
              )}
            </div>
          </div>

          {/* NOAA Solar Ephemeris Cross-Verification Card */}
          <div style={{
            background: 'var(--surface-color)',
            border: '1px solid var(--border-color)',
            borderRadius: '10px',
            padding: '1.25rem'
          }}>
            <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-color)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Sun size={16} color="#f59e0b" /> NOAA Astronomical Cross-Check
            </h4>

            {solar ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', fontSize: '0.78rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '0.35rem', borderBottom: '1px solid var(--border-color)' }}>
                  <span style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}><MapPin size={12} /> GPS Coords:</span>
                  <span style={{ fontWeight: 600, color: 'var(--text-color)' }}>
                    {solar.latitude != null ? `${solar.latitude.toFixed(4)}°, ${solar.longitude?.toFixed(4)}°` : 'N/A'}
                  </span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '0.35rem', borderBottom: '1px solid var(--border-color)' }}>
                  <span style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}><Clock size={12} /> EXIF Time:</span>
                  <span style={{ fontWeight: 600, color: 'var(--text-color)' }}>
                    {solar.exif_timestamp || 'Metadata Absent'}
                  </span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '0.35rem', borderBottom: '1px solid var(--border-color)' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Solar Elevation:</span>
                  <span style={{ fontWeight: 700, color: (solar.solar_elevation_deg || 0) < 0 ? '#ef4444' : '#10b981' }}>
                    {solar.solar_elevation_deg != null ? `${solar.solar_elevation_deg.toFixed(1)}° (${(solar.solar_elevation_deg || 0) < 0 ? 'Night' : 'Daylight'})` : 'N/A'}
                  </span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '0.35rem', borderBottom: '1px solid var(--border-color)' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Expected Shadow Azimuth:</span>
                  <span style={{ fontWeight: 600, color: '#f59e0b' }}>
                    {solar.expected_shadow_azimuth_deg != null ? `${solar.expected_shadow_azimuth_deg.toFixed(1)}°` : 'N/A'}
                  </span>
                </div>

                <div style={{
                  marginTop: '0.4rem',
                  padding: '0.55rem',
                  borderRadius: '6px',
                  background: solar.astronomical_consistency === 'CONSISTENT' ? 'rgba(16, 185, 129, 0.08)' : 'rgba(239, 68, 68, 0.08)',
                  border: `1px solid ${solar.astronomical_consistency === 'CONSISTENT' ? 'rgba(16, 185, 129, 0.25)' : 'rgba(239, 68, 68, 0.25)'}`,
                  fontSize: '0.75rem',
                  color: 'var(--text-color)',
                  lineHeight: 1.4
                }}>
                  {solar.reasoning}
                </div>
              </div>
            ) : (
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontStyle: 'italic', padding: '0.5rem' }}>
                No GPS coordinates or EXIF capture timestamp available in image metadata to calculate astronomical solar position.
              </div>
            )}
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
