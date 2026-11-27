import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../hooks/AuthContext';
import { isNotInstalled } from '../../lib/dbMissing';

// "Email me a daily summary" of your own overdue and due-today tasks. Shows nothing until 2026-11-29_b_task_digest.sql has been run.

export default function TaskDigestToggle() {
  const { user } = useAuth();
  const [on, setOn] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user?.id) return;
    Promise.resolve(supabase.from('user_email_prefs').select('task_digest').eq('user_id', user.id).limit(1)).then(({ data, error: failed }) => {
      if (failed) { if (!isNotInstalled(failed)) setError(failed.message); return; }
      setOn(!!(data as any)?.[0]?.task_digest);
    });
  }, [user?.id]);

  async function change(next: boolean) {
    setBusy(true);
    setError('');
    const { error: failed } = await supabase.rpc('set_task_digest', { p_on: next, p_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' });
    setBusy(false);
    if (failed) { setError(failed.message); return; }
    setOn(next);
  }

  if (on === null) return error ? <span style={{ fontSize: '0.6rem', color: 'var(--red)' }}>{error}</span> : null;
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.65rem', color: 'var(--dim)', cursor: 'pointer' }}
      title={`Each morning, a list of your tasks that are overdue or due that day is emailed to ${user?.email || 'you'}. Nothing is sent on a day with nothing due.`}>
      <input type="checkbox" checked={on} disabled={busy} onChange={(e) => change(e.target.checked)} />
      Email me a daily summary
      {error && <span style={{ color: 'var(--red)' }}>{error}</span>}
    </label>
  );
}
