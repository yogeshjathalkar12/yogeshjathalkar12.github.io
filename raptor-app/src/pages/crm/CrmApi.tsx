import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useOrg } from '../../hooks/OrgContext';
import { isNotInstalled } from '../../lib/dbMissing';
import { RAPTOR_API_URL } from '../../lib/config';
import { type ApiKey, API_FIELDS, apiBase, apiExamples } from '../../lib/apiKeys';
import { fieldLabelStyle, fieldInputStyle, toolBtnStyle, toolPrimaryStyle } from '../../components/crm/Modal';

// CRM > API: keys that let other programs read and write the CRM (db/migrations/2026-11-28_n_api_keys.sql).

const card: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, padding: '1.1rem 1.3rem', marginBottom: '1rem' };
const small: React.CSSProperties = { fontSize: '0.65rem', color: 'var(--dim)', lineHeight: 1.7 };
const code: React.CSSProperties = { display: 'block', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 4, padding: '0.6rem 0.8rem', fontFamily: 'var(--mono)', fontSize: '0.62rem', color: 'var(--white)', overflowX: 'auto', whiteSpace: 'pre', marginTop: 4 };

export default function CrmApi() {
  const { isOwner, isAdmin, loading: orgLoading } = useOrg();
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'missing' | 'error' | 'denied'>('loading');
  const [name, setName] = useState('');
  const [canWrite, setCanWrite] = useState(false);
  const [made, setMade] = useState('');
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    if (!isOwner && !isAdmin) { setState('denied'); return; }
    const { data, error: problem } = await supabase.from('api_keys')
      .select('id, name, prefix, can_write, created_at, last_used_at, revoked_at').order('created_at', { ascending: false });
    if (problem) { setState(isNotInstalled(problem) ? 'missing' : 'error'); setError(problem.message); return; }
    setKeys((data || []) as ApiKey[]);
    setState('ready');
  }
  useEffect(() => { if (!orgLoading) load(); }, [orgLoading, isOwner, isAdmin]); // eslint-disable-line react-hooks/exhaustive-deps

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const { data, error: problem } = await supabase.rpc('api_key_create', { p_name: name, p_can_write: canWrite });
    setBusy(false);
    if (problem) { setError(problem.message); return; }
    setMade((data as { key: string }).key);
    setCopied(false);
    setName('');
    setCanWrite(false);
    load();
  }

  async function revoke(key: ApiKey) {
    if (!confirm(`Revoke "${key.name}"? Programs using it stop working at once.`)) return;
    setError('');
    const { error: problem } = await supabase.rpc('api_key_revoke', { p_id: key.id });
    if (problem) setError(problem.message);
    load();
  }

  async function copy() {
    try { await navigator.clipboard.writeText(made); setCopied(true); } catch { window.prompt('Copy this:', made); }
  }

  if (state === 'loading') return <div style={small}>Loading…</div>;
  if (state === 'denied') return <div style={card}><div style={small}>Only the organization owner or an admin can manage API keys.</div></div>;
  if (state === 'missing') return <div style={card}><div style={small}>The API needs a database update first: run <b>2026-11-28_n_api_keys.sql</b> in Supabase.</div></div>;
  if (state === 'error') return <div style={card}><div style={{ ...small, color: 'var(--red)' }}>Could not load the keys: {error}</div></div>;

  const date = (value: string) => new Date(value).toLocaleDateString();

  return (
    <div style={{ overflowY: 'auto' }}>
      <div style={card}>
        <div style={{ ...small, marginBottom: 12 }}>
          A key lets another program (your website, Zapier, a script) read your contacts, companies, deals, tasks and notes, and with
          writing allowed, add and change them. It cannot delete. Records written this way never email, WhatsApp or text anyone by
          themselves, even in Automatic mode; your automation rules do apply to them.
        </div>
        <form onSubmit={create} style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <input style={{ ...fieldInputStyle, marginBottom: 0, flex: '1 1 200px', width: 'auto' }} aria-label="Key name" placeholder="What will use it? e.g. Website" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.7rem' }}><input type="checkbox" checked={canWrite} onChange={(e) => setCanWrite(e.target.checked)} /> May add and change records</label>
          <button type="submit" style={toolPrimaryStyle} disabled={busy || !name.trim()}>Make key</button>
        </form>
        {made && (
          <div style={{ marginTop: 12 }}>
            <div style={{ ...small, color: 'var(--white)' }}>Copy this key now. It is not shown again.</div>
            <code style={code} data-testid="new-key">{made}</code>
            <button type="button" style={{ ...toolBtnStyle, marginTop: 8 }} onClick={copy}>{copied ? 'Copied' : 'Copy key'}</button>
          </div>
        )}
        {error && <div role="alert" style={{ ...small, color: 'var(--red)', marginTop: 10 }}>{error}</div>}
      </div>

      {keys.length > 0 && (
        <div style={{ ...card, overflowX: 'auto' }}>
          <div style={{ ...fieldLabelStyle, marginBottom: 10 }}>Keys</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.68rem' }}>
            <tbody>
              {keys.map((k) => (
                <tr key={k.id} style={{ borderTop: '1px solid var(--border)', opacity: k.revoked_at ? 0.5 : 1 }}>
                  <td style={{ padding: '0.5rem 0.4rem' }}>{k.name}<div style={{ color: 'var(--dim)', fontFamily: 'var(--mono)' }}>{k.prefix}…</div></td>
                  <td style={{ padding: '0.5rem 0.4rem', color: 'var(--dim)' }}>{k.can_write ? 'Read and write' : 'Read only'}</td>
                  <td style={{ padding: '0.5rem 0.4rem', color: 'var(--dim)' }}>Made {date(k.created_at)}<div>{k.last_used_at ? `Last used ${date(k.last_used_at)}` : 'Never used'}</div></td>
                  <td style={{ padding: '0.5rem 0.4rem', textAlign: 'right' }}>
                    {k.revoked_at ? <span style={{ color: 'var(--dim)' }}>Revoked {date(k.revoked_at)}</span> : <button type="button" style={toolBtnStyle} onClick={() => revoke(k)}>Revoke</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div style={card}>
        <div style={fieldLabelStyle}>How to use it</div>
        <div style={small}>Address: <b>{apiBase(RAPTOR_API_URL)}</b>. Send the key as <b>Authorization: Bearer YOUR_KEY</b>. Up to 120 requests a minute; lists give up to 500 records at a time (add <b>offset</b> for more). The server may take up to a minute to answer after a quiet period.</div>
        {apiExamples(RAPTOR_API_URL).map((x) => (
          <div key={x.title} style={{ marginTop: 12 }}>
            <div style={small}>{x.title}</div>
            <code style={code}>{x.code}</code>
          </div>
        ))}
        <div style={{ ...fieldLabelStyle, marginTop: 16 }}>Fields</div>
        {API_FIELDS.map(([kind, fields]) => <div key={kind} style={{ ...small, marginBottom: 4 }}><b style={{ color: 'var(--white)' }}>{kind}</b>: {fields}</div>)}
      </div>
    </div>
  );
}
