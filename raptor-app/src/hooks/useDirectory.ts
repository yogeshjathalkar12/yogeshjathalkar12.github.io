import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from './AuthContext';
import { useOrg } from './OrgContext';
import { type DirectoryEntry, loadDirectory, loadMemberLabels } from '../lib/team';

/** The people the signed-in person can see and assign records to. */
export function useDirectory() {
  const { user } = useAuth();
  const { status, loading: orgLoading } = useOrg();
  const [entries, setEntries] = useState<DirectoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    try {
      setEntries(await loadDirectory());
    } catch (e) {
      console.error('Failed to load the team directory:', e);
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user || orgLoading || status !== 'active') return;
    reload();
  }, [user, orgLoading, status, reload]);

  return useMemo(() => ({
    entries,
    loading,
    reload,
    others: entries.filter((e) => !e.is_me),
    byId: Object.fromEntries(entries.map((e) => [e.user_id, e])) as Record<string, DirectoryEntry>,
  }), [entries, loading, reload]);
}

/** user id -> email for ids that may be outside the caller's own directory
 *  (e.g. the owner a record was assigned to, or whoever made a change). */
export function useMemberLabels(ids: Array<string | null | undefined>) {
  const key = Array.from(new Set(ids.filter(Boolean) as string[])).sort().join(',');
  const [labels, setLabels] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!key) { setLabels({}); return; }
    let cancelled = false;
    loadMemberLabels(key.split(',')).then((l) => { if (!cancelled) setLabels(l); });
    return () => { cancelled = true; };
  }, [key]);
  return labels;
}
