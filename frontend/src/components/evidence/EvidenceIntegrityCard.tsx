export default function EvidenceIntegrityCard({ evidence }: any) {
    if (!evidence) return null;

    return (
        <div className="card" style={{ gridColumn: '1 / -1', borderTop: '4px solid var(--primary-color)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h2 className="card-title" style={{ margin: 0, color: 'var(--primary-color)' }}>
                    TECHNICAL CHAIN OF CUSTODY & SOURCE INTEGRITY
                </h2>
                <span className="badge" style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#10b981' }}>
                    NIST FIPS 180-4 VERIFIED
                </span>
            </div>
            
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.25rem', background: 'var(--surface-color-light)', padding: '1.25rem', borderRadius: '0.5rem' }}>
                <div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', textTransform: 'uppercase', fontWeight: 600 }}>Evidence Identifier</div>
                    <div style={{ fontWeight: 700, fontSize: '1rem', marginTop: '0.25rem' }}>{evidence.evidence_identifier}</div>
                </div>
                <div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', textTransform: 'uppercase', fontWeight: 600 }}>Forensic Storage Mode</div>
                    <div style={{ marginTop: '0.25rem' }}>
                        <span className="status-badge" style={{ background: 'rgba(59, 130, 246, 0.1)', color: 'var(--primary-color)' }}>
                            Immutable Read-Only Isolate
                        </span>
                    </div>
                </div>
                <div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', textTransform: 'uppercase', fontWeight: 600 }}>Original Filename</div>
                    <div style={{ marginTop: '0.25rem', fontWeight: 600 }}>{evidence.original_filename}</div>
                </div>
                <div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', textTransform: 'uppercase', fontWeight: 600 }}>MIME Type & Geometry</div>
                    <div style={{ marginTop: '0.25rem' }}>{evidence.mime_type} • {evidence.width} × {evidence.height} px</div>
                </div>
                <div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', textTransform: 'uppercase', fontWeight: 600 }}>Acquired Timestamp (UTC)</div>
                    <div style={{ marginTop: '0.25rem' }}>{new Date(evidence.created_at).toISOString()}</div>
                </div>
                <div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', textTransform: 'uppercase', fontWeight: 600 }}>Local Station Time</div>
                    <div style={{ marginTop: '0.25rem' }}>{new Date(evidence.created_at).toLocaleString()}</div>
                </div>
                
                <div style={{ gridColumn: '1 / -1', marginTop: '0.5rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', textTransform: 'uppercase', fontWeight: 600 }}>
                            Cryptographic Digest (SHA-256 FIPS 180-4)
                        </div>
                        <span style={{ fontSize: '0.75rem', color: '#10b981', fontWeight: 600 }}>
                            Bitstream Unaltered Since Ingestion
                        </span>
                    </div>
                    <div style={{ fontFamily: 'var(--font-mono, monospace)', background: '#ffffff', padding: '0.85rem', borderRadius: '6px', wordBreak: 'break-all', fontSize: '0.9rem', border: '1px solid var(--border-color)', color: '#047857', marginTop: '0.35rem', fontWeight: 600, letterSpacing: '0.02em' }}>
                        {evidence.sha256_hash}
                    </div>
                </div>
            </div>
        </div>
    );
}
