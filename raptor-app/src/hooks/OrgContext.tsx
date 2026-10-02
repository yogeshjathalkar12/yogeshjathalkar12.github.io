import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from './AuthContext';
import type { MemberStatus, Permission } from '../lib/team';

// Who am I inside my organization? Resolved from the database
// (my_membership()), re-checked every minute and whenever the window regains
// focus, so a removed member is shown the "access removed" screen within
// moments. This is a UX layer only - row-level security in the database is
// what actually stops a removed member from reading anything, on the very
// next query, whatever this says.
//
// Fail-open on purpose for one case: if the organization functions don't
// exist yet (migration not run on this database) or a first check can't
// reach the server, behave as before - a one-person organization owning
// everything. RLS still decides what rows come back.

interface OrgContextValue {
  loading: boolean;
  orgId: string | null;
  status: MemberStatus;
  isOwner: boolean;
  /** A co-admin: runs the team day to day (not billing, transfer or the 2FA policy). */
  isAdmin: boolean;
  /** The owner switched on "everyone must use two-factor". */
  requireMfa: boolean;
  /** The preset the owner started from ("Rep", "Viewer", "Manager", "Custom") - display only. */
  preset: string | null;
  /** The member's individual toggles (owners implicitly have everything). */
  permissions: Partial<Record<Permission, boolean>>;
  /** True for the owner, admins, and members holding that permission. */
  can: (permission: Permission) => boolean;
  refresh: () => Promise<void>;
}

const OrgContext = createContext<OrgContextValue | undefined>(undefined);

const RECHECK_MS = 60000;

interface Membership {
  org_id: string;
  status: MemberStatus;
  is_owner: boolean;
  is_admin?: boolean;
  require_mfa?: boolean;
  preset: string | null;
  permissions: Partial<Record<Permission, boolean>>;
}

function isMissingFunction(err: { code?: string; message?: string } | null): boolean {
  return !!err && (err.code === 'PGRST202' || err.code === '42883' || /could not find the function/i.test(err.message || ''));
}

export function OrgProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [membership, setMembership] = useState<Membership | null>(null);
  const [solo, setSolo] = useState(false); // org functions unavailable -> behave as a one-person org
  const userId = user?.id ?? null;
  const hadMembership = useRef(false);

  const refresh = useCallback(async () => {
    if (!userId) {
      setMembership(null);
      setLoading(false);
      return;
    }
    const ensured = await supabase.rpc('ensure_my_org');
    if (isMissingFunction(ensured.error)) {
      setSolo(true);
      setLoading(false);
      return;
    }
    const { data, error } = await supabase.rpc('my_membership');
    if (error) {
      if (isMissingFunction(error)) {
        setSolo(true);
      } else if (hadMembership.current && (error.code === 'PGRST301' || /jwt|session|not authenticated|invalid claim/i.test(error.message || ''))) {
        // Their login was revoked server-side (offboarding purges sessions
        // and bans the account): show "access removed" instead of a broken app.
        setMembership((prev) => (prev ? { ...prev, status: 'removed' } : prev));
      } else if (!hadMembership.current) {
        setSolo(true); // first check failed: don't lock the owner out of their own app
      }
      setLoading(false);
      return;
    }
    setSolo(false);
    hadMembership.current = !!data;
    setMembership((data as Membership) || null);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    setLoading(true);
    refresh();
    const interval = setInterval(refresh, RECHECK_MS);
    const onFocus = () => { refresh(); };
    window.addEventListener('focus', onFocus);
    return () => { clearInterval(interval); window.removeEventListener('focus', onFocus); };
  }, [refresh]);

  const value = useMemo<OrgContextValue>(() => {
    const status: MemberStatus = solo || !membership ? 'active' : membership.status;
    const isOwner = solo || !membership ? true : membership.is_owner && membership.status === 'active';
    const isAdmin = !solo && !!membership && !!membership.is_admin && membership.status === 'active';
    const permissions = membership?.permissions || {};
    return {
      loading,
      orgId: solo || !membership ? userId : membership.org_id,
      status,
      isOwner,
      isAdmin,
      requireMfa: !solo && !!membership?.require_mfa,
      preset: solo || !membership ? null : membership.preset ?? null,
      permissions,
      can: (p: Permission) => isOwner || isAdmin || (status === 'active' && permissions[p] === true),
      refresh,
    };
  }, [loading, solo, membership, userId, refresh]);

  return <OrgContext.Provider value={value}>{children}</OrgContext.Provider>;
}

export function useOrg(): OrgContextValue {
  const ctx = useContext(OrgContext);
  if (!ctx) throw new Error('useOrg must be used within OrgProvider');
  return ctx;
}
