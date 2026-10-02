import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from './AuthContext';
import { useOrg } from './OrgContext';

interface CreditsContextValue {
  credits: number | null;
  totalCredits: number;
  plan: string;
  /** False until the plan has been read once, so screens don't flash a
   *  "Free" state at someone who is actually on Pro. */
  planLoaded: boolean;
  /** Call with the `credits_left` value returned by a paid backend action —
   *  the backend is the only writer of credits, this just reflects it. */
  syncFromServer: (creditsLeft: number) => void;
  refresh: () => Promise<void>;
}

const CreditsContext = createContext<CreditsContextValue | undefined>(undefined);

const POLL_INTERVAL_MS = 30000;

export function CreditsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { loading: orgLoading, status, isOwner } = useOrg();
  const [credits, setCredits] = useState<number | null>(null);
  const [totalCredits, setTotalCredits] = useState(50);
  const [plan, setPlan] = useState('Free');
  const [planLoaded, setPlanLoaded] = useState(false);

  const refresh = useCallback(async () => {
    if (!user || orgLoading || status !== 'active') return;

    // A member never has (or creates) a plan row of their own: they run on
    // the organization's - the owner's row, read through org_plan().
    if (!isOwner) {
      const { data: orgRow } = await supabase.rpc('org_plan');
      if (orgRow) {
        setCredits(orgRow.credits ?? 0);
        setTotalCredits(orgRow.total_credits ?? 50);
        setPlan(orgRow.plan ?? 'Free');
      }
      setPlanLoaded(true);
      return;
    }

    const { data, error } = await supabase
      .from('raptor_users')
      .select('credits, total_credits, plan')
      .eq('user_id', user.id)
      .single();

    if (!error && data) {
      setCredits(data.credits ?? 50);
      setTotalCredits(data.total_credits ?? 50);
      setPlan(data.plan ?? 'Free');
      setPlanLoaded(true);
    } else {
      // First-time user — mirrors the upsert dashboard.html did on first
      // login (covers first-time Google OAuth signups too, since those
      // never touch a signup form).
      setCredits(50);
      setTotalCredits(50);
      await supabase
        .from('raptor_users')
        .upsert({ user_id: user.id, email: user.email, credits: 50, total_credits: 50, plan: 'Free' });
      setPlanLoaded(true);
    }
  }, [user, orgLoading, status, isOwner]);

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
    <CreditsContext.Provider value={{ credits, totalCredits, plan, planLoaded, syncFromServer, refresh }}>
      {children}
    </CreditsContext.Provider>
  );
}

export function useCredits(): CreditsContextValue {
  const ctx = useContext(CreditsContext);
  if (!ctx) throw new Error('useCredits must be used within CreditsProvider');
  return ctx;
}
