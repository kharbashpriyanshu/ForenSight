import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useParams, useNavigate } from 'react-router-dom';
import { fetchApi } from '../api';
import AuthenticatedImage from '../components/evidence/AuthenticatedImage';
import { 
  GitMerge, 
  Camera, 
  Clock, 
  ArrowRight, 
  RefreshCw, 
  X, 
  Info, 
  Layers, 
  AlertTriangle, 
  Eye
} from 'lucide-react';

interface SharedCameraCluster {
  cluster_id: string;
  make?: string;
  model?: string;
  software?: string;
  serial_number?: string;
  evidence_ids: number[];
  filenames: string[];
  forensic_significance: string;
}

interface TemporalSequenceItem {
  evidence_id: number;
  filename: string;
  timestamp_utc?: string;
  timestamp_delta_seconds?: number;
  source_tag: string;
}

interface CrossImageMatchPair {
  evidence_a_id: number;
  evidence_a_filename: string;
  evidence_b_id: number;
  evidence_b_filename: string;
  shared_keypoint_count: number;
  confidence_label: string;
  forensic_explanation: string;
  limitations: string;
}

interface CrossCorrelationData {
  case_identifier: string;
  total_evidence_evaluated: number;
  camera_clusters: SharedCameraCluster[];
  temporal_sequence: TemporalSequenceItem[];
  cross_image_matches: CrossImageMatchPair[];
  findings_generated: number;
  evaluation_timestamp: string;
  disclaimer: string;
}

