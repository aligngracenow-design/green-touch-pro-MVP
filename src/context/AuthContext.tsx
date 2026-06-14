import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { User } from '../lib/types';
import { api, detectBackend, getToken, clearToken } from '../lib/api';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  backendReady: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [backendReady, setBackendReady] = useState(false);

  useEffect(() => {
    (async () => {
      const ready = await detectBackend();
      setBackendReady(ready);
      if (getToken()) {
        try {
          const { user } = await api.me();
          setUser(user);
        } catch {
          clearToken();
        }
      }
      setLoading(false);
    })();
  }, []);

  async function login(email: string, password: string) {
    const { user } = await api.login(email, password);
    setUser(user);
  }

  function logout() {
    clearToken();
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, backendReady, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
