
export default function EvidenceIntegrityCard({ evidence }: any) {
    if (!evidence) return null;

    return (
        <div className="card" style={{ gridColumn: '1 / -1', borderTop: '4px solid var(--primary-color)' }}>
            <h2 className="card-title" style={{ marginBottom: '1rem', color: 'var(--primary-color)' }}>SOURCE EVIDENCE INTEGRITY</h2>
            
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem', background: 'var(--surface-color-light)', padding: '1.5rem', borderRadius: '0.5rem' }}>
                <div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem', textTransform: 'uppercase' }}>Evidence ID</div>
                    <div style={{ fontWeight: 'bold', fontSize: '1.1rem', marginTop: '0.25rem' }}>{evidence.evidence_identifier}</div>
                </div>
                <div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem', textTransform: 'uppercase' }}>Acquisition Status</div>
                    <div style={{ marginTop: '0.25rem' }}><span className="status-badge" style={{ background: 'rgba(59, 130, 246, 0.1)', color: 'var(--primary-color)' }}>Verified & Secured</span></div>
                </div>
                <div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem', textTransform: 'uppercase' }}>Original Filename</div>
                    <div style={{ marginTop: '0.25rem' }}>{evidence.original_filename}</div>
                </div>
                <div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem', textTransform: 'uppercase' }}>MIME Type</div>
                    <div style={{ marginTop: '0.25rem' }}>{evidence.mime_type}</div>
                </div>
                <div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem', textTransform: 'uppercase' }}>Dimensions</div>
                    <div style={{ marginTop: '0.25rem' }}>{evidence.width} x {evidence.height} px</div>
                </div>
                <div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem', textTransform: 'uppercase' }}>Acquired At</div>
                    <div style={{ marginTop: '0.25rem' }}>{new Date(evidence.created_at).toLocaleString()}</div>
                </div>
                
                <div style={{ gridColumn: '1 / -1', marginTop: '0.5rem' }}>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem', textTransform: 'uppercase' }}>SHA-256 Hash Signature</div>
                    <div style={{ fontFamily: 'monospace', background: 'var(--background-color)', padding: '1rem', borderRadius: '0.25rem', wordBreak: 'break-all', fontSize: '1.1rem', border: '1px solid var(--border-color)', color: '#10b981', marginTop: '0.5rem' }}>
                        {evidence.sha256_hash}
                    </div>
                </div>
            </div>
        </div>
    );
}
