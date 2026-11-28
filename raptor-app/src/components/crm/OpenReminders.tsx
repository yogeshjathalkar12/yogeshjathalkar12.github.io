// Reminders that are still open (older automation rules, and the PC app's own runner, leave these). Shown only when there are some.
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { relativeTime } from '../../lib/crmHelpers';

export default function OpenReminders() {
  const [rows, setRows] = useState<any[]>([]);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const { data, error: failed } = await supabase
      .from('reminders').select('id, message, created_at, contacts(name), deals(title)')
      .eq('is_done', false).order('created_at', { ascending: false }).limit(20);
    if (!failed) setRows(data || []);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function done(id: string) {
    setError('');
    const { error: failed } = await supabase.from('reminders').update({ is_done: true }).eq('id', id);
    if (failed) setError(failed.message || 'Could not mark it done.');
    else load();
  }

  if (!rows.length) return null;
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', padding: '1.6rem', borderRadius: 6, marginBottom: '1.4rem' }}>
      <div style={{ fontSize: '0.58rem', letterSpacing: '0.18em', color: 'var(--dim)', textTransform: 'uppercase', marginBottom: '0.6rem' }}>Open reminders ({rows.length})</div>
      {error && <div role="alert" style={{ fontSize: '0.65rem', color: 'var(--red)' }}>{error}</div>}
      {rows.map((r) => (
        <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', gap: '0.8rem', padding: '0.6rem 0', borderBottom: '1px solid var(--border)' }}>
          <div>
            <div style={{ fontSize: '0.7rem' }}>{r.message}</div>
            <div style={{ fontSize: '0.55rem', color: 'var(--dim2)' }}>{r.contacts?.name || r.deals?.title || ''} · {relativeTime(r.created_at)}</div>
          </div>
          <button type="button" onClick={() => done(r.id)} style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--dim)', padding: '0.35rem 0.7rem', borderRadius: 4, cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: '0.6rem', textTransform: 'uppercase' }}>Done</button>
        </div>
      ))}
    </div>
  );
}
