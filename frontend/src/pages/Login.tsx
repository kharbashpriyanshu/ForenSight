import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import ThemeToggle from '../components/layout/ThemeToggle';
import BrandHeader from '../components/layout/BrandHeader';
import { API_BASE } from '../api';


export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [mfaChallenge, setMfaChallenge] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  
  const { login } = useAuth();
  const { isDark } = useTheme();
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const formData = new URLSearchParams();
      formData.append('username', username);
      formData.append('password', password);

      if (mfaChallenge) {
        const response = await fetch(`${API_BASE}/auth/mfa/verify`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ challenge_token: mfaChallenge, code: mfaCode }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.detail || `Authenticator code not accepted (${response.status})`);
        login();
        navigate('/cases');
      } else {
        const response = await fetch(`${API_BASE}/auth/login`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: formData,
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.detail || `Login failed (${response.status}: ${response.statusText || 'Endpoint unreachable'})`);
        if (data.requires_mfa) {
          setMfaChallenge(data.challenge_token);
          setPassword('');
          return;
        }
        login();
        navigate('/cases');
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred during login');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ 
      display: 'flex', 
      minHeight: '100vh', 
      alignItems: 'center', 
      justifyContent: 'center', 
      background: 'radial-gradient(circle at 20% 20%, rgba(212, 160, 67, 0.12) 0%, transparent 45%), radial-gradient(circle at 80% 80%, rgba(184, 135, 42, 0.08) 0%, transparent 50%), var(--surface-canvas)', 
      padding: '1.5rem',
      position: 'relative',
      overflow: 'hidden'
    }}>
      {/* Public Authentication Header with Theme Toggle */}
      <header
        className="auth-header"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '1rem 1.75rem',
          zIndex: 10,
        }}
      >
        <BrandHeader responsiveSubtitle={false} />

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <ThemeToggle />
        </div>
      </header>

      {/* Decorative ambient glowing orbs */}
      <div style={{
        position: 'absolute',
        width: '380px',
        height: '380px',
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(212, 160, 67, 0.12) 0%, transparent 70%)',
        top: '12%',
        left: '18%',
        filter: 'blur(40px)',
        pointerEvents: 'none'
      }} />
      <div style={{
        position: 'absolute',
        width: '420px',
        height: '420px',
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(184, 135, 42, 0.09) 0%, transparent 70%)',
        bottom: '10%',
        right: '15%',
        filter: 'blur(50px)',
        pointerEvents: 'none'
      }} />

      <div className="card" style={{ 
        width: '100%', 
        maxWidth: '430px', 
        padding: '2.75rem 2.25rem', 
        borderRadius: '16px', 
        boxShadow: 'var(--shadow-xl)', 
        background: 'var(--surface-color)', 
        backdropFilter: 'blur(20px) saturate(160%)',
        WebkitBackdropFilter: 'blur(20px) saturate(160%)',
        border: '1px solid var(--border-default)',
        zIndex: 1,
        animation: 'pageFadeIn 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards'
      }}>
        <div style={{ textAlign: 'center', marginBottom: '1.75rem' }}>
          <img 
            src={isDark ? "/forensight-logo-dark.svg" : "/forensight-logo.svg"} 
            alt="ForenSight - Digital Image Forensics Platform" 
            style={{ 
              width: '100%', 
              maxWidth: '280px', 
              height: 'auto',
              marginBottom: '0.5rem',
              filter: isDark 
                ? 'drop-shadow(0 4px 16px rgba(0, 0, 0, 0.4))' 
                : 'drop-shadow(0 4px 12px rgba(28, 43, 58, 0.12))'
            }} 
          />
          <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem', marginTop: '0.25rem', lineHeight: 1.45 }}>
            Preserve evidence • Measure forensic signals • Cryptographic chain of custody
          </p>
        </div>
        
        {error && (
          <div 
            role="alert"
            aria-live="assertive"
            style={{ 
            background: 'rgba(254, 242, 242, 0.85)', 
            backdropFilter: 'blur(8px)',
            color: '#b91c1c', 
            border: '1px solid rgba(254, 202, 202, 0.9)', 
            padding: '0.75rem 1rem', 
            borderRadius: '8px', 
            marginBottom: '1.25rem', 
            fontSize: '0.85rem', 
            fontWeight: 500,
            boxShadow: '0 2px 8px rgba(185, 28, 28, 0.06)'
          }}>
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} aria-label="Sign in to station" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div>
            {mfaChallenge ? (
              <>
                <label htmlFor="mfa-code" style={{ display: 'block', marginBottom: '0.45rem', color: 'var(--text-body)', fontSize: '0.825rem', fontWeight: 600 }}>
                  Authenticator or recovery code
                </label>
                <input
                  id="mfa-code"
                  name="mfa-code"
                  type="text"
                  inputMode="text"
                  autoComplete="one-time-code"
                  aria-required="true"
                  aria-label="Authenticator or recovery code"
                  value={mfaCode}
                  onChange={(e) => setMfaCode(e.target.value)}
                  autoFocus
                  style={{ width: '100%', padding: '0.7rem 0.85rem', borderRadius: '8px', border: '1px solid var(--border-default)', background: 'var(--surface-sunken)', color: 'var(--text-main)', boxSizing: 'border-box' }}
                />
                <button type="button" className="btn btn-secondary" onClick={() => { setMfaChallenge(''); setMfaCode(''); }} style={{ marginTop: '0.5rem' }}>
                  Back to password
                </button>
              </>
            ) : (
              <>
                <label htmlFor="username" style={{ display: 'block', marginBottom: '0.45rem', color: 'var(--text-body)', fontSize: '0.825rem', fontWeight: 600 }}>
                  Investigator Username
                </label>
                <input
                  id="username" name="username" type="text" value={username}
                  aria-required="true"
                  aria-label="Investigator Username"
                  onChange={(e) => setUsername(e.target.value)} autoComplete="username"
                  style={{ width: '100%', padding: '0.7rem 0.85rem', borderRadius: '8px', border: '1px solid var(--border-default)', background: 'var(--surface-sunken)', color: 'var(--text-main)', boxSizing: 'border-box' }}
                />
              </>
            )}
          </div>
          {!mfaChallenge && <div>
            <label htmlFor="password" style={{ display: 'block', marginBottom: '0.45rem', color: 'var(--text-body)', fontSize: '0.825rem', fontWeight: 600 }}>
              Access Password
            </label>
            <input 
              id="password"
              name="password"
              type="password" 
              aria-required="true"
              aria-label="Access Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{ 
                width: '100%', 
                padding: '0.7rem 0.85rem', 
                borderRadius: '8px', 
                border: '1px solid var(--border-default)', 
                background: 'var(--surface-sunken)', 
                color: 'var(--text-main)', 
                boxSizing: 'border-box' 
              }}
            />
          </div>}
          <button 
            type="submit" 
            className="btn btn-primary" 
            style={{ 
              width: '100%', 
              marginTop: '0.5rem', 
              padding: '0.8rem', 
              borderRadius: '8px',
              fontSize: '0.925rem',
              fontWeight: 600
            }} 
            disabled={loading}
          >
            {loading ? 'Authenticating Investigator...' : mfaChallenge ? 'Verify and Sign In' : 'Sign In to Station'}
          </button>
        </form>
        
        <div style={{ marginTop: '1.75rem', textAlign: 'center', fontSize: '0.75rem', color: 'var(--text-muted)', borderTop: '1px solid var(--border-color-translucent)', paddingTop: '1.15rem', display: 'flex', flexDirection: 'column', gap: '0.55rem', alignItems: 'center' }}>
          <div>
            Instructor Demonstration Account (Synthetic Training Data): <code>demo_instructor</code>
          </div>
          <button
            type="button"
            className="btn btn-secondary"
            data-testid="fill-demo-credentials"
            onClick={() => {
              setUsername('demo_instructor');
              setPassword('forensight_demo_instructor');
            }}
            style={{ fontSize: '0.74rem', padding: '0.35rem 0.75rem' }}
          >
            Use Instructor Demo Credentials
          </button>
        </div>
      </div>
    </div>
  );
}
