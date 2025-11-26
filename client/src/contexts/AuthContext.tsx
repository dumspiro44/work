import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { api } from '@/lib/api';

interface AuthContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (token: string) => Promise<void>;
  logout: () => Promise<void>;
  revalidate: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const validateAuth = async () => {
    const isValid = await api.validateToken();
    setIsAuthenticated(isValid);
    return isValid;
  };

  const login = async (token: string) => {
    api.setToken(token);
    await validateAuth();
    setIsLoading(false);
  };

  const logout = async () => {
    await api.logout();
    // Очистить данные подключения WordPress только при logout (из localStorage)
    localStorage.removeItem('wpPassword');
    localStorage.removeItem('geminiApiKey');
    localStorage.removeItem('wpUrl');
    localStorage.removeItem('wpUsername');
    setIsAuthenticated(false);
  };

  const revalidate = async () => {
    await validateAuth();
  };

  useEffect(() => {
    const initAuth = async () => {
      await validateAuth();
      setIsLoading(false);
    };
    initAuth();
  }, []);

  return (
    <AuthContext.Provider value={{ isAuthenticated, isLoading, login, logout, revalidate }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
