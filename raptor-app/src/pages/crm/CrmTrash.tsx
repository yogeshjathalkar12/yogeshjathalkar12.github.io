import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { isNotInstalled } from '../../lib/dbMissing';
import { useMemberLabels } from '../../hooks/useDirectory';
import { useOrg } from '../../hooks/OrgContext';
import { shortName } from '../../lib/team';
import { toolBtnStyle } from '../../components/crm/Modal';
import { TABLE_PAGE } from '../../lib/paging';

// CRM > Recycle bin (db/migrations/2026-11-28_e_trash.sql): deleted contacts, companies and deals, for 30 days.

interface Item { kind: 'contacts' | 'companies' | 'deals'; id: string; label: string; detail: string; deleted_at: string; deleted_by: string | null }

const KIND = { contacts: 'Contact', companies: 'Company', deals: 'Deal' } as const;
const small: React.CSSProperties = { fontSize: '0.65rem', color: 'var(--dim)', lineHeight: 1.6 };

export const daysLeft = (deletedAt: string, now = Date.now()) => Math.max(0, Math.ceil(30 - (now - Date.parse(deletedAt)) / 86_400_000));

export default function CrmTrash() {
  const { can } = useOrg();
  const [items, setItems] = useState<Item[] | null>(null);
  const [state, setState] = useState<'ok' | 'missing'>('ok');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [limit, setLimit] = useState(TABLE_PAGE);
  const labels = useMemberLabels((items || []).map((i) => i.deleted_by));

  async function load() {
    const { data, error: failed } = await supabase.rpc('crm_trash_list');
    if (failed) {
      if (isNotInstalled(failed)) setState('missing'); else setError(failed.message);
      setItems([]);
      return;
    }
    setItems((data || []) as Item[]);
  }
  useEffect(() => { load(); }, []);

  async function act(item: Item, forever: boolean) {
    if (forever && !window.confirm(`Delete "${item.label}" for good? This cannot be undone.`)) return;
    setBusy(item.id);
    setError('');
    const { data, error: failed } = await supabase.rpc(forever ? 'crm_trash_delete_forever' : 'crm_restore', { p_table: item.kind, p_ids: [item.id] });
    setBusy('');
    if (failed) setError(failed.message);
    else if (!Number(data)) setError(`"${item.label}" could not be ${forever ? 'deleted' : 'brought back'}.`);
    else setMessage(forever ? `"${item.label}" was deleted for good.` : `"${item.label}" is back.`);
    load();
  }

  if (!can('delete')) return <div style={small}>The recycle bin is for people who may delete records.</div>;
  if (state === 'missing') return <div style={small}>The recycle bin needs a database update first: run <b>2026-11-28_e_trash.sql</b> in Supabase.</div>;
  if (!items) return <div style={small}>Loading the recycle bin…</div>;

  return (
    <div style={{ overflowY: 'auto' }}>
      <div style={{ ...small, marginBottom: '1rem' }}>Deleted contacts, companies and deals stay here for 30 days. Bringing one back restores it with its notes, tasks and files.</div>
      {message && <div role="status" style={{ ...small, color: 'var(--green)', marginBottom: 8 }}>{message}</div>}
      {error && <div style={{ ...small, color: 'var(--red)', marginBottom: 8 }}>{error}</div>}
      {items.length === 0 ? <div style={small}>The bin is empty.</div> : items.slice(0, limit).map((i) => (
        <div key={i.id} style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', borderTop: '1px solid var(--border)', padding: '0.7rem 0', fontSize: '0.7rem' }}>
          <span style={{ width: 70, color: 'var(--dim)' }}>{KIND[i.kind]}</span>
          <div style={{ flex: '1 1 220px', minWidth: 0 }}>
            <div style={{ color: 'var(--white)', overflowWrap: 'anywhere' }}>{i.label}</div>
            <div style={{ ...small, fontSize: '0.58rem' }}>
              {i.detail ? `${i.detail} · ` : ''}deleted {new Date(i.deleted_at).toLocaleDateString()}{i.deleted_by ? ` by ${shortName(labels[i.deleted_by])}` : ''} · {daysLeft(i.deleted_at)} day{daysLeft(i.deleted_at) === 1 ? '' : 's'} left
            </div>
          </div>
          <button style={toolBtnStyle} disabled={busy === i.id} onClick={() => act(i, false)}>Bring back</button>
          <button style={{ ...toolBtnStyle, color: 'var(--red)' }} disabled={busy === i.id} onClick={() => act(i, true)}>Delete for good</button>
        </div>
      ))}
      {items.length > limit && (
        <button style={{ ...toolBtnStyle, marginTop: 10 }} onClick={() => setLimit(limit + TABLE_PAGE)}>Show more ({items.length - limit} more)</button>
      )}
    </div>
  );
}
