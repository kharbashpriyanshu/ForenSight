import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { API_BASE, invalidateApiCache, readAuthToken, readCsrfCookie, refreshApiSession, setAuthToken, setCsrfToken } from '../api';

export interface AuthUser {
  username: string;
  role: string;
  mfa_enabled?: boolean;
}

interface AuthContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: AuthUser | null;
  login: (userData?: AuthUser) => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setAuthenticated] = useState(false);
  const [isLoading, setLoading] = useState(true);
  const [user, setUser] = useState<AuthUser | null>(() => {
    try {
      const stored = localStorage.getItem('forensight_user');
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });
  const authRevision = useRef(0);

  useEffect(() => {
    let active = true;
    const revision = authRevision.current;
    const checkSession = async () => {
      try {
        const token = readAuthToken();
        const headers: Record<string, string> = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;
        let response = await fetch(`${API_BASE}/auth/session`, { credentials: 'include', headers });
        if (response.status === 401 && await refreshApiSession()) {
          const refreshedToken = readAuthToken();
          const retryHeaders: Record<string, string> = {};
          if (refreshedToken) retryHeaders['Authorization'] = `Bearer ${refreshedToken}`;
          response = await fetch(`${API_BASE}/auth/session`, { credentials: 'include', headers: retryHeaders });
        }
        const sessionData = response.ok ? await response.json() : null;
        if (sessionData?.csrf_token) {
          setCsrfToken(sessionData.csrf_token);
        }
        if (active && revision === authRevision.current) {
          const isAuth = sessionData?.authenticated === true;
          setAuthenticated(isAuth);
          if (isAuth && sessionData?.username) {
            const userObj: AuthUser = {
              username: sessionData.username,
              role: sessionData.role || 'INVESTIGATOR',
              mfa_enabled: Boolean(sessionData.mfa_enabled),
            };
            setUser(userObj);
            try { localStorage.setItem('forensight_user', JSON.stringify(userObj)); } catch {}
          } else {
            setUser(null);
            try { localStorage.removeItem('forensight_user'); } catch {}
          }
        }
      } catch {
        if (active && revision === authRevision.current) {
          setAuthenticated(false);
          setUser(null);
        }
      } finally {
        if (active && revision === authRevision.current) setLoading(false);
      }
    };
    void checkSession();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;
    const channel = new BroadcastChannel('forensight-auth');
    channel.onmessage = (event: MessageEvent<{ authenticated?: boolean; user?: AuthUser }>) => {
      if (typeof event.data?.authenticated === 'boolean') {
        authRevision.current += 1;
        invalidateApiCache();
        setAuthenticated(event.data.authenticated);
        if (event.data.user) {
          setUser(event.data.user);
          try { localStorage.setItem('forensight_user', JSON.stringify(event.data.user)); } catch {}
        } else if (!event.data.authenticated) {
          setUser(null);
          try { localStorage.removeItem('forensight_user'); } catch {}
        }
      }
    };
    return () => channel.close();
  }, []);

  const login = (userData?: AuthUser) => {
    authRevision.current += 1;
    invalidateApiCache();
    setAuthenticated(true);
    if (userData) {
      setUser(userData);
      try { localStorage.setItem('forensight_user', JSON.stringify(userData)); } catch {}
    }
    setLoading(false);
    if (typeof BroadcastChannel !== 'undefined') {
      const channel = new BroadcastChannel('forensight-auth');
      channel.postMessage({ authenticated: true, user: userData });
      channel.close();
    }
  };

  const logout = async () => {
    authRevision.current += 1;
    try {
      await fetch(`${API_BASE}/auth/logout`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'X-CSRF-Token': readCsrfCookie() },
      });
    } catch {
      // A failed network logout still clears the local UI session.
    } finally {
      setAuthToken(null);
      setCsrfToken(null);
      setUser(null);
      try { localStorage.removeItem('forensight_user'); } catch {}
      invalidateApiCache();
      setAuthenticated(false);
      if (typeof BroadcastChannel !== 'undefined') {
        const channel = new BroadcastChannel('forensight-auth');
        channel.postMessage({ authenticated: false });
        channel.close();
      }
    }
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated, isLoading, user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
