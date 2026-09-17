import { useEffect, useState } from 'react';
import { fetchApi } from '../api';


export default function SystemHealth() {
  const [health, setHealth] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchApi('/health')
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h2 className="card-title" style={{ margin: 0 }}>System Health & Observability</h2>
        <span className="status-badge" style={{ textTransform: 'uppercase' }}>
          Environment: {health?.environment || 'development'}
        </span>
      </div>
      
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
        {/* 1. API Gateway */}
        <div style={{ border: '1px solid var(--border-color)', borderRadius: '8px', padding: '1.25rem', textAlign: 'center', background: 'var(--surface-color-light)' }}>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.5rem', fontWeight: 600 }}>API GATEWAY</div>
          <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: health?.status !== 'unhealthy' ? 'var(--primary-color)' : 'var(--danger-color)' }}>
            {health?.status !== 'unhealthy' ? (health?.status === 'degraded' ? 'DEGRADED' : 'HEALTHY') : 'UNAVAILABLE'}
          </div>
          <div style={{ fontSize: '0.75rem', marginTop: '0.5rem', color: 'var(--text-muted)' }}>FastAPI Gateway</div>
        </div>

        {/* 2. Database */}
        <div style={{ border: '1px solid var(--border-color)', borderRadius: '8px', padding: '1.25rem', textAlign: 'center', background: 'var(--surface-color-light)' }}>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.5rem', fontWeight: 600 }}>DATABASE</div>
          <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: health?.database === 'healthy' ? 'var(--primary-color)' : 'var(--danger-color)' }}>
            {health?.database === 'healthy' ? 'HEALTHY' : 'UNAVAILABLE'}
          </div>
          <div style={{ fontSize: '0.75rem', marginTop: '0.5rem', color: 'var(--text-muted)' }}>SQLite / PostgreSQL</div>
        </div>
        
        {/* 3. Redis Broker */}
        <div style={{ border: '1px solid var(--border-color)', borderRadius: '8px', padding: '1.25rem', textAlign: 'center', background: 'var(--surface-color-light)' }}>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.5rem', fontWeight: 600 }}>REDIS BROKER</div>
          <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: health?.redis === 'healthy' ? 'var(--primary-color)' : 'var(--warning-color, #eab308)' }}>
            {health?.redis === 'healthy' ? 'HEALTHY' : 'UNAVAILABLE'}
          </div>
          <div style={{ fontSize: '0.75rem', marginTop: '0.5rem', color: 'var(--text-muted)' }}>
            {health?.redis === 'healthy' ? 'Connected' : 'Unavailable locally (requires Docker)'}
          </div>
        </div>

        {/* 4. Celery Worker */}
        <div style={{ border: '1px solid var(--border-color)', borderRadius: '8px', padding: '1.25rem', textAlign: 'center', background: 'var(--surface-color-light)' }}>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.5rem', fontWeight: 600 }}>CELERY WORKER</div>
          <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: health?.celery_worker === 'healthy' ? 'var(--primary-color)' : health?.celery_worker === 'eager_fallback' ? '#3b82f6' : 'var(--warning-color, #eab308)' }}>
            {health?.celery_worker === 'healthy' ? 'ACTIVE' : health?.celery_worker === 'eager_fallback' ? 'EAGER FALLBACK' : 'OFFLINE'}
          </div>
          <div style={{ fontSize: '0.75rem', marginTop: '0.5rem', color: 'var(--text-muted)' }}>
            {health?.celery_worker === 'healthy' ? 'Async Workers Ready' : health?.celery_worker === 'eager_fallback' ? 'In-process dev fallback' : 'No active workers detected'}
          </div>
        </div>

        {/* 5. Storage */}
        <div style={{ border: '1px solid var(--border-color)', borderRadius: '8px', padding: '1.25rem', textAlign: 'center', background: 'var(--surface-color-light)' }}>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.5rem', fontWeight: 600 }}>STORAGE SYSTEM</div>
          <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: health?.storage === 'healthy' ? 'var(--primary-color)' : 'var(--danger-color)' }}>
            {health?.storage === 'healthy' ? 'HEALTHY' : 'DEGRADED'}
          </div>
          <div style={{ fontSize: '0.75rem', marginTop: '0.5rem', color: 'var(--text-muted)' }}>Evidence & Artifact Storage</div>
        </div>
      </div>
    </div>
  );
}
