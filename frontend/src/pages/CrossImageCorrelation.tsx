import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { fetchApi } from '../api';

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

  if (loading) return <div style={{ padding: '2rem', color: 'var(--text-muted)' }}>Analyzing multi-evidence correlations across case corpus...</div>;
  if (error) return <div className="error-banner">{error}</div>;
  if (!data) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Header Card */}
      <div className="card" style={{ borderLeft: '4px solid #8b5cf6' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
              <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#8b5cf6', background: 'rgba(139, 92, 246, 0.1)', padding: '0.2rem 0.5rem', borderRadius: '4px', textTransform: 'uppercase' }}>
                Multi-Evidence Synthesis
              </span>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                {data.total_evidence_evaluated} Evidence Items Evaluated
              </span>
            </div>
            <h1 style={{ fontSize: '1.5rem', margin: '0.25rem 0' }}>Cross-Image Correlation Matrix</h1>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: 0, maxWidth: '800px' }}>
              Correlates shared camera hardware fingerprints, capture temporal sequences, and cross-image descriptor keypoints across the entire case corpus.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button 
              className="primary-button" 
              onClick={handleEvaluate} 
              disabled={evaluating}
              style={{ fontSize: '0.8rem', padding: '0.35rem 0.75rem' }}
            >
              {evaluating ? 'Evaluating Matrix...' : '⚡ Re-Evaluate Cross Correlation'}
            </button>
          </div>
        </div>

        <div style={{ marginTop: '1rem', padding: '0.5rem 0.75rem', background: 'var(--surface-color-light)', border: '1px dashed var(--border-color)', borderRadius: '6px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
          ⚖️ {data.disclaimer}
        </div>
      </div>

      {/* 1. Shared Camera Hardware Clusters */}
      <div className="card">
        <div style={{ marginBottom: '1rem' }}>
          <h3 style={{ margin: 0, fontSize: '1.1rem' }}>1. Shared Camera Hardware & Software Signatures</h3>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Clusters of evidence sharing identical capture device make, model, serial number, or post-processing toolchains
          </div>
        </div>

        {data.camera_clusters.length === 0 ? (
          <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-muted)', background: 'var(--surface-color-light)', borderRadius: '6px', fontSize: '0.85rem' }}>
            No multi-evidence camera clusters detected. Evidence files either lack EXIF metadata tags or originate from distinct hardware profiles.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1rem' }}>
            {data.camera_clusters.map(cluster => (
              <div key={cluster.cluster_id} style={{ background: 'var(--surface-color-light)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#8b5cf6', background: 'rgba(139, 92, 246, 0.1)', padding: '0.15rem 0.45rem', borderRadius: '4px' }}>
                    {cluster.cluster_id}
                  </span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    {cluster.evidence_ids.length} Associated Images
                  </span>
                </div>

                <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-color)', marginBottom: '0.35rem' }}>
                  {cluster.make || 'Unknown Make'} {cluster.model || 'Unknown Model'}
                </div>

                {cluster.software && (
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
                    Toolchain: <code>{cluster.software}</code>
                  </div>
                )}
                {cluster.serial_number && (
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
                    Serial: <code>{cluster.serial_number}</code>
                  </div>
                )}

                <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '0.5rem', marginTop: '0.5rem', fontSize: '0.75rem', color: 'var(--text-main)', lineHeight: '1.4' }}>
                  <strong>Linked Evidence:</strong> {cluster.filenames.join(', ')}
                </div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.35rem', fontStyle: 'italic' }}>
                  {cluster.forensic_significance}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 2. Chronological Capture Sequence */}
      <div className="card">
        <div style={{ marginBottom: '1rem' }}>
          <h3 style={{ margin: 0, fontSize: '1.1rem' }}>2. Chronological Capture Timeline & Proximity Sequence</h3>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Reconstructed sequence of evidence based on embedded timestamps and ingestion records
          </div>
        </div>

        {data.temporal_sequence.length === 0 ? (
          <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-muted)', background: 'var(--surface-color-light)', borderRadius: '6px', fontSize: '0.85rem' }}>
            No timeline data available.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {data.temporal_sequence.map((item, idx) => (
              <div 
                key={item.evidence_id} 
                style={{ 
                  background: 'var(--surface-color-light)', 
                  border: '1px solid var(--border-color)', 
                  borderRadius: '6px', 
                  padding: '0.65rem 1rem', 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '0.5rem'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: '#3b82f6', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 700 }}>
                    {idx + 1}
                  </div>
                  <div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-color)' }}>
                      {item.filename}
                    </div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                      Source: {item.source_tag} • Evidence #{item.evidence_id}
                    </div>
                  </div>
                </div>

                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-color)' }}>
                    {item.timestamp_utc || 'No Timestamp Tag'}
                  </div>
                  {item.timestamp_delta_seconds !== null && item.timestamp_delta_seconds !== undefined && (
                    <div style={{ fontSize: '0.7rem', color: item.timestamp_delta_seconds < 10 ? '#10b981' : 'var(--text-muted)' }}>
                      +{item.timestamp_delta_seconds}s from previous
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 3. Cross-Image Feature Keypoint Matching */}
      <div className="card">
        <div style={{ marginBottom: '1rem' }}>
          <h3 style={{ margin: 0, fontSize: '1.1rem' }}>3. Cross-Image Feature Keypoint Correlations</h3>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Detected shared invariant descriptor keypoints between pairs of images (near-duplicate, splicing donor candidates, or shared scene angles)
          </div>
        </div>

        {data.cross_image_matches.length === 0 ? (
          <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-muted)', background: 'var(--surface-color-light)', borderRadius: '6px', fontSize: '0.85rem' }}>
            No statistically significant cross-image feature keypoint clusters detected between evidence items.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {data.cross_image_matches.map((m, idx) => (
              <div 
                key={idx} 
                style={{ 
                  background: 'var(--surface-color-light)', 
                  border: '1px solid var(--border-color)', 
                  borderRadius: '6px', 
                  padding: '1rem',
                  borderLeft: '4px solid #f59e0b'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ fontSize: '0.7rem', fontWeight: 800, background: '#f59e0b', color: 'white', padding: '0.15rem 0.45rem', borderRadius: '4px' }}>
                      {m.confidence_label} CORRELATION
                    </span>
                    <strong style={{ fontSize: '0.9rem', color: 'var(--text-color)' }}>
                      {m.evidence_a_filename} &harr; {m.evidence_b_filename}
                    </strong>
                  </div>
                  <button 
                    className="secondary-button"
                    style={{ fontSize: '0.75rem', padding: '0.25rem 0.6rem' }}
                    onClick={() => navigate(`/cases/${caseId}/compare?a=${m.evidence_a_id}&b=${m.evidence_b_id}`)}
                  >
                    Open in Compare Mode &rarr;
                  </button>
                </div>

                <div style={{ fontSize: '0.85rem', color: 'var(--text-color)', marginBottom: '0.5rem' }}>
                  {m.forensic_explanation}
                </div>

                <div style={{ fontSize: '0.75rem', color: '#f59e0b', fontStyle: 'italic' }}>
                  <strong>Limitation:</strong> {m.limitations}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default CrossImageCorrelation;
