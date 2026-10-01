import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabaseClient';

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Same reasoning as the old dashboard.html: a user arriving via
    // "Continue with Google" lands here with tokens still in the URL
    // fragment, which Supabase parses ASYNCHRONOUSLY. A bare getSession()
    // call on mount can race that parsing and bounce a freshly-logged-in
    // user back to login.
    //
    // THE FIX (2026-10-01): this used to trust the FIRST onAuthStateChange
    // event unconditionally, setting loading=false right away. That first
    // event is usually INITIAL_SESSION, which fires with session=null
    // BEFORE the SDK has finished parsing #access_token=... out of the
    // URL — RequireAuth.tsx then saw loading=false + no user and bounced
    // straight back to LOGIN_URL, which is exactly the "select a Google
    // account, then back to login" bug. A null/undefined session on its
    // own is no longer treated as definitive; only a truthy session, or
    // an explicit SIGNED_OUT, stops loading immediately. Anything else
    // keeps waiting (up to 3s) for a real event, with one direct
    // getSession() call as a last-resort fallback.
    let settled = false;
    const timer = setTimeout(async () => {
      if (settled) return;
      const { data: { session: current } } = await supabase.auth.getSession();
      settled = true;
      setSession(current);
      setLoading(false);
    }, 3000);

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (settled) return;
      if (newSession || event === 'SIGNED_OUT') {
        settled = true;
        clearTimeout(timer);
        setSession(newSession);
        setLoading(false);
      }
    });

    return () => { clearTimeout(timer); subscription.unsubscribe(); };
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    window.location.href = 'https://shoonyaorigins.com/ventures/raptor/';
  };

  return (
    <AuthContext.Provider value={{ session, user: session?.user ?? null, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
