import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { isNotInstalled } from '../../lib/dbMissing';
import { useOrg } from '../../hooks/OrgContext';
import { useAuth } from '../../hooks/AuthContext';

const small: React.CSSProperties = { fontSize: '0.62rem', color: 'var(--dim)', lineHeight: 1.6 };

/** "Email me this every Monday", for people who may see the whole organization (db/migrations/2026-12-02_a_weekly_report.sql). */
export default function WeeklyEmailSwitch() {
  const { isOwner, isAdmin, can } = useOrg();
  const { user } = useAuth();
  const allowed = isOwner || isAdmin || can('view_all');
  const [on, setOn] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    if (!user) return;
    const { data, error: failed } = await supabase.from('user_email_prefs').select('weekly_report').eq('user_id', user.id).limit(1);
    // where the database part is missing the switch is not shown
    if (failed) { if (!isNotInstalled(failed)) setError(failed.message); return; }
    setOn(Boolean(data?.[0]?.weekly_report));
  }, [user]);
  useEffect(() => { if (allowed) load(); }, [allowed, load]);
  if (!allowed || on === null) return error ? <div role="alert" style={{ ...small, color: 'var(--red)' }}>{error}</div> : null;

  const change = async (next: boolean) => {
    setBusy(true);
    setError('');
    const { error: failed } = await supabase.rpc('set_weekly_report', { p_on: next, p_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone });
    if (failed) setError(failed.message); else setOn(next);
    setBusy(false);
  };
  return (
    <div className="no-print" style={{ marginBottom: 10 }}>
      <label style={{ ...small, color: 'var(--white)' }}>
        <input type="checkbox" checked={on} disabled={busy} onChange={(e) => change(e.target.checked)} /> Email me last week’s main figures every Monday
      </label>
      <div style={small}>Sent from Raptor’s address to your sign-in email, once the server’s schedule has been switched on. A week with nothing to report sends nothing.</div>
      {error && <div role="alert" style={{ ...small, color: 'var(--red)' }}>{error}</div>}
    </div>
  );
}
