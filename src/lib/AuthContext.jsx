import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { fetchAdminMe } from '../utils/adminApi';
import { supabase } from './supabase';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [adminUser, setAdminUser] = useState(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [authError, setAuthError] = useState('');

  async function verifyAdminAccess(nextSession) {
    if (!nextSession?.access_token) {
      setAdminUser(null);
      return null;
    }

    const profile = await fetchAdminMe(nextSession.access_token);
    setAdminUser(profile);
    setAuthError('');
    return profile;
  }

  useEffect(() => {
    let isDisposed = false;

    async function bootstrap() {
      const {
        data: { session: initialSession },
      } = await supabase.auth.getSession();

      if (isDisposed) {
        return;
      }

      setSession(initialSession);

      if (initialSession) {
        try {
          await verifyAdminAccess(initialSession);
        } catch (error) {
          setAuthError(error.message || 'This account is not authorised for COSA Admin.');
          setAdminUser(null);
          await supabase.auth.signOut();
          setSession(null);
        }
      }

      setIsAuthLoading(false);
    }

    void bootstrap();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (isDisposed) {
        return;
      }

      setSession(nextSession);

      if (!nextSession) {
        setAdminUser(null);
        setAuthError('');
        return;
      }

      void verifyAdminAccess(nextSession).catch(async (error) => {
        setAuthError(error.message || 'This account is not authorised for COSA Admin.');
        setAdminUser(null);
        await supabase.auth.signOut();
        setSession(null);
      });
    });

    return () => {
      isDisposed = true;
      subscription.unsubscribe();
    };
  }, []);

  async function login(email, password) {
    setAuthError('');
    setIsAuthLoading(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        throw error;
      }

      await verifyAdminAccess(data.session);
      setSession(data.session);
      return data;
    } finally {
      setIsAuthLoading(false);
    }
  }

  async function logout() {
    await supabase.auth.signOut();
    setSession(null);
    setAdminUser(null);
    setAuthError('');
  }

  const value = useMemo(
    () => ({
      session,
      adminUser,
      isAuthLoading,
      authError,
      isLoggedIn: Boolean(session && adminUser),
      login,
      logout,
    }),
    [session, adminUser, isAuthLoading, authError],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider');
  }

  return context;
}
