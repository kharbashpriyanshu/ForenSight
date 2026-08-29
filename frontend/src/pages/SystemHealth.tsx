import { useEffect, useState } from 'react';

export default function SystemHealth() {
  const [health, setHealth] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('http://localhost:8000/api/health')
      .then(res => res.json())
      .then(data => {
        setHealth(data);
        setLoading(false);
      })
      .catch(() => {
        setHealth({ status: 'UNAVAILABLE', components: { db: 'UNAVAILABLE', redis: 'UNAVAILABLE', celery: 'UNAVAILABLE' } });
        setLoading(false);
      });
  }, []);

  if (loading) return <div>Checking system health...</div>;

  return (
    <div className="card">
      <h2 className="card-title">System Health & Observability</h2>
      
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginTop: '1rem' }}>
        <div style={{ border: '1px solid var(--border-color)', borderRadius: '8px', padding: '1rem', textAlign: 'center' }}>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>API GATEWAY</div>
          <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: health?.status !== 'unhealthy' ? 'var(--primary-color)' : 'var(--danger-color)' }}>
            {health?.status !== 'unhealthy' ? (health?.status === 'degraded' ? 'DEGRADED' : 'HEALTHY') : 'UNAVAILABLE'}
          </div>
        </div>

        <div style={{ border: '1px solid var(--border-color)', borderRadius: '8px', padding: '1rem', textAlign: 'center' }}>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>DATABASE</div>
          <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: health?.database === 'healthy' ? 'var(--primary-color)' : 'var(--danger-color)' }}>
            {health?.database === 'healthy' ? 'HEALTHY' : 'UNAVAILABLE'}
          </div>
        </div>
        
        <div style={{ border: '1px solid var(--border-color)', borderRadius: '8px', padding: '1rem', textAlign: 'center' }}>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>ANALYSIS WORKER (CELERY / REDIS)</div>
          <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: health?.redis === 'healthy' ? 'var(--primary-color)' : 'var(--danger-color)' }}>
            {health?.redis === 'healthy' ? 'HEALTHY' : 'UNAVAILABLE'}
          </div>
          <div style={{ fontSize: '0.75rem', marginTop: '0.5rem', color: 'var(--text-muted)' }}>
            {health?.redis === 'healthy' ? 'Worker broker is connected.' : 'Worker broker unavailable locally. Requires Docker/Redis.'}
          </div>
        </div>
      </div>
    </div>
  );
}
