import { useEffect, useState } from 'react';
import { fetchApi } from '../api';


let activeHealthPromise: Promise<any> | null = null;

function requestSystemHealth(): Promise<any> {
  if (!activeHealthPromise) {
    activeHealthPromise = fetchApi('/health', { cache: 'no-store' })
      .then(async res => {
        if (!res.ok) throw new Error(`Health check failed (${res.status}).`);
        return res.json();
      })
      .finally(() => {
        activeHealthPromise = null;
      });
  }
  return activeHealthPromise;
}

export default function SystemHealth() {
  const [health, setHealth] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let active = true;

    requestSystemHealth()
      .then(data => {
        if (active) {
          setHealth(data);
          setError('');
          setLoading(false);
        }
      })
      .catch((err: Error) => {
        if (!active || err?.name === 'AbortError') return;
        setHealth({
          status: 'unhealthy',
          api_gateway: 'unavailable',
          platform_mode: 'unavailable',
          background_execution: 'unavailable',
          database: 'unavailable',
          redis: 'unavailable',
          celery_worker: 'unavailable',
          storage: 'unavailable',
        });
        setError(err.message || 'Could not reach the health service.');
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [retryKey]);

  const retryHealthCheck = () => {
    if (loading) return;
    setLoading(true);
    setError('');
    setRetryKey(key => key + 1);
  };

  if (loading) return <div className="card" role="status">Checking system health...</div>;

  const gatewayRaw = String(health?.api_gateway || (error ? 'unavailable' : 'healthy')).toLowerCase();
  const gatewayHealthy = gatewayRaw === 'healthy';

  const platformModeRaw = String(health?.platform_mode || health?.status || 'unknown').toLowerCase();
  const isEagerMode = platformModeRaw === 'dev_eager_mode' || health?.background_execution === 'eager_fallback';

  const platformSummary = (() => {
    if (platformModeRaw === 'unavailable') {
      return { label: 'UNAVAILABLE', color: 'var(--danger-color)', detail: 'Health endpoint unreachable' };
    }
    if (platformModeRaw === 'unhealthy' || String(health?.status || '').toLowerCase() === 'unhealthy') {
      return { label: 'UNHEALTHY', color: 'var(--danger-color)', detail: 'Core database or storage dependency failed' };
    }
    if (platformModeRaw === 'dev_eager_mode') {
      return { label: 'DEV EAGER MODE', color: 'var(--primary-color)', detail: 'Core services healthy; background tasks run in-process' };
    }
    if (platformModeRaw === 'degraded' || String(health?.status || '').toLowerCase() === 'degraded') {
      return { label: 'DEGRADED', color: 'var(--warning-color)', detail: 'Async broker or worker dependency unavailable' };
    }
    if (platformModeRaw === 'operational' || String(health?.status || '').toLowerCase() === 'healthy') {
      return { label: 'HEALTHY', color: 'var(--success-color)', detail: 'All core and async worker services operational' };
    }
    return { label: 'UNKNOWN', color: 'var(--text-muted)', detail: 'Platform status unavailable' };
  })();

  const dbHealthy = health?.database === 'healthy';
  const redisHealthy = health?.redis === 'healthy';
  const celeryHealthy = health?.celery_worker === 'healthy';
  const celeryEager = health?.celery_worker === 'eager_fallback';
  const storageHealthy = health?.storage === 'healthy';

  return (
    <div className="card">
      {error && (
        <div className="error-banner" role="alert" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
          <span>{error}</span>
          <button className="btn btn-secondary" onClick={retryHealthCheck}>Retry</button>
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.5rem' }}>
        <div>
          <h2 className="card-title" style={{ margin: 0 }}>System Health & Observability</h2>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
            {platformSummary.detail}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
          <span
            className="status-badge"
            data-testid="platform-summary-badge"
            style={{
              textTransform: 'uppercase',
              borderColor: platformSummary.color,
              color: platformSummary.color,
              fontWeight: 700,
            }}
          >
            Platform: {platformSummary.label}
          </span>
          <span className="status-badge" style={{ textTransform: 'uppercase' }}>
            Environment: {health?.environment || 'development'}
          </span>
        </div>
      </div>
      
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
        {/* 1. API Gateway */}
        <div data-testid="health-card-gateway" style={{ border: '1px solid var(--border-color)', borderRadius: '8px', padding: '1.25rem', textAlign: 'center', background: 'var(--surface-color-light)' }}>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.5rem', fontWeight: 600 }}>API GATEWAY</div>
          <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: gatewayHealthy ? 'var(--success-color)' : 'var(--danger-color)' }}>
            {gatewayHealthy ? 'HEALTHY' : 'UNAVAILABLE'}
          </div>
          <div style={{ fontSize: '0.75rem', marginTop: '0.5rem', color: 'var(--text-muted)' }}>
            {gatewayHealthy ? 'FastAPI Gateway Responding' : 'Gateway Unreachable'}
          </div>
        </div>

        {/* 2. Database */}
        <div data-testid="health-card-database" style={{ border: '1px solid var(--border-color)', borderRadius: '8px', padding: '1.25rem', textAlign: 'center', background: 'var(--surface-color-light)' }}>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.5rem', fontWeight: 600 }}>DATABASE</div>
          <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: dbHealthy ? 'var(--success-color)' : 'var(--danger-color)' }}>
            {dbHealthy ? 'HEALTHY' : 'UNAVAILABLE'}
          </div>
          <div style={{ fontSize: '0.75rem', marginTop: '0.5rem', color: 'var(--text-muted)' }}>SQLite / PostgreSQL</div>
        </div>
        
        {/* 3. Redis Broker */}
        <div data-testid="health-card-redis" style={{ border: '1px solid var(--border-color)', borderRadius: '8px', padding: '1.25rem', textAlign: 'center', background: 'var(--surface-color-light)' }}>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.5rem', fontWeight: 600 }}>REDIS BROKER</div>
          <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: redisHealthy ? 'var(--success-color)' : isEagerMode ? 'var(--warning-color)' : 'var(--danger-color)' }}>
            {redisHealthy ? 'HEALTHY' : 'UNAVAILABLE'}
          </div>
          <div style={{ fontSize: '0.75rem', marginTop: '0.5rem', color: 'var(--text-muted)' }}>
            {redisHealthy ? 'Connected' : isEagerMode ? 'Optional in local eager mode' : 'Unavailable (required for async queue)'}
          </div>
        </div>

        {/* 4. Celery Worker */}
        <div data-testid="health-card-celery" style={{ border: '1px solid var(--border-color)', borderRadius: '8px', padding: '1.25rem', textAlign: 'center', background: 'var(--surface-color-light)' }}>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.5rem', fontWeight: 600 }}>CELERY WORKER</div>
          <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: celeryHealthy ? 'var(--success-color)' : celeryEager ? 'var(--primary-color)' : 'var(--warning-color)' }}>
            {celeryHealthy ? 'HEALTHY' : celeryEager ? 'EAGER FALLBACK' : 'UNAVAILABLE'}
          </div>
          <div style={{ fontSize: '0.75rem', marginTop: '0.5rem', color: 'var(--text-muted)' }}>
            {celeryHealthy ? 'Async Workers Ready' : celeryEager ? 'In-process execution active' : 'No active workers detected'}
          </div>
        </div>

        {/* 5. Storage */}
        <div data-testid="health-card-storage" style={{ border: '1px solid var(--border-color)', borderRadius: '8px', padding: '1.25rem', textAlign: 'center', background: 'var(--surface-color-light)' }}>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.5rem', fontWeight: 600 }}>STORAGE SYSTEM</div>
          <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: storageHealthy ? 'var(--success-color)' : 'var(--danger-color)' }}>
            {storageHealthy ? 'HEALTHY' : 'UNHEALTHY'}
          </div>
          <div style={{ fontSize: '0.75rem', marginTop: '0.5rem', color: 'var(--text-muted)' }}>Evidence & Artifact Storage</div>
        </div>
      </div>
    </div>
  );
}
