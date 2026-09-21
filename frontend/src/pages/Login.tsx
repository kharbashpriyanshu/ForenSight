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
    <div style={{ 
      display: 'flex', 
      minHeight: '100vh', 
      alignItems: 'center', 
      justifyContent: 'center', 
      background: 'radial-gradient(circle at 20% 20%, rgba(219, 234, 254, 0.6) 0%, transparent 45%), radial-gradient(circle at 80% 80%, rgba(224, 231, 255, 0.5) 0%, transparent 50%), #f8fafc', 
      padding: '1.5rem',
      position: 'relative',
      overflow: 'hidden'
    }}>
      {/* Decorative ambient glowing orbs */}
      <div style={{
        position: 'absolute',
        width: '380px',
        height: '380px',
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(59, 130, 246, 0.12) 0%, transparent 70%)',
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
        background: 'radial-gradient(circle, rgba(99, 102, 241, 0.1) 0%, transparent 70%)',
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
        boxShadow: '0 20px 50px -10px rgba(15, 23, 42, 0.08), inset 0 1px 0 0 rgba(255, 255, 255, 0.95)', 
        background: 'rgba(255, 255, 255, 0.78)', 
        backdropFilter: 'blur(20px) saturate(180%)',
        WebkitBackdropFilter: 'blur(20px) saturate(180%)',
        border: '1px solid rgba(255, 255, 255, 0.9)',
        zIndex: 1,
        animation: 'pageFadeIn 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards'
      }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div style={{ 
            display: 'inline-flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            width: '48px', 
            height: '48px', 
            borderRadius: '12px', 
            background: 'linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%)', 
            color: '#ffffff', 
            fontWeight: 800, 
            fontSize: '1.2rem', 
            marginBottom: '1rem',
            boxShadow: '0 8px 20px -4px rgba(30, 58, 138, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.3)'
          }}>
            FS
          </div>
          <h1 style={{ color: 'var(--text-main)', fontSize: '1.85rem', fontWeight: 800, letterSpacing: '-0.025em', marginBottom: '0.35rem' }}>ForenSight</h1>
          <p style={{ color: '#2563eb', fontSize: '0.8rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            Digital Evidence OS
          </p>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '0.65rem', lineHeight: 1.45 }}>
            Preserve evidence • Measure forensic signals • Cryptographic chain of custody
          </p>
        </div>
        
        {error && (
          <div style={{ 
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

        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div>
            <label htmlFor="username" style={{ display: 'block', marginBottom: '0.45rem', color: 'var(--text-body)', fontSize: '0.825rem', fontWeight: 600 }}>
              Investigator Username
            </label>
            <input 
              id="username"
              name="username"
              type="text" 
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              style={{ 
                width: '100%', 
                padding: '0.7rem 0.85rem', 
                borderRadius: '8px', 
                border: '1px solid var(--border-color)', 
                background: 'rgba(255, 255, 255, 0.85)', 
                color: 'var(--text-main)', 
                boxSizing: 'border-box' 
              }}
            />
          </div>
          <div>
            <label htmlFor="password" style={{ display: 'block', marginBottom: '0.45rem', color: 'var(--text-body)', fontSize: '0.825rem', fontWeight: 600 }}>
              Access Password
            </label>
            <input 
              id="password"
              name="password"
              type="password" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{ 
                width: '100%', 
                padding: '0.7rem 0.85rem', 
                borderRadius: '8px', 
                border: '1px solid var(--border-color)', 
                background: 'rgba(255, 255, 255, 0.85)', 
                color: 'var(--text-main)', 
                boxSizing: 'border-box' 
              }}
            />
          </div>
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
            {loading ? 'Authenticating Investigator...' : 'Sign In to Station'}
          </button>
        </form>
        
        <div style={{ marginTop: '2rem', textAlign: 'center', fontSize: '0.75rem', color: 'var(--text-muted)', borderTop: '1px solid var(--border-color-translucent)', paddingTop: '1.25rem' }}>
          Station Roles: <code>admin</code> (Lead) • <code>user_a</code> (Analyst) • <code>user_b</code> (Technician)
        </div>
      </div>
    </div>
  );
}
