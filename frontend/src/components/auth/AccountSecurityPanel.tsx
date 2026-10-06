import { useEffect, useState } from 'react';
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
      {open && <div role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && recoveryCodes.length === 0) setOpen(false); }} style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(20, 26, 33, .48)', display: 'grid', placeItems: 'center', padding: '1rem' }}>
        <section role="dialog" aria-modal="true" aria-labelledby="security-title" className="card" style={{ width: 'min(700px, 100%)', maxHeight: '90vh', overflowY: 'auto', padding: '1.5rem' }}>
          <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
            <h2 id="security-title" style={{ margin: 0, display: 'flex', gap: '.5rem', alignItems: 'center' }}><KeyRound size={19} /> Account security</h2>
            <button className="btn btn-secondary" type="button" disabled={recoveryCodes.length > 0} onClick={() => setOpen(false)} aria-label="Close security panel"><X size={16} /></button>
          </header>
          {error && <p role="alert" style={{ color: '#b91c1c' }}>{error}</p>}
          {message && <p role="status">{message}</p>}

          <h3>Multi-factor authentication</h3>
          <p>{mfaEnabled ? 'Authenticator MFA is enabled for this account.' : 'Authenticator MFA is not enabled.'}</p>
          {!mfaEnabled ? <>
            {!secret && <>
              <label style={{ display: 'block', marginBottom: '.5rem' }}>Confirm your password
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

          <h3 style={{ marginTop: '1.5rem' }}>Active sessions</h3>
          {sessions.length === 0 ? <p>No active sessions.</p> : <div style={{ display: 'grid', gap: '.5rem' }}>
            {sessions.map((session) => <div key={session.session_identifier} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '.7rem' }}>
              <div><strong>{session.current ? 'This device' : 'Other session'}</strong><div style={{ fontSize: '.8rem', color: 'var(--text-muted)' }}>{session.user_agent || 'Unknown browser'} · Last active {new Date(session.last_used_at).toLocaleString()}</div></div>
              <button className="btn btn-secondary" type="button" disabled={busy} onClick={() => void revokeSession(session)}>Revoke</button>
            </div>)}
          </div>}
        </section>
      </div>}
    </>
  );
}
