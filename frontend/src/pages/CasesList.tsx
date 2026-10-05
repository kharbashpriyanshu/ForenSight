import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { fetchApi, prefetchApi } from '../api';

export default function CasesList() {
  const [cases, setCases] = useState<any[]>([]);
  const [newCaseTitle, setNewCaseTitle] = useState('');
  const [claimSummary, setClaimSummary] = useState('');
  const [reportedEventDate, setReportedEventDate] = useState('');
  const [reportedLocation, setReportedLocation] = useState('');
  const [sourceReferenceUrl, setSourceReferenceUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const navigate = useNavigate();

  const fetchCases = () => {
    setLoading(true);
    setError('');
    fetchApi('/cases')
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.detail || 'Failed to load cases');
        }
        setCases(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(err => {
        console.error("Error fetching cases", err);
        setError(err.message || 'Unable to connect to investigation service');
        setCases([]);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchCases();
  }, []);

  const handleCreateCase = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCaseTitle.trim()) return;
    setCreating(true);
    fetchApi('/cases', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: newCaseTitle.trim(),
        claim_summary: claimSummary.trim() || null,
        reported_event_date: reportedEventDate || null,
        reported_location: reportedLocation.trim() || null,
        source_reference_url: sourceReferenceUrl.trim() || null,
      })
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || 'Failed to initialize case');
        setNewCaseTitle('');
        setClaimSummary('');
        setReportedEventDate('');
        setReportedLocation('');
        setSourceReferenceUrl('');
        setCreating(false);
        navigate(`/cases/${data.case_identifier}`);
      })
      .catch(err => {
        console.error(err);
        setError(err.message || 'Could not initialize workspace');
        setCreating(false);
      });
  };

  const filteredCases = cases.filter(c => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      (c.title && c.title.toLowerCase().includes(q)) ||
      (c.case_identifier && c.case_identifier.toLowerCase().includes(q))
    );
  });

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '1rem 0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
            <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#1d4ed8', background: 'rgba(37, 99, 235, 0.08)', border: '1px solid rgba(37, 99, 235, 0.2)', padding: '0.15rem 0.5rem', borderRadius: '9999px', letterSpacing: '0.05em' }}>
              STATION MASTER DIRECTORY
            </span>
          </div>
          <h1 style={{ fontSize: '2rem', fontWeight: 800, letterSpacing: '-0.025em' }}>Forensic Investigations</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginTop: '0.25rem' }}>
            Active multi-modality evidence dossiers and tamper verification workspaces
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <input
            type="text"
            placeholder="Search cases by reference or name..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{
              padding: '0.45rem 0.85rem',
              borderRadius: '6px',
              border: '1px solid var(--border-color)',
              background: 'var(--surface-color)',
              color: 'var(--text-main)',
              fontSize: '0.85rem',
              width: '280px'
            }}
          />
        </div>
      </div>

      {error && (
        <div style={{
          padding: '0.85rem 1rem',
          background: 'rgba(239, 68, 68, 0.1)',
          border: '1px solid #ef4444',
          borderRadius: '8px',
          color: '#ef4444',
          fontSize: '0.85rem',
          marginBottom: '1.5rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div><strong>Error:</strong> {error}</div>
          <button 
            onClick={fetchCases}
            style={{
              background: '#ef4444',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              padding: '0.3rem 0.6rem',
              fontSize: '0.75rem',
              cursor: 'pointer'
            }}
          >
            Retry
          </button>
        </div>
      )}
      
      <div className="card" style={{ marginBottom: '2rem', borderTop: '3px solid #2563eb' }}>
        <h2 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span>📂</span> Open New Forensic Dossier
        </h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '-0.5rem', marginBottom: '1rem' }}>
          Record the reported claim and source context separately from what image analysis later observes.
        </p>
        <form onSubmit={handleCreateCase} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '0.75rem' }}>
          <input 
            type="text" 
            placeholder="Investigation Reference / Target Identifier (e.g., CAS-2026-089)" 
            value={newCaseTitle} 
            onChange={e => setNewCaseTitle(e.target.value)}
            style={{ gridColumn: '1 / -1' }}
            disabled={creating}
          />
          <textarea
            placeholder="What is being claimed about these images? (reported claim, not a verified conclusion)"
            value={claimSummary}
            onChange={e => setClaimSummary(e.target.value)}
            rows={3}
            disabled={creating}
            style={{ gridColumn: '1 / -1', resize: 'vertical', padding: '0.65rem', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--surface-color)', color: 'var(--text-main)' }}
          />
          <input type="date" aria-label="Reported event date" value={reportedEventDate} onChange={e => setReportedEventDate(e.target.value)} disabled={creating} />
          <input type="text" placeholder="Reported location (if known)" value={reportedLocation} onChange={e => setReportedLocation(e.target.value)} disabled={creating} />
          <input type="url" placeholder="Source URL (optional)" value={sourceReferenceUrl} onChange={e => setSourceReferenceUrl(e.target.value)} disabled={creating} style={{ gridColumn: '1 / -1' }} />
          <button type="submit" className="btn btn-primary" disabled={!newCaseTitle.trim() || creating} style={{ gridColumn: '1 / -1' }}>
            {creating ? 'Initializing...' : '+ Initialize Workspace'}
          </button>
        </form>
      </div>

      {loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.25rem' }}>
          {[1, 2, 3].map(n => (
            <div key={n} className="card" style={{ minHeight: '160px', opacity: 0.6, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Loading dossier records...</div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.25rem' }}>
          {filteredCases.map((c: any) => (
            <Link 
              key={c.id} 
              to={`/cases/${c.case_identifier}`} 
              onMouseEnter={() => {
                prefetchApi(`/cases/${c.case_identifier}`);
                prefetchApi(`/cases/${c.case_identifier}/evidence`);
                prefetchApi(`/cases/${c.case_identifier}/timeline`);
              }}
              style={{ textDecoration: 'none', color: 'inherit' }}
            >
              <div className="card" style={{ 
                cursor: 'pointer', 
                height: '100%', 
                display: 'flex', 
                flexDirection: 'column', 
                justifyContent: 'space-between',
                marginBottom: 0
              }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                    <code style={{ fontSize: '0.75rem', fontWeight: 600 }}>{c.case_identifier}</code>
                    <span className={`status-badge ${c.status === 'Open' ? '' : 'pending'}`}>
                      {c.status || 'Active'}
                    </span>
                  </div>
                  <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-main)' }}>
                    {c.title}
                  </h3>
                </div>
                <div style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'center', 
                  marginTop: '1.25rem', 
                  paddingTop: '0.75rem', 
                  borderTop: '1px solid var(--border-color-translucent)',
                  fontSize: '0.75rem', 
                  color: 'var(--text-muted)' 
                }}>
                  <span>Created {new Date(c.created_at).toLocaleDateString()}</span>
                  <span style={{ color: '#2563eb', fontWeight: 600 }}>Open Workspace &rarr;</span>
                </div>
              </div>
            </Link>
          ))}
          {filteredCases.length === 0 && (
            <div className="card" style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '3.5rem 1rem', color: 'var(--text-muted)' }}>
              <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>🔍</div>
              <div style={{ fontWeight: 600, fontSize: '1.1rem', color: 'var(--text-main)', marginBottom: '0.25rem' }}>
                {searchQuery ? 'No Matching Cases Found' : 'No Active Investigations Found'}
              </div>
              <p style={{ fontSize: '0.85rem' }}>
                {searchQuery ? 'Try adjusting your search query.' : 'Initialize a new case dossier above to begin forensic acquisition and analysis.'}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
