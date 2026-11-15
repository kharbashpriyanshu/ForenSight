import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { KeyRound, ShieldCheck, X } from 'lucide-react';
import { fetchApi } from '../../api';
import { useAuth } from '../../contexts/AuthContext';

interface SessionRow {
  session_identifier: string;
  created_at: string;
  last_used_at: string;
  expires_at: string;
  user_agent?: string;
  current: boolean;
}

export default function AccountSecurityPanel() {
  const [open, setOpen] = useState(false);
  const [mfaEnabled, setMfaEnabled] = useState(false);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [secret, setSecret] = useState('');
  const [otpauthUri, setOtpauthUri] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const { logout } = useAuth();

  const loadSecurity = async () => {
    const [sessionResponse, listResponse] = await Promise.all([
      fetchApi('/auth/session', { cache: 'no-store' }),
      fetchApi('/auth/sessions', { cache: 'no-store' }),
    ]);
    if (!sessionResponse.ok || !listResponse.ok) throw new Error('Could not load session security information');
    const sessionData = await sessionResponse.json();
    setMfaEnabled(Boolean(sessionData.mfa_enabled));
    setSessions(await listResponse.json());
  };

  useEffect(() => {
    if (!open) return;
    setError('');
    setMessage('');
    void loadSecurity().catch((reason: Error) => setError(reason.message));
  }, [open]);

  const requestJson = async (endpoint: string, body: unknown) => {
    const response = await fetchApi(endpoint, { method: 'POST', body: JSON.stringify(body) });
    const data = response.status === 204 ? {} : await response.json();
    if (!response.ok) throw new Error(data.detail || 'Security action failed');
    return data;
  };

  const startMfaSetup = async () => {
    setBusy(true); setError(''); setMessage(''); setRecoveryCodes([]);
    try {
      const result = await requestJson('/auth/mfa/setup', { password });
      setSecret(result.secret);
      setOtpauthUri(result.otpauth_uri);
      setCode('');
      setMessage('Add this account to your authenticator, then enter its current six digit code.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not start MFA setup');
    } finally { setBusy(false); }
  };

  const enableMfa = async () => {
    setBusy(true); setError('');
    try {
      const result = await requestJson('/auth/mfa/enable', { code });
      setMfaEnabled(true);
      setRecoveryCodes(result.recovery_codes || []);
      setSecret(''); setOtpauthUri(''); setPassword(''); setCode('');
      setMessage('Multi-factor authentication is enabled. Store these recovery codes safely.');
      await loadSecurity();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not enable MFA');
    } finally { setBusy(false); }
  };

  const disableMfa = async () => {
    setBusy(true); setError('');
    try {
      await requestJson('/auth/mfa/disable', { password, code });
      setMfaEnabled(false); setPassword(''); setCode(''); setRecoveryCodes([]);
      setMessage('Multi-factor authentication is disabled.');
      await loadSecurity();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not disable MFA');
    } finally { setBusy(false); }
  };

  const revokeSession = async (session: SessionRow) => {
    setBusy(true); setError('');
    try {
      const response = await fetchApi(`/auth/sessions/${encodeURIComponent(session.session_identifier)}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Could not revoke that session');
      if (session.current) {
        await logout();
        setOpen(false);
        return;
      }
      await loadSecurity();
      setMessage('Session revoked.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not revoke session');
    } finally { setBusy(false); }
  };

  return (
    <>
      <button className="btn btn-secondary" type="button" onClick={() => setOpen(true)} aria-label="Account security">
        <ShieldCheck size={15} aria-hidden="true" /> Security
      </button>
      {open && typeof document !== 'undefined' && createPortal(
        <div 
          role="presentation" 
          onMouseDown={(event) => { if (event.target === event.currentTarget && recoveryCodes.length === 0) setOpen(false); }} 
          style={{ 
            position: 'fixed', 
            inset: 0, 
            zIndex: 9999, 
            background: 'rgba(10, 14, 20, 0.72)', 
            backdropFilter: 'blur(6px)',
            WebkitBackdropFilter: 'blur(6px)',
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            padding: '1.5rem',
            animation: 'demoFadeIn 0.2s ease-out'
          }}
        >
          <section 
            role="dialog" 
            aria-modal="true" 
            aria-labelledby="security-title" 
            className="card" 
            style={{ 
              width: '100%', 
              maxWidth: '680px', 
              maxHeight: '90vh', 
              overflowY: 'auto', 
              padding: '1.75rem',
              background: 'var(--surface-color-solid, #ffffff)',
              borderRadius: '16px',
              border: '1px solid var(--border-default)',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.45)',
              display: 'flex',
              flexDirection: 'column',
              gap: '1.25rem'
            }}
          >
            <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', borderBottom: '1px solid var(--border-subtle, rgba(0, 0, 0, 0.08))', paddingBottom: '0.75rem' }}>
              <h2 id="security-title" style={{ margin: 0, display: 'flex', gap: '.65rem', alignItems: 'center', fontSize: '1.25rem', color: 'var(--text-main)' }}>
                <KeyRound size={20} style={{ color: 'var(--accent-color, #b8872a)' }} /> 
                Account Security & Sessions
              </h2>
              <button 
                className="btn btn-secondary" 
                type="button" 
                disabled={recoveryCodes.length > 0} 
                onClick={() => setOpen(false)} 
                aria-label="Close security panel"
                style={{ padding: '0.4rem', borderRadius: '8px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <X size={16} />
              </button>
            </header>
            {error && <p role="alert" style={{ color: '#b91c1c', margin: 0 }}>{error}</p>}
            {message && <p role="status" style={{ margin: 0 }}>{message}</p>}

            <div>
              <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.05rem', color: 'var(--text-main)' }}>Multi-factor authentication</h3>
              <p style={{ margin: '0 0 0.75rem 0', color: 'var(--text-muted)', fontSize: '0.9rem' }}>{mfaEnabled ? 'Authenticator MFA is enabled for this account.' : 'Authenticator MFA is not enabled.'}</p>
              {!mfaEnabled ? <>
                {!secret && <>
                  <label style={{ display: 'block', marginBottom: '.5rem', fontSize: '0.88rem' }}>Confirm your password
                    <input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} style={{ display: 'block', width: '100%', marginTop: '.35rem' }} />
                  </label>
                  <button className="btn btn-primary" type="button" disabled={busy || !password} onClick={() => void startMfaSetup()}>{busy ? 'Working…' : 'Set up authenticator'}</button>
                </>}
                {secret && <div style={{ display: 'grid', gap: '.6rem', margin: '1rem 0' }}>
                  <p>Enter the setup key in your authenticator app:</p>
                  <code style={{ overflowWrap: 'anywhere', padding: '.65rem', background: 'var(--surface-subtle, #f3f4f6)' }}>{secret}</code>
                  <details><summary>Manual setup URI</summary><code style={{ display: 'block', overflowWrap: 'anywhere', padding: '.5rem' }}>{otpauthUri}</code></details>
                  <label>Current authenticator code
                    <input type="text" autoComplete="one-time-code" value={code} onChange={(event) => setCode(event.target.value)} style={{ display: 'block', width: '100%', marginTop: '.35rem' }} />
                  </label>
                  <button className="btn btn-primary" type="button" disabled={busy || code.length < 6} onClick={() => void enableMfa()}>{busy ? 'Working…' : 'Verify and enable'}</button>
                </div>}
              </> : <>
                {recoveryCodes.length > 0 && <div role="alert" style={{ padding: '.75rem', border: '1px solid var(--border-color)', margin: '.75rem 0' }}>
                  <strong>Save these one-time recovery codes now. They will not be shown again.</strong>
                  <code style={{ display: 'block', marginTop: '.5rem', overflowWrap: 'anywhere' }}>{recoveryCodes.join(' · ')}</code>
                  <button className="btn btn-secondary" type="button" style={{ marginTop: '.65rem' }} onClick={() => setRecoveryCodes([])}>I saved these recovery codes</button>
                </div>}
                <label style={{ display: 'block', marginBottom: '.5rem' }}>Confirm password to disable MFA
                  <input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} style={{ display: 'block', width: '100%', marginTop: '.35rem' }} />
                </label>
                <label style={{ display: 'block', marginBottom: '.5rem' }}>Authenticator or recovery code
                  <input type="text" autoComplete="one-time-code" value={code} onChange={(event) => setCode(event.target.value)} style={{ display: 'block', width: '100%', marginTop: '.35rem' }} />
                </label>
                <button className="btn btn-secondary" type="button" disabled={busy || !password || code.length < 6} onClick={() => void disableMfa()}>{busy ? 'Working…' : 'Disable MFA'}</button>
              </>}
            </div>

            <div>
              <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.05rem', color: 'var(--text-main)' }}>Active sessions</h3>
              {sessions.length === 0 ? <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>No active sessions.</p> : <div style={{ display: 'grid', gap: '.65rem' }}>
                {sessions.map((session) => <div key={session.session_identifier} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', border: '1px solid var(--border-color, #e5e7eb)', borderRadius: '10px', padding: '.75rem 1rem', background: session.current ? 'rgba(184, 135, 42, 0.06)' : 'transparent' }}>
                  <div>
                    <strong style={{ fontSize: '0.9rem', color: 'var(--text-main)' }}>{session.current ? 'This device (Current Session)' : 'Other session'}</strong>
                    <div style={{ fontSize: '.78rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>{session.user_agent || 'Unknown browser'} · Last active {new Date(session.last_used_at).toLocaleString()}</div>
                  </div>
                  {!session.current && (
                    <button className="btn btn-secondary" type="button" disabled={busy} onClick={() => void revokeSession(session)} style={{ fontSize: '0.8rem', padding: '0.3rem 0.65rem' }}>Revoke</button>
                  )}
                </div>)}
              </div>}
            </div>
          </section>
        </div>,
        document.body
      )}
    </>
  );
}
