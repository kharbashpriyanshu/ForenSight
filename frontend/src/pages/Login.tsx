import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';


export default function Login() {
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('forensight_admin');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const formData = new URLSearchParams();
      formData.append('username', username);
      formData.append('password', password);

      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Invalid credentials');
      }

      const data = await response.json();
      login(data.access_token);
      navigate('/cases');
    } catch (err: any) {
      setError(err.message || 'An error occurred during login');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-color)', padding: '1rem' }}>
      <div className="card" style={{ width: '100%', maxWidth: '420px', padding: '2.5rem', borderRadius: '10px', boxShadow: 'var(--shadow-md)', background: '#ffffff', border: '1px solid var(--border-color)' }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '44px', height: '44px', borderRadius: '8px', background: '#1e3a8a', color: '#ffffff', fontWeight: 800, fontSize: '1.15rem', marginBottom: '0.85rem' }}>
            FS
          </div>
          <h1 style={{ color: 'var(--text-main)', fontSize: '1.75rem', fontWeight: 700, letterSpacing: '-0.02em', marginBottom: '0.25rem' }}>ForenSight</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', fontWeight: 500 }}>
            Digital Evidence Operating System
          </p>
          <p style={{ color: 'var(--text-subtle)', fontSize: '0.75rem', marginTop: '0.75rem', lineHeight: 1.4 }}>
            Preserve evidence. Measure forensic signals. Correlate observations. Maintain cryptographic chain of custody.
          </p>
        </div>
        
        {error && (
          <div style={{ background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca', padding: '0.75rem', borderRadius: '6px', marginBottom: '1rem', fontSize: '0.85rem', fontWeight: 500 }}>
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1.15rem' }}>
          <div>
            <label htmlFor="username" style={{ display: 'block', marginBottom: '0.4rem', color: 'var(--text-body)', fontSize: '0.85rem', fontWeight: 600 }}>Username</label>
            <input 
              id="username"
              name="username"
              type="text" 
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              style={{ width: '100%', padding: '0.65rem 0.75rem', borderRadius: '6px', border: '1px solid var(--border-color-focus)', background: '#ffffff', color: 'var(--text-main)', boxSizing: 'border-box' }}
            />
          </div>
          <div>
            <label htmlFor="password" style={{ display: 'block', marginBottom: '0.4rem', color: 'var(--text-body)', fontSize: '0.85rem', fontWeight: 600 }}>Password</label>
            <input 
              id="password"
              name="password"
              type="password" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{ width: '100%', padding: '0.65rem 0.75rem', borderRadius: '6px', border: '1px solid var(--border-color-focus)', background: '#ffffff', color: 'var(--text-main)', boxSizing: 'border-box' }}
            />
          </div>
          <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '0.5rem', padding: '0.75rem', borderRadius: '6px' }} disabled={loading}>
            {loading ? 'Authenticating...' : 'Sign In to Station'}
          </button>
        </form>
        
        <div style={{ marginTop: '2rem', textAlign: 'center', fontSize: '0.75rem', color: 'var(--text-muted)', borderTop: '1px solid var(--border-color)', paddingTop: '1.25rem' }}>
          Demo Accounts: <code>admin</code> / <code>user_a</code> / <code>user_b</code>
        </div>
      </div>
    </div>
  );
}
