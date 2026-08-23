import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { fieldInputStyle, primaryBtnStyle } from '../../components/crm/Modal';

export default function WaTriggers() {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [accountId, setAccountId] = useState('');
  const [triggers, setTriggers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [keyword, setKeyword] = useState('');
  const [matchType, setMatchType] = useState<'contains' | 'exact'>('contains');
  const [replyText, setReplyText] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { fetchAccounts(); }, []);
  useEffect(() => { if (accountId) fetchTriggers(); }, [accountId]);

  async function fetchAccounts() {
    const { data } = await supabase.from('whatsapp_accounts').select('*');
    setAccounts(data || []);
    if (data && data.length > 0) setAccountId(data[0].id);
    setLoading(false);
  }

  async function fetchTriggers() {
    const { data } = await supabase.from('whatsapp_triggers').select('*').eq('account_id', accountId).order('created_at', { ascending: false });
    setTriggers(data || []);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!keyword.trim() || !replyText.trim()) { setError('Keyword and reply text are both required.'); return; }
    setCreating(true);
    setError(null);
    try {
      const { error: insertErr } = await supabase.from('whatsapp_triggers').insert({
        account_id: accountId,
        keyword: keyword.trim(),
        match_type: matchType,
        reply_text: replyText.trim(),
      });
      if (insertErr) throw insertErr;
      setKeyword(''); setReplyText('');
      fetchTriggers();
    } catch (err: any) {
      setError(err.message || 'Could not create trigger.');
    } finally {
      setCreating(false);
    }
  }

  async function toggleActive(id: string, current: boolean) {
    await supabase.from('whatsapp_triggers').update({ is_active: !current }).eq('id', id);
    fetchTriggers();
  }

  async function handleRemove(id: string) {
    await supabase.from('whatsapp_triggers').delete().eq('id', id);
    fetchTriggers();
  }

  if (loading) return <div style={{ padding: '2rem', color: 'var(--dim)' }}>Loading…</div>;
  if (accounts.length === 0) {
    return <div style={{ padding: '2rem', color: 'var(--dim)', fontSize: '0.7rem' }}>Connect a WhatsApp number first.</div>;
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.4rem' }}>
        <select style={{ ...fieldInputStyle, marginBottom: 0, width: 240 }} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
          {accounts.map((a) => (<option key={a.id} value={a.id}>{a.label}</option>))}
        </select>
      </div>

      <div style={{ fontSize: '0.6rem', color: 'var(--dim)', marginBottom: '1.2rem', maxWidth: 620 }}>
        Fires only on an inbound message — free-form replies are only allowed within Meta's 24-hour session window, which an inbound message always satisfies. "STOP"/"unsubscribe" are handled automatically as opt-outs and don't need a trigger here.
      </div>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px', padding: '1.4rem', marginBottom: '1.6rem', maxWidth: 560 }}>
        <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: '1.2rem', marginBottom: '1rem' }}>New Trigger</div>
        <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
          <input style={fieldInputStyle} placeholder="Keyword (e.g. pricing)" value={keyword} onChange={(e) => setKeyword(e.target.value)} />
          <select style={fieldInputStyle} value={matchType} onChange={(e) => setMatchType(e.target.value as 'contains' | 'exact')}>
            <option value="contains">Message contains this word</option>
            <option value="exact">Message is exactly this</option>
          </select>
          <textarea style={{ ...fieldInputStyle, minHeight: 100, resize: 'vertical' }} placeholder="Auto-reply text" value={replyText} onChange={(e) => setReplyText(e.target.value)} />
          {error && <div style={{ color: 'var(--red)', fontSize: '0.65rem' }}>{error}</div>}
          <button type="submit" style={primaryBtnStyle} disabled={creating}>{creating ? 'Creating…' : 'Create Trigger'}</button>
        </form>
      </div>

      <div style={{ fontSize: '0.58rem', letterSpacing: '0.18em', color: 'var(--dim)', textTransform: 'uppercase', marginBottom: '0.8rem' }}>Triggers</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem', maxWidth: 620 }}>
        {triggers.length === 0 ? (
          <div style={{ color: 'var(--dim2)', fontSize: '0.65rem' }}>No triggers yet.</div>
        ) : (
          triggers.map((t) => (
            <div key={t.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px', padding: '1rem 1.2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--white)' }}>"{t.keyword}" ({t.match_type})</div>
                <div style={{ fontSize: '0.6rem', color: 'var(--dim)' }}>{t.reply_text}</div>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button onClick={() => toggleActive(t.id, t.is_active)} style={{ background: 'transparent', border: '1px solid var(--border)', color: t.is_active ? 'var(--accent)' : 'var(--dim)', padding: '0.4rem 0.8rem', borderRadius: '4px', cursor: 'pointer', fontSize: '0.6rem' }}>
                  {t.is_active ? 'Active' : 'Paused'}
                </button>
                <button onClick={() => handleRemove(t.id)} style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--red)', padding: '0.4rem 0.8rem', borderRadius: '4px', cursor: 'pointer', fontSize: '0.6rem' }}>
                  Remove
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
