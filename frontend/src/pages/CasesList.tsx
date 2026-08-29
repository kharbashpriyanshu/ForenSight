import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

export default function CasesList() {
  const [cases, setCases] = useState<any[]>([]);
  const [newCaseTitle, setNewCaseTitle] = useState('');
  const navigate = useNavigate();

  const fetchCases = () => {
    fetch('http://localhost:8000/api/cases')
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
    fetch('http://localhost:8000/api/cases', {
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
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '2rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h1>Investigations</h1>
      </div>
      
      <div className="card" style={{ marginBottom: '2rem' }}>
        <h2 className="card-title">Open New Case</h2>
        <form onSubmit={handleCreateCase} style={{ display: 'flex', gap: '1rem' }}>
          <input 
            type="text" 
            placeholder="Case Title / Reference" 
            value={newCaseTitle} 
            onChange={e => setNewCaseTitle(e.target.value)}
            style={{ flex: 1, padding: '0.75rem', borderRadius: '0.25rem', border: '1px solid var(--border-color)', background: 'var(--surface-color-light)', color: 'var(--text-main)' }}
          />
          <button type="submit" className="btn btn-primary" disabled={!newCaseTitle}>
            Initialize Workspace
          </button>
        </form>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' }}>
        {cases.map((c: any) => (
          <Link key={c.id} to={`/cases/${c.case_identifier}`} style={{ textDecoration: 'none', color: 'inherit' }}>
            <div className="card" style={{ cursor: 'pointer', transition: 'transform 0.2s', height: '100%' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{c.case_identifier}</span>
                <span className="status-badge">{c.status}</span>
              </div>
              <h3 style={{ margin: '0 0 1rem 0' }}>{c.title}</h3>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                Created: {new Date(c.created_at).toLocaleDateString()}
              </div>
            </div>
          </Link>
        ))}
        {cases.length === 0 && (
          <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '3rem', color: 'var(--text-muted)', background: 'var(--surface-color)', borderRadius: '0.5rem' }}>
            No investigations found. Create one to begin.
          </div>
        )}
      </div>
    </div>
  );
}
