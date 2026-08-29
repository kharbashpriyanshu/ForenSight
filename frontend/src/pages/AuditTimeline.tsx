import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

export default function AuditTimeline() {
  const { caseId } = useParams<{ caseId: string }>();
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (caseId) {
      fetch(`http://localhost:8000/api/cases/${caseId}/audit`)
        .then(res => res.json())
        .then(data => {
          setEvents(data);
          setLoading(false);
        })
        .catch(err => {
          console.error(err);
          setError(true);
          setLoading(false);
        });
    }
  }, [caseId]);

  if (loading) return <div>Loading timeline...</div>;
  if (error) return <div style={{color: 'var(--danger-color)'}}>Error loading timeline</div>;

  return (
    <div className="card">
      <h2 className="card-title">Investigation Timeline</h2>
      {events.length === 0 ? (
        <p style={{ color: 'var(--text-muted)' }}>No audit events found.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1rem' }}>
          {events.map((evt, idx) => (
            <div key={idx} style={{ 
              display: 'flex', 
              gap: '1rem', 
              borderLeft: '2px solid var(--primary-color)',
              paddingLeft: '1rem',
              position: 'relative'
            }}>
              <div style={{
                position: 'absolute',
                left: '-5px',
                top: '5px',
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: 'var(--primary-color)'
              }} />
              <div style={{ flex: '0 0 150px', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                {new Date(evt.timestamp).toLocaleString()}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600 }}>{evt.event_type.replace(/_/g, ' ')}</div>
                {evt.safe_metadata && (
                  <pre style={{ 
                    background: 'var(--surface-color-light)', 
                    padding: '0.5rem', 
                    borderRadius: '0.25rem',
                    fontSize: '0.8rem',
                    marginTop: '0.25rem'
                  }}>
                    {evt.safe_metadata}
                  </pre>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
