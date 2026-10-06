import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { ChevronsLeftRight, Layers, Columns2 } from 'lucide-react';
import { fetchApi } from '../api';
import AuthenticatedImage from '../components/evidence/AuthenticatedImage';

interface EvidenceOption {
  id: number;
  original_filename: string;
  sha256_hash: string;
}

function formatArtifactTitle(raw: string): string {
  return raw
    .replace(/_\d+$/, '')
    .replace(/^([A-Z]+)_[A-Z]+_/, '$1 ')
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, c => c.toUpperCase())
    .replace(/\bJpeg\b/gi, 'JPEG')
    .replace(/\bDct\b/gi, 'DCT')
    .replace(/\bEla\b/gi, 'ELA')
    .replace(/\bPrnu\b/gi, 'PRNU')
    .replace(/\bMap\b/gi, 'Residual Map');
}

const EvidenceComparison: React.FC = () => {
  const { caseId } = useParams<{ caseId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const paramA = searchParams.get('a');
  const paramB = searchParams.get('b');

  const [evidenceList, setEvidenceList] = useState<EvidenceOption[]>([]);
  const [selectedA, setSelectedA] = useState<string>(paramA || '');
  const [selectedB, setSelectedB] = useState<string>(paramB || '');

  const [comparisonData, setComparisonData] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Wipe Split-View state & Direct On-Image Dragging
  const [wipePosition, setWipePosition] = useState<number>(50);
  const [viewMode, setViewMode] = useState<'side-by-side' | 'wipe' | 'artifacts'>('side-by-side');

  const wipeContainerRef = useRef<HTMLDivElement | null>(null);
  const isDraggingWipeRef = useRef<boolean>(false);

  const updateWipeFromClientX = useCallback((clientX: number) => {
    if (!wipeContainerRef.current) return;
    const rect = wipeContainerRef.current.getBoundingClientRect();
    if (rect.width <= 0) return;
    const x = clientX - rect.left;
    const percent = Math.max(0, Math.min(100, (x / rect.width) * 100));
    setWipePosition(Math.round(percent * 10) / 10);
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDraggingWipeRef.current) {
        updateWipeFromClientX(e.clientX);
      }
    };
    const handleMouseUp = () => {
      isDraggingWipeRef.current = false;
    };
    const handleTouchMove = (e: TouchEvent) => {
      if (isDraggingWipeRef.current && e.touches[0]) {
        updateWipeFromClientX(e.touches[0].clientX);
      }
    };
    const handleTouchEnd = () => {
      isDraggingWipeRef.current = false;
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('touchmove', handleTouchMove);
    window.addEventListener('touchend', handleTouchEnd);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
    };
  }, [updateWipeFromClientX]);

  // Fetch available evidence items for dropdown selectors
  useEffect(() => {
    fetchApi(`/cases/${caseId}/evidence`)
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          setEvidenceList(data);
          if (!paramA && data.length >= 1) setSelectedA(String(data[0].id));
          if (!paramB && data.length >= 2) setSelectedB(String(data[1].id));
        }
      })
      .catch(() => {});
  }, [caseId]);

  // Fetch comparison data when selectedA and selectedB are available
  useEffect(() => {
    if (!selectedA || !selectedB || selectedA === selectedB) {
      setComparisonData(null);
      return;
    }

    setLoading(true);
    setError('');

    fetchApi(`/cases/${caseId}/compare?evidence_a_id=${selectedA}&evidence_b_id=${selectedB}`)
      .then(async res => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || 'Failed to compare evidence items');
        setComparisonData(data);
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  }, [caseId, selectedA, selectedB]);

  const handleUpdateSelection = (newA: string, newB: string) => {
    setSelectedA(newA);
    setSelectedB(newB);
    setSearchParams({ a: newA, b: newB });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Top Card */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
              <span style={{ 
                fontSize: '0.68rem', 
                fontWeight: 800, 
                color: 'var(--accent-color, #b8872a)', 
                background: 'rgba(184, 135, 42, 0.12)', 
                padding: '0.2rem 0.55rem', 
                borderRadius: '5px', 
                textTransform: 'uppercase',
                border: '1px solid rgba(184, 135, 42, 0.28)',
                letterSpacing: '0.04em',
                fontFamily: 'var(--font-tech)'
              }}>
                Forensic Correlation Lab
              </span>
            </div>
            <h2 className="card-title" style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: '1.35rem' }}>
              Comparative Evidence Analysis (Compare Mode)
            </h2>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.84rem', marginTop: '0.25rem' }}>
              Side-by-side synchronized view, wipe difference slider, and physical compression matrix
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
            <div style={{ 
              display: 'flex', 
              background: 'var(--surface-color-light)', 
              padding: '0.25rem', 
              borderRadius: '8px', 
              border: '1px solid var(--border-color-translucent)',
              gap: '0.25rem'
            }}>
              <button 
                type="button"
                style={{ 
                  fontSize: '0.76rem', 
                  padding: '0.4rem 0.75rem',
                  borderRadius: '6px',
                  border: viewMode === 'side-by-side' ? '1px solid var(--border-color)' : '1px solid transparent',
                  background: viewMode === 'side-by-side' ? '#ffffff' : 'transparent',
                  color: viewMode === 'side-by-side' ? 'var(--primary-color)' : 'var(--text-muted)',
                  fontWeight: viewMode === 'side-by-side' ? 700 : 500,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  boxShadow: viewMode === 'side-by-side' ? '0 2px 6px rgba(0,0,0,0.06)' : 'none',
                  transition: 'all 0.15s ease'
                }}
                onClick={() => setViewMode('side-by-side')}
              >
                <Columns2 size={13} />
                <span>Side-by-Side</span>
              </button>
              <button 
                type="button"
                style={{ 
                  fontSize: '0.76rem', 
                  padding: '0.4rem 0.75rem',
                  borderRadius: '6px',
                  border: viewMode === 'wipe' ? '1px solid var(--border-color)' : '1px solid transparent',
                  background: viewMode === 'wipe' ? '#ffffff' : 'transparent',
                  color: viewMode === 'wipe' ? 'var(--primary-color)' : 'var(--text-muted)',
                  fontWeight: viewMode === 'wipe' ? 700 : 500,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  boxShadow: viewMode === 'wipe' ? '0 2px 6px rgba(0,0,0,0.06)' : 'none',
                  transition: 'all 0.15s ease'
                }}
                onClick={() => setViewMode('wipe')}
              >
                <ChevronsLeftRight size={13} />
                <span>Wipe Split-View</span>
              </button>
              <button 
                type="button"
                style={{ 
                  fontSize: '0.76rem', 
                  padding: '0.4rem 0.75rem',
                  borderRadius: '6px',
                  border: viewMode === 'artifacts' ? '1px solid var(--border-color)' : '1px solid transparent',
                  background: viewMode === 'artifacts' ? '#ffffff' : 'transparent',
                  color: viewMode === 'artifacts' ? 'var(--primary-color)' : 'var(--text-muted)',
                  fontWeight: viewMode === 'artifacts' ? 700 : 500,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  boxShadow: viewMode === 'artifacts' ? '0 2px 6px rgba(0,0,0,0.06)' : 'none',
                  transition: 'all 0.15s ease'
                }}
                onClick={() => setViewMode('artifacts')}
              >
                <Layers size={13} />
                <span>Artifact Maps</span>
              </button>
            </div>

            <button 
              type="button"
              className="btn btn-secondary" 
              onClick={() => navigate(`/cases/${caseId}/evidence`)} 
              style={{ fontSize: '0.78rem', padding: '0.4rem 0.8rem' }}
            >
              &larr; Evidence Library
            </button>
          </div>
        </div>

        {/* Evidence Selection Controls */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '1rem' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.4rem', color: 'var(--text-muted)' }}>
              EVIDENCE ITEM A (Reference Image)
            </label>
            <select
              value={selectedA}
              onChange={e => handleUpdateSelection(e.target.value, selectedB)}
              style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'var(--surface-color-light)', color: 'var(--text-color)', fontSize: '0.85rem' }}
            >
              <option value="">-- Select Evidence A --</option>
              {evidenceList.map(item => (
                <option key={item.id} value={String(item.id)}>
                  #{item.id}: {item.original_filename}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.4rem', color: 'var(--text-muted)' }}>
              EVIDENCE ITEM B (Comparison Image)
            </label>
            <select
              value={selectedB}
              onChange={e => handleUpdateSelection(selectedA, e.target.value)}
              style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'var(--surface-color-light)', color: 'var(--text-color)', fontSize: '0.85rem' }}
            >
              <option value="">-- Select Evidence B --</option>
              {evidenceList.map(item => (
                <option key={item.id} value={String(item.id)}>
                  #{item.id}: {item.original_filename}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {loading && <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>Executing comparative correlation analysis...</div>}
      {error && <div className="error-banner">{error}</div>}

      {comparisonData && !loading && (
        <>
          {/* Scientific Disclaimer */}
          <div style={{ 
            background: 'var(--surface-color-light)', 
            border: '1px solid var(--border-color)', 
            borderLeft: '4px solid var(--accent-color)', 
            padding: '0.85rem 1.15rem', 
            borderRadius: '8px', 
            fontSize: '0.82rem', 
            color: 'var(--text-main)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.6rem',
            boxShadow: '0 2px 6px rgba(45, 35, 20, 0.04)'
          }}>
            <strong style={{ fontFamily: 'var(--font-tech)', color: 'var(--accent-color)', letterSpacing: '0.04em' }}>
              COMPARATIVE GUARDRAIL:
            </strong> 
            <span style={{ color: 'var(--text-body)' }}>
              {comparisonData.disclaimer || 'Comparison reflects physical, digital, and compression processing differences. It does not compute an automated manipulation score.'}
            </span>
          </div>

          {/* VIEW MODE 1: Side-by-Side View */}
          {viewMode === 'side-by-side' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
              {/* Evidence A */}
              <div className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--primary-color)' }} />
                    <h3 style={{ margin: 0, fontSize: '0.98rem', color: 'var(--primary-color)', fontWeight: 700, fontFamily: 'var(--font-display)' }}>
                      Evidence A: {comparisonData.evidence_a?.original_filename}
                    </h3>
                  </div>
                  <span className="badge" style={{ fontFamily: 'var(--font-mono)' }}>ID #{comparisonData.evidence_a?.id}</span>
                </div>
                <div style={{ border: '1px solid var(--border-color)', borderRadius: '10px', height: '300px', background: '#faf8f5', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', marginBottom: '0.75rem', boxShadow: 'inset 0 1px 4px rgba(45, 35, 20, 0.04)' }}>
                  <AuthenticatedImage 
                    src={`/api/evidence/${comparisonData.evidence_a?.id}/raw`} 
                    alt="Evidence A" 
                    style={{ maxHeight: '300px', maxWidth: '100%', objectFit: 'contain' }}
                  />
                </div>
                <div style={{ fontSize: '0.8rem', display: 'flex', flexDirection: 'column', gap: '0.35rem', background: 'var(--surface-color-light)', padding: '0.65rem 0.85rem', borderRadius: '8px', border: '1px solid var(--border-color-translucent)' }}>
                  <div><strong>Dimensions:</strong> {comparisonData.evidence_a?.width} × {comparisonData.evidence_a?.height} px</div>
                  <div><strong>Format:</strong> {comparisonData.evidence_a?.mime_type}</div>
                  <div style={{ fontFamily: 'var(--font-mono)', wordBreak: 'break-all', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                    SHA-256: {comparisonData.evidence_a?.sha256_hash}
                  </div>
                </div>
              </div>

              {/* Evidence B */}
              <div className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--accent-color)' }} />
                    <h3 style={{ margin: 0, fontSize: '0.98rem', color: 'var(--accent-color)', fontWeight: 700, fontFamily: 'var(--font-display)' }}>
                      Evidence B: {comparisonData.evidence_b?.original_filename}
                    </h3>
                  </div>
                  <span className="badge" style={{ fontFamily: 'var(--font-mono)' }}>ID #{comparisonData.evidence_b?.id}</span>
                </div>
                <div style={{ border: '1px solid var(--border-color)', borderRadius: '10px', height: '300px', background: '#faf8f5', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', marginBottom: '0.75rem', boxShadow: 'inset 0 1px 4px rgba(45, 35, 20, 0.04)' }}>
                  <AuthenticatedImage 
                    src={`/api/evidence/${comparisonData.evidence_b?.id}/raw`} 
                    alt="Evidence B" 
                    style={{ maxHeight: '300px', maxWidth: '100%', objectFit: 'contain' }}
                  />
                </div>
                <div style={{ fontSize: '0.8rem', display: 'flex', flexDirection: 'column', gap: '0.35rem', background: 'var(--surface-color-light)', padding: '0.65rem 0.85rem', borderRadius: '8px', border: '1px solid var(--border-color-translucent)' }}>
                  <div><strong>Dimensions:</strong> {comparisonData.evidence_b?.width} × {comparisonData.evidence_b?.height} px</div>
                  <div><strong>Format:</strong> {comparisonData.evidence_b?.mime_type}</div>
                  <div style={{ fontFamily: 'var(--font-mono)', wordBreak: 'break-all', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                    SHA-256: {comparisonData.evidence_b?.sha256_hash}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* VIEW MODE 2: Wipe Difference Slider (Direct On-Image Dragging + Track Control) */}
          {viewMode === 'wipe' && (
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem', flexWrap: 'wrap', gap: '0.6rem' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.05rem', fontFamily: 'var(--font-display)', fontWeight: 700 }}>
                    Wipe Difference Inspection (Wipe Split-View)
                  </h3>
                  <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                    Click or drag directly across the image to slide the comparison curtain
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', fontSize: '0.8rem', background: 'var(--surface-color-light)', padding: '0.35rem 0.75rem', borderRadius: '8px', border: '1px solid var(--border-color-translucent)' }}>
                  <label style={{ fontWeight: 600, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <span>Wipe Split:</span>
                    <strong style={{ fontFamily: 'var(--font-mono)', color: 'var(--primary-color)' }}>{Math.round(wipePosition)}%</strong>
                  </label>
                  <input 
                    type="range" 
                    min="0" 
                    max="100" 
                    value={wipePosition} 
                    onChange={e => setWipePosition(Number(e.target.value))}
                    style={{ width: '130px', cursor: 'pointer', accentColor: 'var(--primary-color)' }}
                  />
                  <button
                    type="button"
                    onClick={() => setWipePosition(50)}
                    style={{
                      background: 'transparent',
                      border: '1px solid var(--border-color)',
                      borderRadius: '5px',
                      padding: '0.15rem 0.45rem',
                      fontSize: '0.72rem',
                      cursor: 'pointer',
                      color: 'var(--text-muted)'
                    }}
                    title="Center divider at 50%"
                  >
                    50%
                  </button>
                </div>
              </div>

              {/* Direct On-Image Interactive Scrubbing Container */}
              <div 
                ref={wipeContainerRef}
                onMouseDown={(e) => {
                  isDraggingWipeRef.current = true;
                  updateWipeFromClientX(e.clientX);
                }}
                onTouchStart={(e) => {
                  isDraggingWipeRef.current = true;
                  if (e.touches[0]) updateWipeFromClientX(e.touches[0].clientX);
                }}
                style={{ 
                  position: 'relative', 
                  width: '100%', 
                  maxWidth: '860px', 
                  height: '460px', 
                  margin: '0 auto', 
                  background: '#faf8f5', 
                  borderRadius: '12px', 
                  overflow: 'hidden', 
                  border: '1px solid var(--border-color)',
                  cursor: 'ew-resize',
                  userSelect: 'none',
                  WebkitUserSelect: 'none',
                  touchAction: 'none',
                  boxShadow: 'inset 0 1px 4px rgba(45, 35, 20, 0.05), 0 2px 10px rgba(45, 35, 20, 0.04)'
                }}
              >
                {/* Background Image: Evidence B */}
                <AuthenticatedImage
                  src={`/api/evidence/${comparisonData.evidence_b?.id}/raw`}
                  alt="Evidence B"
                  style={{ 
                    position: 'absolute', 
                    top: 0, 
                    left: 0, 
                    width: '100%', 
                    height: '100%', 
                    objectFit: 'contain',
                    pointerEvents: 'none',
                    userSelect: 'none'
                  }}
                />

                {/* Foreground Image: Evidence A with clip-path wipe */}
                <div style={{ 
                  position: 'absolute', 
                  top: 0, 
                  left: 0, 
                  width: '100%', 
                  height: '100%', 
                  clipPath: `polygon(0 0, ${wipePosition}% 0, ${wipePosition}% 100%, 0 100%)`,
                  pointerEvents: 'none',
                  userSelect: 'none'
                }}>
                  <AuthenticatedImage
                    src={`/api/evidence/${comparisonData.evidence_a?.id}/raw`}
                    alt="Evidence A"
                    style={{ 
                      width: '100%', 
                      height: '100%', 
                      objectFit: 'contain',
                      pointerEvents: 'none',
                      userSelect: 'none'
                    }}
                  />
                </div>

                {/* Vertical Divider Curtain Line */}
                <div style={{ 
                  position: 'absolute', 
                  top: 0, 
                  bottom: 0, 
                  left: `${wipePosition}%`, 
                  width: '2px', 
                  background: 'var(--accent-color, #b8872a)', 
                  boxShadow: '0 0 8px rgba(184, 135, 42, 0.4), 0 0 2px rgba(255, 255, 255, 0.8)',
                  pointerEvents: 'none',
                  zIndex: 3
                }} />

                {/* Interactive Center Scrubbing Handle */}
                <div style={{
                  position: 'absolute',
                  top: '50%',
                  left: `${wipePosition}%`,
                  transform: 'translate(-50%, -50%)',
                  width: '36px',
                  height: '36px',
                  borderRadius: '50%',
                  background: '#ffffff',
                  border: '2px solid var(--accent-color, #b8872a)',
                  boxShadow: '0 3px 12px rgba(45, 35, 20, 0.18), 0 0 0 2px rgba(255, 255, 255, 0.9)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--primary-color, #1c2b3a)',
                  cursor: 'ew-resize',
                  backdropFilter: 'blur(8px)',
                  transition: 'transform 0.1s ease, box-shadow 0.15s ease',
                  zIndex: 5
                }}>
                  <ChevronsLeftRight size={17} style={{ color: 'var(--accent-color, #b8872a)' }} />
                </div>
              </div>

              {/* Clean Reference Legend Below Canvas */}
              <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center',
                maxWidth: '860px', 
                margin: '0.75rem auto 0', 
                fontSize: '0.78rem',
                padding: '0 0.35rem'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--primary-color)' }} />
                  <span style={{ fontWeight: 700, color: 'var(--text-main)', fontFamily: 'var(--font-tech)' }}>Evidence A:</span>
                  <span style={{ color: 'var(--text-muted)' }}>{comparisonData.evidence_a?.original_filename}</span>
                  <span style={{ 
                    fontSize: '0.72rem', 
                    fontFamily: 'var(--font-mono)', 
                    background: 'rgba(28, 43, 58, 0.08)', 
                    color: 'var(--primary-color)', 
                    padding: '0.15rem 0.5rem', 
                    borderRadius: '6px',
                    fontWeight: 700,
                    border: '1px solid rgba(28, 43, 58, 0.12)'
                  }}>
                    {Math.round(wipePosition)}%
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ 
                    fontSize: '0.72rem', 
                    fontFamily: 'var(--font-mono)', 
                    background: 'rgba(184, 135, 42, 0.12)', 
                    color: 'var(--accent-color)', 
                    padding: '0.15rem 0.5rem', 
                    borderRadius: '6px',
                    fontWeight: 700,
                    border: '1px solid rgba(184, 135, 42, 0.25)'
                  }}>
                    {Math.round(100 - wipePosition)}%
                  </span>
                  <span style={{ color: 'var(--text-muted)' }}>{comparisonData.evidence_b?.original_filename}</span>
                  <span style={{ fontWeight: 700, color: 'var(--text-main)', fontFamily: 'var(--font-tech)' }}>: Evidence B</span>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--accent-color)' }} />
                </div>
              </div>
            </div>
          )}

          {/* VIEW MODE 3: Artifact Maps Comparison */}
          {viewMode === 'artifacts' && (
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', borderBottom: '1px solid var(--border-color-translucent)', paddingBottom: '0.75rem' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.1rem', fontFamily: 'var(--font-display)', fontWeight: 700 }}>
                    Forensic Artifact Maps (A vs B)
                  </h3>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                    Comparative heatmap overlays (Perspective, Lighting & Solar, JPEG DCT, Noise)
                  </div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                {/* Column A */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'space-between', 
                    background: 'var(--surface-color-light)', 
                    padding: '0.5rem 0.85rem', 
                    borderRadius: '8px', 
                    border: '1px solid var(--border-color-translucent)' 
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                      <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--primary-color)' }} />
                      <h4 style={{ margin: 0, fontSize: '0.86rem', color: 'var(--primary-color)', fontWeight: 700, fontFamily: 'var(--font-tech)' }}>
                        Item A Artifacts
                      </h4>
                    </div>
                    <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                      {comparisonData.evidence_a?.original_filename}
                    </span>
                  </div>

                  {Object.keys(comparisonData.evidence_a?.artifacts || {}).length === 0 ? (
                    <div style={{ 
                      textAlign: 'center', 
                      padding: '2.5rem 1rem', 
                      background: 'var(--surface-color-light)', 
                      borderRadius: '10px', 
                      border: '1px dashed var(--border-color)',
                      color: 'var(--text-muted)'
                    }}>
                      <Layers size={28} style={{ opacity: 0.5, marginBottom: '0.5rem' }} />
                      <div style={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--text-main)' }}>No generated artifact maps for Item A</div>
                      <div style={{ fontSize: '0.74rem', marginTop: '0.25rem' }}>Run automated analysis engines on this evidence item in the Evidence Library.</div>
                    </div>
                  ) : (
                    Object.entries(comparisonData.evidence_a.artifacts).map(([k, uri]: [string, any]) => (
                      <div 
                        key={k} 
                        style={{ 
                          background: '#faf8f5', 
                          border: '1px solid var(--border-color)', 
                          borderRadius: '10px', 
                          overflow: 'hidden',
                          boxShadow: '0 2px 8px rgba(45, 35, 20, 0.04)'
                        }}
                      >
                        <div style={{ 
                          display: 'flex', 
                          justifyContent: 'space-between', 
                          alignItems: 'center', 
                          padding: '0.5rem 0.85rem', 
                          background: 'rgba(250, 246, 238, 0.85)',
                          borderBottom: '1px solid var(--border-color-translucent)'
                        }}>
                          <span style={{ fontSize: '0.76rem', fontWeight: 700, color: 'var(--text-main)', fontFamily: 'var(--font-tech)', letterSpacing: '0.02em' }}>
                            {formatArtifactTitle(k)}
                          </span>
                          <span style={{ fontSize: '0.68rem', background: 'rgba(28, 43, 58, 0.08)', color: 'var(--primary-color)', padding: '0.12rem 0.4rem', borderRadius: '4px', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
                            MAP
                          </span>
                        </div>
                        <div style={{ padding: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#faf8f5', minHeight: '220px' }}>
                          <AuthenticatedImage src={uri} alt={k} style={{ maxWidth: '100%', maxHeight: '240px', objectFit: 'contain' }} />
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* Column B */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'space-between', 
                    background: 'var(--surface-color-light)', 
                    padding: '0.5rem 0.85rem', 
                    borderRadius: '8px', 
                    border: '1px solid var(--border-color-translucent)' 
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                      <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--accent-color)' }} />
                      <h4 style={{ margin: 0, fontSize: '0.86rem', color: 'var(--accent-color)', fontWeight: 700, fontFamily: 'var(--font-tech)' }}>
                        Item B Artifacts
                      </h4>
                    </div>
                    <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                      {comparisonData.evidence_b?.original_filename}
                    </span>
                  </div>

                  {Object.keys(comparisonData.evidence_b?.artifacts || {}).length === 0 ? (
                    <div style={{ 
                      textAlign: 'center', 
                      padding: '2.5rem 1rem', 
                      background: 'var(--surface-color-light)', 
                      borderRadius: '10px', 
                      border: '1px dashed var(--border-color)',
                      color: 'var(--text-muted)'
                    }}>
                      <Layers size={28} style={{ opacity: 0.5, marginBottom: '0.5rem', color: 'var(--accent-color)' }} />
                      <div style={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--text-main)' }}>No generated visual artifacts for Item B</div>
                      <div style={{ fontSize: '0.74rem', marginTop: '0.25rem' }}>Run automated analysis engines on this evidence item in the Evidence Library.</div>
                    </div>
                  ) : (
                    Object.entries(comparisonData.evidence_b.artifacts).map(([k, uri]: [string, any]) => (
                      <div 
                        key={k} 
                        style={{ 
                          background: '#faf8f5', 
                          border: '1px solid var(--border-color)', 
                          borderRadius: '10px', 
                          overflow: 'hidden',
                          boxShadow: '0 2px 8px rgba(45, 35, 20, 0.04)'
                        }}
                      >
                        <div style={{ 
                          display: 'flex', 
                          justifyContent: 'space-between', 
                          alignItems: 'center', 
                          padding: '0.5rem 0.85rem', 
                          background: 'rgba(250, 246, 238, 0.85)',
                          borderBottom: '1px solid var(--border-color-translucent)'
                        }}>
                          <span style={{ fontSize: '0.76rem', fontWeight: 700, color: 'var(--text-main)', fontFamily: 'var(--font-tech)', letterSpacing: '0.02em' }}>
                            {formatArtifactTitle(k)}
                          </span>
                          <span style={{ fontSize: '0.68rem', background: 'rgba(184, 135, 42, 0.12)', color: 'var(--accent-color)', padding: '0.12rem 0.4rem', borderRadius: '4px', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
                            MAP
                          </span>
                        </div>
                        <div style={{ padding: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#faf8f5', minHeight: '220px' }}>
                          <AuthenticatedImage src={uri} alt={k} style={{ maxWidth: '100%', maxHeight: '240px', objectFit: 'contain' }} />
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Comparative Matrix Table */}
          <div className="card">
            <h3 className="card-title">Physical & Compression Property Matrix</h3>
            <table className="evidence-table" style={{ width: '100%', fontSize: '0.8rem' }}>
              <thead>
                <tr>
                  <th style={{ padding: '0.5rem' }}>Property</th>
                  <th style={{ padding: '0.5rem' }}>Evidence A ({comparisonData.evidence_a?.original_filename})</th>
                  <th style={{ padding: '0.5rem' }}>Evidence B ({comparisonData.evidence_b?.original_filename})</th>
                  <th style={{ padding: '0.5rem' }}>Variance Status</th>
                </tr>
              </thead>
              <tbody>
                <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                  <td style={{ padding: '0.6rem 0.5rem' }}><strong>SHA-256 Hash</strong></td>
                  <td style={{ padding: '0.6rem 0.5rem', fontFamily: 'monospace', fontSize: '0.75rem' }}>{comparisonData.evidence_a?.sha256_hash}</td>
                  <td style={{ padding: '0.6rem 0.5rem', fontFamily: 'monospace', fontSize: '0.75rem' }}>{comparisonData.evidence_b?.sha256_hash}</td>
                  <td style={{ padding: '0.6rem 0.5rem' }}>
                    {comparisonData.differences?.hash_identical ? (
                      <span className="badge" style={{ background: '#10b981', color: 'white' }}>IDENTICAL</span>
                    ) : (
                      <span className="badge" style={{ background: '#ef4444', color: 'white' }}>DISTINCT</span>
                    )}
                  </td>
                </tr>

                <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                  <td style={{ padding: '0.6rem 0.5rem' }}><strong>Dimensions (Resolution)</strong></td>
                  <td style={{ padding: '0.6rem 0.5rem' }}>{comparisonData.evidence_a?.width} × {comparisonData.evidence_a?.height} px</td>
                  <td style={{ padding: '0.6rem 0.5rem' }}>{comparisonData.evidence_b?.width} × {comparisonData.evidence_b?.height} px</td>
                  <td style={{ padding: '0.6rem 0.5rem' }}>
                    {comparisonData.differences?.dimensions_identical ? (
                      <span className="badge" style={{ background: '#10b981', color: 'white' }}>MATCH</span>
                    ) : (
                      <span className="badge" style={{ background: '#f59e0b', color: 'white' }}>VARIANCE</span>
                    )}
                  </td>
                </tr>

                <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                  <td style={{ padding: '0.6rem 0.5rem' }}><strong>MIME Type</strong></td>
                  <td style={{ padding: '0.6rem 0.5rem' }}>{comparisonData.evidence_a?.mime_type}</td>
                  <td style={{ padding: '0.6rem 0.5rem' }}>{comparisonData.evidence_b?.mime_type}</td>
                  <td style={{ padding: '0.6rem 0.5rem' }}>
                    {comparisonData.differences?.mime_identical ? (
                      <span className="badge" style={{ background: '#10b981', color: 'white' }}>MATCH</span>
                    ) : (
                      <span className="badge" style={{ background: '#f59e0b', color: 'white' }}>VARIANCE</span>
                    )}
                  </td>
                </tr>

                <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                  <td style={{ padding: '0.6rem 0.5rem' }}><strong>File Size</strong></td>
                  <td style={{ padding: '0.6rem 0.5rem' }}>{((comparisonData.evidence_a?.file_size || 0) / 1024).toFixed(1)} KB</td>
                  <td style={{ padding: '0.6rem 0.5rem' }}>{((comparisonData.evidence_b?.file_size || 0) / 1024).toFixed(1)} KB</td>
                  <td style={{ padding: '0.6rem 0.5rem' }}>
                    Delta: {((comparisonData.differences?.size_diff_bytes || 0) / 1024).toFixed(1)} KB
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
};

export default EvidenceComparison;