const CrossImageCorrelation: React.FC = () => {
  const { caseId } = useParams<{ caseId: string }>();
  const navigate = useNavigate();

  const [data, setData] = useState<CrossCorrelationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [evaluating, setEvaluating] = useState(false);
  const [error, setError] = useState('');

  // Dialog / Modal States
  const [showMatrixModal, setShowMatrixModal] = useState<boolean>(false);
  const [modalTab, setModalTab] = useState<'overview' | 'matches' | 'clusters' | 'timeline'>('overview');
  const [selectedMatch, setSelectedMatch] = useState<CrossImageMatchPair | null>(null);
  const [selectedCluster, setSelectedCluster] = useState<SharedCameraCluster | null>(null);
  const [selectedTimelineItem, setSelectedTimelineItem] = useState<TemporalSequenceItem | null>(null);

  const fetchCorrelation = () => {
    setLoading(true);
    fetchApi(`/cases/${caseId}/cross-correlation`)
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch cross-image correlation data');
        return res.json();
      })
      .then(resData => {
        setData(resData);
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  };

  const handleEvaluate = () => {
    setEvaluating(true);
    fetchApi(`/cases/${caseId}/cross-correlation/evaluate`, { method: 'POST' })
      .then(res => res.json())
      .then(resData => {
        setData(resData);
        setEvaluating(false);
      })
      .catch(() => setEvaluating(false));
  };

  useEffect(() => {
    fetchCorrelation();
  }, [caseId]);

  // Keyboard accessibility: Escape closes any open modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowMatrixModal(false);
        setSelectedMatch(null);
        setSelectedCluster(null);
        setSelectedTimelineItem(null);
      }
    };
    if (showMatrixModal || selectedMatch || selectedCluster || selectedTimelineItem) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [showMatrixModal, selectedMatch, selectedCluster, selectedTimelineItem]);

  if (loading) {
    return (
      <div style={{ padding: '3.5rem 1.5rem', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.85rem' }}>
        <RefreshCw size={28} className="spin-animate" style={{ color: '#2563eb' }} />
        <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-main)', fontFamily: "'Plus Jakarta Sans', var(--font-sans)" }}>
          Analyzing Multi-Evidence Correlations Across Case Corpus...
        </div>
        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          Computing shared camera hardware fingerprints, temporal sequences, and descriptor keypoint clusters
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card" style={{ borderLeft: '4px solid #ef4444', padding: '1.5rem', color: '#991b1b', background: 'rgba(239, 68, 68, 0.08)' }}>
        <h3 style={{ margin: '0 0 0.5rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <AlertTriangle size={18} /> Correlation Analysis Error
        </h3>
        <p style={{ margin: 0, fontSize: '0.85rem' }}>{error}</p>
        <button className="btn btn-secondary" onClick={fetchCorrelation} style={{ marginTop: '1rem', padding: '0.35rem 0.85rem', fontSize: '0.8rem' }}>
          Retry
        </button>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', fontFamily: "'Plus Jakarta Sans', var(--font-sans)" }}>
      {/* Header Command Card */}
      <div className="card" style={{ 
        borderLeft: '4px solid #8b5cf6', 
        padding: '1.35rem 1.6rem',
        background: 'var(--surface-color)',
        boxShadow: 'var(--shadow-card)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
              <span style={{ 
                fontSize: '0.7rem', 
                fontWeight: 800, 
                color: '#7c3aed', 
                background: 'rgba(139, 92, 246, 0.12)', 
                border: '1px solid rgba(139, 92, 246, 0.25)',
                padding: '0.18rem 0.55rem', 
                borderRadius: '4px', 
                textTransform: 'uppercase',
                letterSpacing: '0.04em'
              }}>
                Multi-Evidence Synthesis
              </span>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                {data.total_evidence_evaluated} Evidence Items Evaluated • {data.findings_generated} Findings Generated
              </span>
            </div>
            <h1 style={{ fontSize: '1.45rem', margin: '0.2rem 0', fontWeight: 800, letterSpacing: '-0.025em', color: 'var(--text-main)' }}>
              Cross-Image Correlation Matrix
            </h1>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: 0, maxWidth: '820px', lineHeight: 1.55 }}>
              Correlates shared camera hardware fingerprints, capture temporal sequences, and cross-image descriptor keypoints across the entire case corpus.
            </p>
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: '0.65rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <button 
              type="button"
              onClick={() => setShowMatrixModal(true)}
              style={{
                background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
                color: '#ffffff',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                borderRadius: '8px',
                padding: '0.55rem 1.1rem',
                fontSize: '0.825rem',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.5rem',
                boxShadow: '0 4px 14px -2px rgba(124, 58, 237, 0.35)',
                transition: 'all 0.15s ease'
              }}
              onMouseEnter={e => {
                e.currentTarget.style.transform = 'translateY(-1px)';
                e.currentTarget.style.boxShadow = '0 6px 18px -2px rgba(124, 58, 237, 0.45)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 4px 14px -2px rgba(124, 58, 237, 0.35)';
              }}
              title="Open full interactive correlation matrix dialog"
            >
              <Eye size={15} />
              <span>Inspect Correlation Dialog</span>
            </button>

            <button 
              type="button"
              className="btn btn-secondary" 
              onClick={handleEvaluate} 
              disabled={evaluating}
              style={{ 
                fontSize: '0.825rem', 
                padding: '0.55rem 0.95rem',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.45rem',
                borderRadius: '8px',
                fontWeight: 600
              }}
            >
              <RefreshCw size={13} className={evaluating ? 'spin-animate' : ''} />
              <span>{evaluating ? 'Evaluating Matrix...' : 'Re-Evaluate Matrix'}</span>
            </button>
          </div>
        </div>

        {/* Disclaimer Callout */}
        <div style={{ 
          marginTop: '1rem', 
          padding: '0.65rem 0.95rem', 
          background: 'var(--surface-color-light)', 
          border: '1px dashed var(--border-color)', 
          borderRadius: '8px', 
          fontSize: '0.76rem', 
          color: 'var(--text-muted)',
          display: 'flex',
          gap: '0.5rem',
          alignItems: 'flex-start',
          lineHeight: 1.5
        }}>
          <span style={{ fontSize: '0.9rem' }}>⚖️</span>
          <div>
            <strong>Forensic Admissibility Scope:</strong> {data.disclaimer}
          </div>
        </div>
      </div>

      {/* 1. Shared Camera Hardware Clusters */}
      <div className="card" style={{ padding: '1.35rem 1.6rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Camera size={18} style={{ color: '#7c3aed' }} />
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-main)' }}>
                1. Shared Camera Hardware & Software Signatures
              </h3>
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
              Clusters of evidence sharing identical capture device make, model, serial number, or post-processing toolchains
            </div>
          </div>
          <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '0.2rem 0.55rem', borderRadius: '9999px', background: 'rgba(124, 58, 237, 0.1)', color: '#7c3aed' }}>
            {data.camera_clusters.length} Clusters Detected
          </span>
        </div>

        {data.camera_clusters.length === 0 ? (
          <div style={{ padding: '1.75rem', textAlign: 'center', color: 'var(--text-muted)', background: 'var(--surface-color-light)', borderRadius: '8px', border: '1px solid var(--border-color)', fontSize: '0.85rem' }}>
            No multi-evidence camera clusters detected. Evidence files either lack EXIF metadata tags or originate from distinct hardware profiles.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1rem' }}>
            {data.camera_clusters.map(cluster => (
              <div 
                key={cluster.cluster_id} 
                style={{ 
                  background: 'var(--surface-color-light)', 
                  border: '1px solid var(--border-color)', 
                  borderRadius: '10px', 
                  padding: '1.1rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.5rem',
                  cursor: 'pointer',
                  transition: 'transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease'
                }}
                onClick={() => setSelectedCluster(cluster)}
                onMouseEnter={e => {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 6px 18px rgba(0,0,0,0.06)';
                  e.currentTarget.style.borderColor = '#8b5cf6';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = 'none';
                  e.currentTarget.style.borderColor = 'var(--border-color)';
                }}
                title="Click to view detailed camera cluster dialog"
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#7c3aed', background: 'rgba(139, 92, 246, 0.12)', padding: '0.15rem 0.5rem', borderRadius: '4px', letterSpacing: '0.03em' }}>
                    {cluster.cluster_id}
                  </span>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                    {cluster.evidence_ids.length} Associated Images
                  </span>
                </div>

                <div style={{ fontSize: '0.925rem', fontWeight: 700, color: 'var(--text-main)' }}>
                  {cluster.make || 'Unknown Make'} {cluster.model || 'Unknown Model'}
                </div>

                {cluster.software && (
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    Toolchain: <code>{cluster.software}</code>
                  </div>
                )}
                {cluster.serial_number && (
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    Serial: <code>{cluster.serial_number}</code>
                  </div>
                )}

                <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '0.5rem', marginTop: '0.25rem', fontSize: '0.75rem', color: 'var(--text-main)', lineHeight: 1.4 }}>
                  <strong>Linked Evidence:</strong> {cluster.filenames.slice(0, 3).join(', ')}{cluster.filenames.length > 3 ? ` +${cluster.filenames.length - 3} more` : ''}
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.25rem' }}>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontStyle: 'italic', maxWidth: '75%' }}>
                    {cluster.forensic_significance}
                  </div>
                  <span style={{ fontSize: '0.72rem', color: '#7c3aed', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '0.2rem' }}>
                    Inspect <ArrowRight size={11} />
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 2. Chronological Capture Sequence */}
      <div className="card" style={{ padding: '1.35rem 1.6rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Clock size={18} style={{ color: '#2563eb' }} />
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-main)' }}>
                2. Chronological Capture Timeline & Proximity Sequence
              </h3>
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
              Reconstructed sequence of evidence based on embedded timestamps and ingestion records
            </div>
          </div>
          <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '0.2rem 0.55rem', borderRadius: '9999px', background: 'rgba(37, 99, 235, 0.1)', color: '#2563eb' }}>
            {data.temporal_sequence.length} Ordered Events
          </span>
        </div>

        {data.temporal_sequence.length === 0 ? (
          <div style={{ padding: '1.75rem', textAlign: 'center', color: 'var(--text-muted)', background: 'var(--surface-color-light)', borderRadius: '8px', border: '1px solid var(--border-color)', fontSize: '0.85rem' }}>
            No timeline data available across evidence corpus.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
            {data.temporal_sequence.map((item, idx) => (
              <div 
                key={item.evidence_id} 
                style={{ 
                  background: 'var(--surface-color-light)', 
                  border: '1px solid var(--border-color)', 
                  borderRadius: '8px', 
                  padding: '0.75rem 1.1rem', 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '0.65rem',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
                onClick={() => setSelectedTimelineItem(item)}
                onMouseEnter={e => {
                  e.currentTarget.style.borderColor = '#2563eb';
                  e.currentTarget.style.background = 'var(--surface-color)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = 'var(--border-color)';
                  e.currentTarget.style.background = 'var(--surface-color-light)';
                }}
                title="Click to view timeline item details dialog"
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                  <div style={{ 
                    width: '26px', 
                    height: '26px', 
                    borderRadius: '50%', 
                    background: '#2563eb', 
                    color: '#ffffff', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center', 
                    fontSize: '0.75rem', 
                    fontWeight: 800,
                    boxShadow: '0 2px 6px rgba(37, 99, 235, 0.3)'
                  }}>
                    {idx + 1}
                  </div>
                  <div>
                    <div style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-main)' }}>
                      {item.filename}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                      Source: <strong>{item.source_tag}</strong> • Evidence #{item.evidence_id}
                    </div>
                  </div>
                </div>

                <div style={{ textAlign: 'right', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <div>
                    <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-main)', fontFamily: 'monospace' }}>
                      {item.timestamp_utc || 'No Timestamp Tag'}
                    </div>
                    {item.timestamp_delta_seconds !== null && item.timestamp_delta_seconds !== undefined && (
                      <div style={{ fontSize: '0.72rem', fontWeight: 600, color: item.timestamp_delta_seconds < 10 ? '#059669' : 'var(--text-muted)' }}>
                        +{item.timestamp_delta_seconds}s from previous
                      </div>
                    )}
                  </div>
                  <ArrowRight size={13} style={{ color: 'var(--text-muted)' }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 3. Cross-Image Feature Keypoint Matching */}
      <div className="card" style={{ padding: '1.35rem 1.6rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <GitMerge size={18} style={{ color: '#d97706' }} />
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-main)' }}>
                3. Cross-Image Feature Keypoint Correlations
              </h3>
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
              Detected shared invariant descriptor keypoints between pairs of images (near-duplicate, splicing donor candidates, or shared scene angles)
            </div>
          </div>
          <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '0.2rem 0.55rem', borderRadius: '9999px', background: 'rgba(217, 119, 6, 0.1)', color: '#d97706' }}>
            {data.cross_image_matches.length} Matches Found
          </span>
        </div>

        {data.cross_image_matches.length === 0 ? (
          <div style={{ padding: '1.75rem', textAlign: 'center', color: 'var(--text-muted)', background: 'var(--surface-color-light)', borderRadius: '8px', border: '1px solid var(--border-color)', fontSize: '0.85rem' }}>
            No statistically significant cross-image feature keypoint clusters detected between evidence items.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            {data.cross_image_matches.map((m, idx) => (
              <div 
                key={idx} 
                style={{ 
                  background: 'var(--surface-color-light)', 
                  border: '1px solid var(--border-color)', 
                  borderRadius: '10px', 
                  padding: '1.1rem',
                  borderLeft: '4px solid #f59e0b',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.55rem',
                  boxShadow: 'var(--shadow-sm)'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.65rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                    <span style={{ 
                      fontSize: '0.7rem', 
                      fontWeight: 800, 
                      background: '#f59e0b', 
                      color: '#ffffff', 
                      padding: '0.18rem 0.55rem', 
                      borderRadius: '4px',
                      letterSpacing: '0.04em'
                    }}>
                      {m.confidence_label} CORRELATION
                    </span>
                    <strong style={{ fontSize: '0.925rem', color: 'var(--text-main)' }}>
                      {m.evidence_a_filename} &harr; {m.evidence_b_filename}
                    </strong>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                      ({m.shared_keypoint_count} descriptors)
                    </span>
                  </div>

                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <button 
                      type="button"
                      className="btn"
                      style={{ 
                        fontSize: '0.75rem', 
                        padding: '0.35rem 0.75rem',
                        background: 'var(--surface-color)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '6px',
                        fontWeight: 700,
                        color: 'var(--text-main)',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.35rem'
                      }}
                      onClick={() => setSelectedMatch(m)}
                      title="Open detailed match inspection dialog"
                    >
                      <Eye size={12} />
                      <span>Inspect Match Dialog</span>
                    </button>

                    <button 
                      type="button"
                      className="btn btn-secondary"
                      style={{ 
                        fontSize: '0.75rem', 
                        padding: '0.35rem 0.75rem',
                        borderRadius: '6px',
                        fontWeight: 700,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.35rem'
                      }}
                      onClick={() => navigate(`/cases/${caseId}/compare?a=${m.evidence_a_id}&b=${m.evidence_b_id}`)}
                    >
                      <span>Compare Side-by-Side</span>
                      <ArrowRight size={12} />
                    </button>
                  </div>
                </div>

                <div style={{ fontSize: '0.84rem', color: 'var(--text-main)', lineHeight: 1.55 }}>
                  {m.forensic_explanation}
                </div>

                <div style={{ fontSize: '0.75rem', color: '#b45309', background: 'rgba(245, 158, 11, 0.08)', padding: '0.4rem 0.65rem', borderRadius: '5px', border: '1px solid rgba(245, 158, 11, 0.2)' }}>
                  <strong>Limitation:</strong> {m.limitations}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* MODAL 1: FULL CORRELATION MATRIX SYNTHESIS DIALOG                         */}
      {/* ========================================================================= */}
      {showMatrixModal && typeof document !== 'undefined' && createPortal(
        <div 
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            width: '100vw',
            height: '100vh',
            background: 'rgba(0, 0, 0, 0.72)',
            backdropFilter: 'blur(3px)',
            WebkitBackdropFilter: 'blur(3px)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 999999,
            padding: '1.25rem',
            boxSizing: 'border-box'
          }}
          onClick={() => setShowMatrixModal(false)}
        >
          <div 
            style={{
              background: 'var(--surface-color-solid, #faf7f1)',
              borderRadius: '12px',
              width: '920px',
              maxWidth: '96vw',
              maxHeight: '88vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 24px 60px rgba(0,0,0,0.45)',
              border: '1px solid var(--border-color)',
              overflow: 'hidden',
              fontFamily: "'Plus Jakarta Sans', var(--font-sans)"
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '1.15rem 1.5rem',
              borderBottom: '1px solid var(--border-color)',
              background: 'var(--surface-color-light)'
            }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.2rem' }}>
                  <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#7c3aed', background: 'rgba(124, 58, 237, 0.12)', padding: '0.15rem 0.45rem', borderRadius: '4px', textTransform: 'uppercase' }}>
                    Case Corpus Linkage
                  </span>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                    {data.case_identifier}
                  </span>
                </div>
                <h3 style={{ margin: 0, fontSize: '1.18rem', fontWeight: 800, color: 'var(--text-main)' }}>
                  Cross-Image Correlation Matrix & Multi-Evidence Linkage
                </h3>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <button
                  type="button"
                  onClick={handleEvaluate}
                  disabled={evaluating}
                  style={{
                    background: 'var(--surface-color)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '5px',
                    padding: '0.35rem 0.75rem',
                    fontSize: '0.72rem',
                    fontWeight: 600,
                    color: 'var(--text-main)',
                    cursor: evaluating ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.35rem'
                  }}
                  title="Re-run correlation evaluation"
                >
                  <RefreshCw size={11} className={evaluating ? 'spin-animate' : ''} />
                  <span>{evaluating ? 'Evaluating...' : 'Re-Evaluate'}</span>
                </button>
                <button 
                  type="button"
                  onClick={() => setShowMatrixModal(false)}
                  aria-label="Close dialog"
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                    padding: '0.4rem',
                    borderRadius: '6px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Modal Navigation Tabs */}
            <div style={{
              display: 'flex',
              gap: '0.35rem',
              padding: '0.5rem 1.25rem',
              borderBottom: '1px solid var(--border-color)',
              background: 'var(--surface-color)',
              overflowX: 'auto'
            }}>
              {[
                { id: 'overview', label: 'Synthesis Overview', icon: <Layers size={14} /> },
                { id: 'matches', label: `Keypoint Matches (${data.cross_image_matches.length})`, icon: <GitMerge size={14} /> },
                { id: 'clusters', label: `Camera Clusters (${data.camera_clusters.length})`, icon: <Camera size={14} /> },
                { id: 'timeline', label: `Capture Timeline (${data.temporal_sequence.length})`, icon: <Clock size={14} /> },
              ].map(t => (
                <button
                  key={t.id}
                  onClick={() => setModalTab(t.id as any)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    padding: '0.4rem 0.8rem',
                    borderRadius: '6px',
                    fontSize: '0.78rem',
                    fontWeight: modalTab === t.id ? 700 : 500,
                    cursor: 'pointer',
                    border: modalTab === t.id ? '1px solid rgba(124, 58, 237, 0.3)' : '1px solid transparent',
                    background: modalTab === t.id ? 'rgba(124, 58, 237, 0.1)' : 'transparent',
                    color: modalTab === t.id ? '#7c3aed' : 'var(--text-muted)',
                    transition: 'all 0.15s ease'
                  }}
                >
                  {t.icon}
                  <span>{t.label}</span>
                </button>
              ))}
            </div>

            {/* Modal Body */}
            <div style={{ padding: '1.35rem 1.5rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {modalTab === 'overview' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {/* Stats Grid */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem' }}>
                    <div style={{ padding: '0.9rem', background: 'var(--surface-color-light)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>Evidence Evaluated</div>
                      <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-main)', marginTop: '0.2rem' }}>
                        {data.total_evidence_evaluated}
                      </div>
                    </div>
                    <div style={{ padding: '0.9rem', background: 'var(--surface-color-light)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                      <div style={{ fontSize: '0.72rem', color: '#7c3aed', fontWeight: 700, textTransform: 'uppercase' }}>Camera Clusters</div>
                      <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#7c3aed', marginTop: '0.2rem' }}>
                        {data.camera_clusters.length}
                      </div>
                    </div>
                    <div style={{ padding: '0.9rem', background: 'var(--surface-color-light)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                      <div style={{ fontSize: '0.72rem', color: '#d97706', fontWeight: 700, textTransform: 'uppercase' }}>Keypoint Matches</div>
                      <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#d97706', marginTop: '0.2rem' }}>
                        {data.cross_image_matches.length}
                      </div>
                    </div>
                    <div style={{ padding: '0.9rem', background: 'var(--surface-color-light)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                      <div style={{ fontSize: '0.72rem', color: '#2563eb', fontWeight: 700, textTransform: 'uppercase' }}>Timeline Sequence</div>
                      <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#2563eb', marginTop: '0.2rem' }}>
                        {data.temporal_sequence.length} items
                      </div>
                    </div>
                  </div>

                  {/* Summary Narrative */}
                  <div style={{ 
                    padding: '1.1rem 1.35rem', 
                    borderRadius: '10px', 
                    background: 'var(--surface-color-light)', 
                    border: '1px solid var(--border-color)',
                    borderLeft: '4px solid #7c3aed',
                    lineHeight: 1.6
                  }}>
                    <h4 style={{ margin: '0 0 0.4rem 0', fontSize: '0.95rem', fontWeight: 800, color: 'var(--text-main)' }}>
                      Multi-Evidence Corpus Synthesis Narrative
                    </h4>
                    <p style={{ margin: 0, fontSize: '0.84rem', color: 'var(--text-main)' }}>
                      {data.cross_image_matches.length > 0 
                        ? `Found ${data.cross_image_matches.length} pairwise descriptor keypoint matches across ${data.total_evidence_evaluated} items. Shared feature clusters suggest near-duplicate, common scene angles, or donor image splicing relationships.`
                        : `No strong feature keypoint clusters were detected among the ${data.total_evidence_evaluated} items in this case corpus. Modalities appear independent.`}
                    </p>
                  </div>

                  {/* ISO/IEC 27037 Standard Callout */}
                  <div style={{ 
                    padding: '0.85rem 1.1rem', 
                    background: 'linear-gradient(135deg, rgba(254, 243, 199, 0.45) 0%, rgba(253, 230, 138, 0.2) 100%)', 
                    borderRadius: '8px', 
                    border: '1px solid rgba(245, 158, 11, 0.3)', 
                    borderLeft: '4px solid #d97706',
                    fontSize: '0.78rem', 
                    color: '#78350f',
                    display: 'flex',
                    gap: '0.65rem',
                    alignItems: 'flex-start',
                    lineHeight: 1.55
                  }}>
                    <Info size={16} style={{ color: '#d97706', flexShrink: 0, marginTop: '0.15rem' }} />
                    <div>
                      <strong style={{ color: '#92400e', fontWeight: 750 }}>
                        EVIDENTIARY ADMISSIBILITY FRAMEWORK (ISO/IEC 27037):
                      </strong>{' '}
                      {data.disclaimer}
                    </div>
                  </div>
                </div>
              )}

              {modalTab === 'matches' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {data.cross_image_matches.length === 0 ? (
                    <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                      No cross-image keypoint correlations detected.
                    </div>
                  ) : (
                    data.cross_image_matches.map((m, idx) => (
                      <div key={idx} style={{ 
                        padding: '1rem', 
                        background: 'var(--surface-color-light)', 
                        border: '1px solid var(--border-color)', 
                        borderRadius: '8px',
                        borderLeft: '4px solid #f59e0b',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.45rem'
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span style={{ fontSize: '0.7rem', fontWeight: 800, background: '#f59e0b', color: 'white', padding: '0.15rem 0.45rem', borderRadius: '4px' }}>
                              {m.confidence_label}
                            </span>
                            <strong style={{ fontSize: '0.88rem', color: 'var(--text-main)' }}>
                              {m.evidence_a_filename} &harr; {m.evidence_b_filename}
                            </strong>
                          </div>
                          <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={() => {
                              setShowMatrixModal(false);
                              navigate(`/cases/${caseId}/compare?a=${m.evidence_a_id}&b=${m.evidence_b_id}`);
                            }}
                            style={{ fontSize: '0.72rem', padding: '0.3rem 0.65rem' }}
                          >
                            Compare Side-by-Side &rarr;
                          </button>
                        </div>
                        <div style={{ fontSize: '0.82rem', color: 'var(--text-main)' }}>
                          {m.forensic_explanation}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: '#b45309', fontStyle: 'italic' }}>
                          <strong>Limitation:</strong> {m.limitations}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {modalTab === 'clusters' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {data.camera_clusters.length === 0 ? (
                    <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                      No camera hardware clusters identified.
                    </div>
                  ) : (
                    data.camera_clusters.map(cluster => (
                      <div key={cluster.cluster_id} style={{ 
                        padding: '1rem', 
                        background: 'var(--surface-color-light)', 
                        border: '1px solid var(--border-color)', 
                        borderRadius: '8px',
                        borderLeft: '4px solid #7c3aed',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.4rem'
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#7c3aed' }}>
                            {cluster.cluster_id}
                          </span>
                          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                            {cluster.evidence_ids.length} images linked
                          </span>
                        </div>
                        <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-main)' }}>
                          {cluster.make || 'Unknown Make'} {cluster.model || 'Unknown Model'}
                        </div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                          Linked Files: {cluster.filenames.join(', ')}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontStyle: 'italic', marginTop: '0.2rem' }}>
                          {cluster.forensic_significance}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {modalTab === 'timeline' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {data.temporal_sequence.map((item, idx) => (
                    <div key={item.evidence_id} style={{ 
                      padding: '0.65rem 0.95rem', 
                      background: 'var(--surface-color-light)', 
                      border: '1px solid var(--border-color)', 
                      borderRadius: '6px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                        <span style={{ width: '22px', height: '22px', borderRadius: '50%', background: '#2563eb', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 800 }}>
                          {idx + 1}
                        </span>
                        <div>
                          <div style={{ fontSize: '0.825rem', fontWeight: 700, color: 'var(--text-main)' }}>{item.filename}</div>
                          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Source: {item.source_tag}</div>
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', fontSize: '0.78rem', fontWeight: 600, fontFamily: 'monospace' }}>
                        {item.timestamp_utc || 'No Timestamp'}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '0.85rem 1.5rem',
              borderTop: '1px solid var(--border-color)',
              background: 'var(--surface-color-light)'
            }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Evaluated {data.total_evidence_evaluated} items under case {data.case_identifier}
              </span>
              <button 
                type="button"
                className="btn btn-primary"
                onClick={() => setShowMatrixModal(false)}
                style={{ padding: '0.45rem 1.25rem', fontSize: '0.82rem' }}
              >
                Close Dialog
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: DETAIL DIALOG FOR SPECIFIC MATCH PAIR                             */}
      {/* ========================================================================= */}
      {selectedMatch && typeof document !== 'undefined' && createPortal(
        <div 
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            width: '100vw',
            height: '100vh',
            background: 'rgba(0, 0, 0, 0.72)',
            backdropFilter: 'blur(3px)',
            WebkitBackdropFilter: 'blur(3px)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 999999,
            padding: '1.25rem',
            boxSizing: 'border-box'
          }}
          onClick={() => setSelectedMatch(null)}
        >
          <div 
            style={{
              background: 'var(--surface-color-solid, #faf7f1)',
              borderRadius: '12px',
              width: '840px',
              maxWidth: '96vw',
              maxHeight: '88vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 24px 60px rgba(0,0,0,0.45)',
              border: '1px solid var(--border-color)',
              overflow: 'hidden',
              fontFamily: "'Plus Jakarta Sans', var(--font-sans)"
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '1.15rem 1.5rem',
              borderBottom: '1px solid var(--border-color)',
              background: 'var(--surface-color-light)'
            }}>
              <div>
                <span style={{ fontSize: '0.7rem', fontWeight: 800, background: '#f59e0b', color: '#ffffff', padding: '0.15rem 0.5rem', borderRadius: '4px', textTransform: 'uppercase' }}>
                  {selectedMatch.confidence_label} Correlation
                </span>
                <h3 style={{ margin: '0.25rem 0 0 0', fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-main)' }}>
                  Cross-Image Keypoint Feature Match Inspection
                </h3>
              </div>
              <button 
                type="button"
                onClick={() => setSelectedMatch(null)}
                aria-label="Close dialog"
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  padding: '0.4rem',
                  borderRadius: '6px'
                }}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ padding: '1.35rem 1.5rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {/* Previews Row */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem' }}>
                <div style={{ background: 'var(--surface-color-light)', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                  <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '0.4rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    Evidence #{selectedMatch.evidence_a_id}: {selectedMatch.evidence_a_filename}
                  </div>
                  <div style={{ height: '180px', background: '#000', borderRadius: '6px', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <AuthenticatedImage 
                      src={`/api/evidence/${selectedMatch.evidence_a_id}/raw`} 
                      alt={selectedMatch.evidence_a_filename} 
                      style={{ maxWidth: '100%', maxHeight: '180px', objectFit: 'contain' }} 
                    />
                  </div>
                </div>

                <div style={{ background: 'var(--surface-color-light)', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                  <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '0.4rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    Evidence #{selectedMatch.evidence_b_id}: {selectedMatch.evidence_b_filename}
                  </div>
                  <div style={{ height: '180px', background: '#000', borderRadius: '6px', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <AuthenticatedImage 
                      src={`/api/evidence/${selectedMatch.evidence_b_id}/raw`} 
                      alt={selectedMatch.evidence_b_filename} 
                      style={{ maxWidth: '100%', maxHeight: '180px', objectFit: 'contain' }} 
                    />
                  </div>
                </div>
              </div>

              {/* Match Stats */}
              <div style={{ display: 'flex', gap: '1rem', padding: '0.75rem 1rem', background: 'var(--surface-color-light)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                <div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 700 }}>SHARED KEYPOINTS</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#f59e0b' }}>{selectedMatch.shared_keypoint_count}</div>
                </div>
                <div style={{ borderLeft: '1px solid var(--border-color)', paddingLeft: '1rem' }}>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 700 }}>CONFIDENCE LABEL</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-main)' }}>{selectedMatch.confidence_label}</div>
                </div>
              </div>

              {/* Narrative */}
              <div>
                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.35rem' }}>
                  Forensic Explanation
                </div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-main)', lineHeight: 1.6, background: 'var(--surface-color-light)', padding: '0.85rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                  {selectedMatch.forensic_explanation}
                </div>
              </div>

              {/* Limitation */}
              <div style={{ fontSize: '0.76rem', color: '#b45309', background: 'rgba(245, 158, 11, 0.08)', padding: '0.65rem 0.85rem', borderRadius: '6px', border: '1px solid rgba(245, 158, 11, 0.25)' }}>
                <strong>Limitation Notice:</strong> {selectedMatch.limitations}
              </div>
            </div>

            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '0.85rem 1.5rem',
              borderTop: '1px solid var(--border-color)',
              background: 'var(--surface-color-light)'
            }}>
              <button 
                type="button"
                className="btn btn-secondary"
                onClick={() => setSelectedMatch(null)}
                style={{ padding: '0.45rem 1rem', fontSize: '0.8rem' }}
              >
                Close
              </button>

              <button 
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  const url = `/cases/${caseId}/compare?a=${selectedMatch.evidence_a_id}&b=${selectedMatch.evidence_b_id}`;
                  setSelectedMatch(null);
                  navigate(url);
                }}
                style={{ padding: '0.45rem 1.25rem', fontSize: '0.82rem', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
              >
                <span>Open in Side-by-Side Comparison Mode</span>
                <ArrowRight size={13} />
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ========================================================================= */}
      {/* MODAL 3: DETAIL DIALOG FOR CAMERA CLUSTER                                 */}
      {/* ========================================================================= */}
      {selectedCluster && typeof document !== 'undefined' && createPortal(
        <div 
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            width: '100vw',
            height: '100vh',
            background: 'rgba(0, 0, 0, 0.72)',
            backdropFilter: 'blur(3px)',
            WebkitBackdropFilter: 'blur(3px)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 999999,
            padding: '1.25rem',
            boxSizing: 'border-box'
          }}
          onClick={() => setSelectedCluster(null)}
        >
          <div 
            style={{
              background: 'var(--surface-color-solid, #faf7f1)',
              borderRadius: '12px',
              width: '780px',
              maxWidth: '96vw',
              maxHeight: '88vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 24px 60px rgba(0,0,0,0.45)',
              border: '1px solid var(--border-color)',
              overflow: 'hidden',
              fontFamily: "'Plus Jakarta Sans', var(--font-sans)"
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '1.15rem 1.5rem',
              borderBottom: '1px solid var(--border-color)',
              background: 'var(--surface-color-light)'
            }}>
              <div>
                <span style={{ fontSize: '0.7rem', fontWeight: 800, background: 'rgba(124, 58, 237, 0.12)', color: '#7c3aed', padding: '0.15rem 0.5rem', borderRadius: '4px', textTransform: 'uppercase' }}>
                  {selectedCluster.cluster_id} Profile
                </span>
                <h3 style={{ margin: '0.25rem 0 0 0', fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-main)' }}>
                  Camera Hardware & Toolchain Fingerprint
                </h3>
              </div>
              <button 
                type="button"
                onClick={() => setSelectedCluster(null)}
                aria-label="Close dialog"
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  padding: '0.4rem',
                  borderRadius: '6px'
                }}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ padding: '1.35rem 1.5rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem' }}>
                <div style={{ padding: '0.85rem', background: 'var(--surface-color-light)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 700 }}>MAKE & MODEL</div>
                  <div style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-main)', marginTop: '0.2rem' }}>
                    {selectedCluster.make || 'Unknown'} {selectedCluster.model || ''}
                  </div>
                </div>
                <div style={{ padding: '0.85rem', background: 'var(--surface-color-light)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 700 }}>SOFTWARE TOOLCHAIN</div>
                  <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-main)', marginTop: '0.2rem' }}>
                    {selectedCluster.software || 'None Recorded'}
                  </div>
                </div>
                <div style={{ padding: '0.85rem', background: 'var(--surface-color-light)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 700 }}>SERIAL NUMBER</div>
                  <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-main)', marginTop: '0.2rem' }}>
                    {selectedCluster.serial_number || 'Not Embedded in EXIF'}
                  </div>
                </div>
              </div>

              <div>
                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>
                  Associated Evidence Files ({selectedCluster.filenames.length})
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  {selectedCluster.filenames.map((name, i) => (
                    <div key={i} style={{ 
                      padding: '0.65rem 0.85rem', 
                      background: 'var(--surface-color-light)', 
                      borderRadius: '6px', 
                      border: '1px solid var(--border-color)',
                      fontSize: '0.82rem',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}>
                      <span>{name}</span>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Evidence #{selectedCluster.evidence_ids[i] || ''}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', background: 'var(--surface-color-light)', padding: '0.75rem', borderRadius: '6px', fontStyle: 'italic', border: '1px solid var(--border-color)' }}>
                <strong>Forensic Significance:</strong> {selectedCluster.forensic_significance}
              </div>
            </div>

            <div style={{
              display: 'flex',
              justifyContent: 'flex-end',
              padding: '0.85rem 1.5rem',
              borderTop: '1px solid var(--border-color)',
              background: 'var(--surface-color-light)'
            }}>
              <button 
                type="button"
                className="btn btn-primary"
                onClick={() => setSelectedCluster(null)}
                style={{ padding: '0.45rem 1.25rem', fontSize: '0.82rem' }}
              >
                Close Dialog
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ========================================================================= */}
      {/* MODAL 4: DETAIL DIALOG FOR TIMELINE ITEM                                  */}
      {/* ========================================================================= */}
      {selectedTimelineItem && typeof document !== 'undefined' && createPortal(
        <div 
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            width: '100vw',
            height: '100vh',
            background: 'rgba(0, 0, 0, 0.72)',
            backdropFilter: 'blur(3px)',
            WebkitBackdropFilter: 'blur(3px)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 999999,
            padding: '1.25rem',
            boxSizing: 'border-box'
          }}
          onClick={() => setSelectedTimelineItem(null)}
        >
          <div 
            style={{
              background: 'var(--surface-color-solid, #faf7f1)',
              borderRadius: '12px',
              width: '640px',
              maxWidth: '96vw',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 24px 60px rgba(0,0,0,0.45)',
              border: '1px solid var(--border-color)',
              overflow: 'hidden',
              fontFamily: "'Plus Jakarta Sans', var(--font-sans)"
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '1.15rem 1.5rem',
              borderBottom: '1px solid var(--border-color)',
              background: 'var(--surface-color-light)'
            }}>
              <div>
                <span style={{ fontSize: '0.7rem', fontWeight: 800, background: 'rgba(37, 99, 235, 0.12)', color: '#2563eb', padding: '0.15rem 0.5rem', borderRadius: '4px', textTransform: 'uppercase' }}>
                  Timeline Event
                </span>
                <h3 style={{ margin: '0.25rem 0 0 0', fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-main)' }}>
                  Temporal Ingestion & EXIF Sequence
                </h3>
              </div>
              <button 
                type="button"
                onClick={() => setSelectedTimelineItem(null)}
                aria-label="Close dialog"
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  padding: '0.4rem',
                  borderRadius: '6px'
                }}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ padding: '1.35rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <div style={{ padding: '0.85rem', background: 'var(--surface-color-light)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 700 }}>FILENAME & EVIDENCE ID</div>
                <div style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--text-main)', marginTop: '0.2rem' }}>
                  {selectedTimelineItem.filename}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                  Internal ID: #{selectedTimelineItem.evidence_id} • Source: {selectedTimelineItem.source_tag}
                </div>
              </div>

              <div style={{ padding: '0.85rem', background: 'var(--surface-color-light)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 700 }}>RECORDED TIMESTAMP (UTC)</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#2563eb', fontFamily: 'monospace', marginTop: '0.2rem' }}>
                  {selectedTimelineItem.timestamp_utc || 'No Timestamp Found'}
                </div>
                {selectedTimelineItem.timestamp_delta_seconds !== null && selectedTimelineItem.timestamp_delta_seconds !== undefined && (
                  <div style={{ fontSize: '0.78rem', fontWeight: 600, color: selectedTimelineItem.timestamp_delta_seconds < 10 ? '#059669' : 'var(--text-muted)', marginTop: '0.25rem' }}>
                    Sequence Delta: +{selectedTimelineItem.timestamp_delta_seconds} seconds from previous image
                  </div>
                )}
              </div>
            </div>

            <div style={{
              display: 'flex',
              justifyContent: 'flex-end',
              padding: '0.85rem 1.5rem',
              borderTop: '1px solid var(--border-color)',
              background: 'var(--surface-color-light)'
            }}>
              <button 
                type="button"
                className="btn btn-primary"
                onClick={() => setSelectedTimelineItem(null)}
                style={{ padding: '0.45rem 1.25rem', fontSize: '0.82rem' }}
              >
                Close Dialog
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default CrossImageCorrelation;
