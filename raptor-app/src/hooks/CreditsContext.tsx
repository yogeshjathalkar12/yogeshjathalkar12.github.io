import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from './AuthContext';

interface CreditsContextValue {
  credits: number | null;
  totalCredits: number;
  plan: string;
  /** Call with the `credits_left` value returned by a paid backend action —
   *  the backend is the only writer of credits, this just reflects it. */
  syncFromServer: (creditsLeft: number) => void;
  refresh: () => Promise<void>;
}

const CreditsContext = createContext<CreditsContextValue | undefined>(undefined);

const POLL_INTERVAL_MS = 30000;

export function CreditsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [credits, setCredits] = useState<number | null>(null);
  const [totalCredits, setTotalCredits] = useState(50);
  const [plan, setPlan] = useState('Free');

  const refresh = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from('raptor_users')
      .select('credits, total_credits, plan')
      .eq('user_id', user.id)
      .single();

    if (!error && data) {
      setCredits(data.credits ?? 50);
      setTotalCredits(data.total_credits ?? 50);
      setPlan(data.plan ?? 'Free');
    } else {
      // First-time user — mirrors the upsert dashboard.html did on first
      // login (covers first-time Google OAuth signups too, since those
      // never touch a signup form).
      setCredits(50);
      setTotalCredits(50);
      await supabase
        .from('raptor_users')
        .upsert({ user_id: user.id, email: user.email, credits: 50, total_credits: 50, plan: 'Free' });
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;
    refresh();
    const interval = setInterval(refresh, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [user, refresh]);

  const syncFromServer = useCallback((creditsLeft: number) => {
    if (typeof creditsLeft === 'number') setCredits(creditsLeft);
  }, []);

  return (
    <CreditsContext.Provider value={{ credits, totalCredits, plan, syncFromServer, refresh }}>
      {children}
    </CreditsContext.Provider>
  );
}

export function useCredits(): CreditsContextValue {
  const ctx = useContext(CreditsContext);
  if (!ctx) throw new Error('useCredits must be used within CreditsProvider');
  return ctx;
}
