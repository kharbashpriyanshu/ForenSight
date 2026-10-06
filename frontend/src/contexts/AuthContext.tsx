import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { invalidateApiCache, refreshApiSession } from '../api';

interface AuthContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
  login: () => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);
const API_BASE = (import.meta.env.VITE_API_URL || '') + '/api';

function readCsrfCookie(): string {
  const match = document.cookie.match(/(?:^|;\s*)fs_csrf=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : '';
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setAuthenticated] = useState(false);
  const [isLoading, setLoading] = useState(true);
  const authRevision = useRef(0);

  useEffect(() => {
    let active = true;
    const revision = authRevision.current;
    const checkSession = async () => {
      try {
        let response = await fetch(`${API_BASE}/auth/session`, { credentials: 'include' });
        if (response.status === 401 && await refreshApiSession()) {
          response = await fetch(`${API_BASE}/auth/session`, { credentials: 'include' });
        }
        const sessionData = response.ok ? await response.json() : null;
        if (active && revision === authRevision.current) setAuthenticated(sessionData?.authenticated === true);
      } catch {
        if (active && revision === authRevision.current) setAuthenticated(false);
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
    channel.onmessage = (event: MessageEvent<{ authenticated?: boolean }>) => {
      if (typeof event.data?.authenticated === 'boolean') {
        authRevision.current += 1;
        invalidateApiCache();
        setAuthenticated(event.data.authenticated);
      }
    };
    return () => channel.close();
  }, []);

  const login = () => {
    authRevision.current += 1;
    invalidateApiCache();
    setAuthenticated(true);
    setLoading(false);
    if (typeof BroadcastChannel !== 'undefined') {
      const channel = new BroadcastChannel('forensight-auth');
      channel.postMessage({ authenticated: true });
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
    <AuthContext.Provider value={{ isAuthenticated, isLoading, login, logout }}>
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
