import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { fetchApi } from '../api';


export default function CasesList() {
  const [cases, setCases] = useState<any[]>([]);
  const [newCaseTitle, setNewCaseTitle] = useState('');
  const navigate = useNavigate();

  const fetchCases = () => {
    fetchApi('/cases')
      .then(res => res.json())
      .then(data => setCases(data))
      .catch(err => console.error("Error fetching cases", err));
  };

  useEffect(() => {
    fetchCases();
  }, []);

  const handleCreateCase = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCaseTitle) return;
    fetchApi('/cases', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: newCaseTitle })
    })
      .then(res => res.json())
      .then(data => {
        setNewCaseTitle('');
        navigate(`/cases/${data.case_identifier}`);
      })
      .catch(err => console.error(err));
  };

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '1rem 0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
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
      </div>
      
      <div className="card" style={{ marginBottom: '2rem', borderTop: '3px solid #2563eb' }}>
        <h2 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span>📂</span> Open New Forensic Dossier
        </h2>
        <form onSubmit={handleCreateCase} style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          <input 
            type="text" 
            placeholder="Investigation Reference / Target Identifier (e.g., CAS-2026-089)" 
            value={newCaseTitle} 
            onChange={e => setNewCaseTitle(e.target.value)}
            style={{ flex: '1 1 300px' }}
          />
          <button type="submit" className="btn btn-primary" disabled={!newCaseTitle}>
            + Initialize Workspace
          </button>
        </form>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.25rem' }}>
        {cases.map((c: any) => (
          <Link key={c.id} to={`/cases/${c.case_identifier}`} style={{ textDecoration: 'none', color: 'inherit' }}>
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
        {cases.length === 0 && (
          <div className="card" style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '3.5rem 1rem', color: 'var(--text-muted)' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>🔍</div>
            <div style={{ fontWeight: 600, fontSize: '1.1rem', color: 'var(--text-main)', marginBottom: '0.25rem' }}>
              No Active Investigations Found
            </div>
            <p style={{ fontSize: '0.85rem' }}>Initialize a new case dossier above to begin forensic acquisition and analysis.</p>
          </div>
        )}
      </div>
    </div>
  );
}
