import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { fetchApi } from '../api';

interface CustodyVerificationResult {
  evidence_id: number;
  evidence_identifier: string;
  filename: string;
  stored_path: string;
  ingest_sha256_hash: string;
  current_disk_sha256_hash: string;
  integrity_intact: boolean;
  verified_at: string;
  verifier: string;
  status: string;
  message: string;
}

interface CustodyTimelineEvent {
  id: number;
  timestamp: string;
  event_type: string;
  actor: string;
  evidence_id?: number;
  evidence_filename?: string;
  details: any;
}

interface CustodyData {
  case_identifier: string;
  case_created_at: string;
  total_evidence_items: number;
  all_hashes_intact: boolean;
  evidence_summaries: CustodyVerificationResult[];
  custody_timeline: CustodyTimelineEvent[];
}

const ChainOfCustody: React.FC = () => {
  const { caseId } = useParams<{ caseId: string }>();

  const [data, setData] = useState<CustodyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [verifyingId, setVerifyingId] = useState<number | null>(null);
  const [error, setError] = useState('');

  const fetchCustody = () => {
    setLoading(true);
    fetchApi(`/cases/${caseId}/chain-of-custody`)
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch chain of custody ledger');
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

  const handleVerifySingle = (evidenceId: number) => {
    setVerifyingId(evidenceId);
    fetchApi(`/evidence/${evidenceId}/verify-custody`, { method: 'POST' })
      .then(res => res.json())
      .then(() => {
        setVerifyingId(null);
        // Refresh full ledger to show new verification event
        fetchCustody();
      })
      .catch(() => setVerifyingId(null));
  };

  useEffect(() => {
    fetchCustody();
  }, [caseId]);

  if (loading) return <div style={{ padding: '2rem', color: 'var(--text-muted)' }}>Validating physical bitstream hashes and cryptographic custody ledger...</div>;
  if (error) return <div className="error-banner">{error}</div>;
  if (!data) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Top Banner */}
      <div className="card" style={{ borderLeft: `4px solid ${data.all_hashes_intact ? '#10b981' : '#ef4444'}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
              <span style={{ fontSize: '0.7rem', fontWeight: 800, color: data.all_hashes_intact ? '#10b981' : '#ef4444', background: data.all_hashes_intact ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)', padding: '0.2rem 0.5rem', borderRadius: '4px', textTransform: 'uppercase' }}>
                {data.all_hashes_intact ? 'CRYPTOGRAPHIC INTEGRITY: VERIFIED' : 'INTEGRITY ALERT: TAMPER/MISMATCH'}
              </span>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                {data.total_evidence_items} Registered Evidence Items
              </span>
            </div>
            <h1 style={{ fontSize: '1.5rem', margin: '0.25rem 0' }}>Chain of Custody & Cryptographic Ledger</h1>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: 0, maxWidth: '800px' }}>
              Immutable cryptographic ledger tracking digital evidence from initial acquisition and SHA-256 ingestion hashing through analysis, analyst review, and courtroom export.
            </p>
          </div>
          <button 
            className="primary-button" 
            onClick={fetchCustody}
            style={{ fontSize: '0.8rem', padding: '0.35rem 0.75rem' }}
          >
            🛡️ Verify All Hashes Now
          </button>
        </div>

        <div style={{ marginTop: '1rem', display: 'flex', gap: '1.5rem', flexWrap: 'wrap', fontSize: '0.8rem' }}>
          <div>Ingest Hash Standard: <strong>SHA-256 (FIPS 180-4)</strong></div>
          <div>Case Created: <strong>{new Date(data.case_created_at).toLocaleString()}</strong></div>
          <div>Storage Integrity: <strong style={{ color: data.all_hashes_intact ? '#10b981' : '#ef4444' }}>{data.all_hashes_intact ? '100% Bit-for-Bit Intact' : 'Discrepancy Detected'}</strong></div>
        </div>
      </div>

      {/* Evidence Integrity Ledger */}
      <div className="card">
        <div style={{ marginBottom: '1rem' }}>
          <h3 style={{ margin: 0, fontSize: '1.1rem' }}>Physical Evidence Ingestion & Hash Ledger</h3>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Comparing recorded acquisition hash against live physical disk read
          </div>
        </div>

        {data.evidence_summaries.length === 0 ? (
          <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>No evidence ingested yet.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-color)', textAlign: 'left', color: 'var(--text-muted)' }}>
                  <th style={{ padding: '0.5rem' }}>Evidence ID</th>
                  <th style={{ padding: '0.5rem' }}>Source Filename</th>
                  <th style={{ padding: '0.5rem' }}>Ingest SHA-256 Hash</th>
                  <th style={{ padding: '0.5rem' }}>Current Disk Hash</th>
                  <th style={{ padding: '0.5rem' }}>Integrity State</th>
                  <th style={{ padding: '0.5rem', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.evidence_summaries.map(item => (
                  <tr key={item.evidence_id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                    <td style={{ padding: '0.6rem 0.5rem', fontWeight: 600 }}>
                      <code>{item.evidence_identifier}</code>
                    </td>
                    <td style={{ padding: '0.6rem 0.5rem' }}>
                      {item.filename}
                    </td>
                    <td style={{ padding: '0.6rem 0.5rem', fontFamily: 'monospace', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      {item.ingest_sha256_hash.substring(0, 16)}...{item.ingest_sha256_hash.substring(48)}
                    </td>
                    <td style={{ padding: '0.6rem 0.5rem', fontFamily: 'monospace', fontSize: '0.75rem', color: item.integrity_intact ? '#10b981' : '#ef4444' }}>
                      {item.current_disk_sha256_hash ? `${item.current_disk_sha256_hash.substring(0, 16)}...${item.current_disk_sha256_hash.substring(48)}` : 'MISSING'}
                    </td>
                    <td style={{ padding: '0.6rem 0.5rem' }}>
                      <span 
                        style={{ 
                          fontSize: '0.7rem', 
                          fontWeight: 700, 
                          padding: '0.15rem 0.45rem', 
                          borderRadius: '4px',
                          background: item.integrity_intact ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                          color: item.integrity_intact ? '#10b981' : '#ef4444'
                        }}
                      >
                        {item.status}
                      </span>
                    </td>
                    <td style={{ padding: '0.6rem 0.5rem', textAlign: 'right' }}>
                      <button 
                        className="secondary-button"
                        style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem' }}
                        disabled={verifyingId === item.evidence_id}
                        onClick={() => handleVerifySingle(item.evidence_id)}
                      >
                        {verifyingId === item.evidence_id ? 'Checking...' : 'Verify Now'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Custody Event Timeline */}
      <div className="card">
        <div style={{ marginBottom: '1rem' }}>
          <h3 style={{ margin: 0, fontSize: '1.1rem' }}>Immutable Chain of Custody Timeline</h3>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Chronological audit ledger of evidence movements, analyses, verifications, and report generations
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {data.custody_timeline.map(event => (
            <div 
              key={event.id}
              style={{ 
                background: 'var(--surface-color-light)', 
                border: '1px solid var(--border-color)', 
                borderRadius: '6px', 
                padding: '0.65rem 1rem',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '0.5rem',
                fontSize: '0.8rem'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <span style={{ 
                  fontSize: '0.7rem', 
                  fontWeight: 700, 
                  padding: '0.15rem 0.45rem', 
                  borderRadius: '4px',
                  background: event.event_type.includes('VERIFIED') ? 'rgba(16, 185, 129, 0.1)' : 'rgba(59, 130, 246, 0.1)',
                  color: event.event_type.includes('VERIFIED') ? '#10b981' : '#3b82f6'
                }}>
                  {event.event_type}
                </span>
                <div>
                  <span style={{ color: 'var(--text-color)', fontWeight: 600 }}>
                    {event.evidence_filename ? `[${event.evidence_filename}] ` : ''}
                    Actor: <strong>{event.actor}</strong>
                  </span>
                  {event.details && event.details.status && (
                    <span style={{ color: 'var(--text-muted)', marginLeft: '0.5rem' }}>
                      Status: {event.details.status}
                    </span>
                  )}
                </div>
              </div>

              <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                {new Date(event.timestamp).toLocaleString()}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ChainOfCustody;
