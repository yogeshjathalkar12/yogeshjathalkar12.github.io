import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { fieldInputStyle, primaryBtnStyle } from '../../components/crm/Modal';
import { relativeTime } from '../../lib/crmHelpers';
import { toolApiBase } from '../../lib/config';

const WHATSAPP_API = toolApiBase('whatsapp');

const STATUS_FILTERS = [
  { key: 'waiting', label: 'Waiting' },
  { key: 'mine', label: 'Mine' },
  { key: 'bot', label: 'Bot-handled' },
  { key: 'resolved', label: 'Resolved' },
  { key: 'all', label: 'All' },
];

const STATUS_COLORS: Record<string, string> = {
  waiting: 'var(--red)',
  human: 'var(--accent)',
  bot: 'var(--dim)',
  resolved: 'var(--green)',
};

export default function WaInbox() {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [accountId, setAccountId] = useState('');
  const [conversations, setConversations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('waiting');
  const [currentUserId, setCurrentUserId] = useState<string>('');

  const [activeId, setActiveId] = useState<string>('');
  const [messages, setMessages] = useState<any[]>([]);
  const [msgLoading, setMsgLoading] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setCurrentUserId(data.user?.id || ''));
    fetchAccounts();
  }, []);

  useEffect(() => {
    if (!accountId) return;
    fetchConversations();
    const channel = supabase
      .channel(`wa-inbox-${accountId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'whatsapp_conversations', filter: `account_id=eq.${accountId}` }, fetchConversations)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [accountId]);

  useEffect(() => {
    if (!activeId) { setMessages([]); return; }
    fetchMessages(activeId);
    const channel = supabase
      .channel(`wa-inbox-thread-${activeId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'whatsapp_events', filter: `conversation_id=eq.${activeId}` }, (payload: any) => {
        setMessages((prev) => [...prev, payload.new]);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [activeId]);

  async function fetchAccounts() {
    const { data } = await supabase.from('whatsapp_accounts').select('*');
    setAccounts(data || []);
    if (data && data.length > 0) setAccountId(data[0].id);
    setLoading(false);
  }

  async function fetchConversations() {
    const { data } = await supabase
      .from('whatsapp_conversations')
      .select('*, contacts(id, name)')
      .eq('account_id', accountId)
      .order('last_message_at', { ascending: false });
    setConversations(data || []);
  }

  async function fetchMessages(conversationId: string) {
    setMsgLoading(true);
    try {
      const { data } = await supabase
        .from('whatsapp_events')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true });
      setMessages(data || []);

      const conv = conversations.find((c) => c.id === conversationId);
      if (conv && conv.unread_count > 0) {
        await supabase.from('whatsapp_conversations').update({ unread_count: 0 }).eq('id', conversationId);
      }
    } finally {
      setMsgLoading(false);
    }
  }

  const filtered = conversations.filter((c) => {
    if (filter === 'all') return true;
    if (filter === 'mine') return c.assigned_agent_id === currentUserId && c.status !== 'resolved';
    return c.status === filter;
  });

  const active = conversations.find((c) => c.id === activeId) || null;

  async function claimConversation(conv: any) {
    await supabase.from('whatsapp_conversations').update({ assigned_agent_id: currentUserId, status: 'human' }).eq('id', conv.id);
  }

  async function resolveConversation(conv: any) {
    await supabase.from('whatsapp_conversations').update({ status: 'resolved' }).eq('id', conv.id);
  }

  async function reopenConversation(conv: any) {
    await supabase.from('whatsapp_conversations').update({ status: 'waiting' }).eq('id', conv.id);
  }

  async function handleSendReply(e: React.FormEvent) {
    e.preventDefault();
    if (!replyText.trim() || !active) return;
    setSending(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not signed in.');
      const resp = await fetch(`${WHATSAPP_API}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ account_id: active.account_id, phone: active.contact_phone, text: replyText.trim() }),
      });
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        throw new Error(body.detail || 'Could not send reply.');
      }
      setReplyText('');
    } catch (err: any) {
      setError(err.message || 'Could not send — the 24-hour reply window may have closed.');
    } finally {
      setSending(false);
    }
  }

  if (loading) return <div style={{ padding: '2rem', color: 'var(--dim)' }}>Loading…</div>;
  if (accounts.length === 0) {
    return <div style={{ padding: '2rem', color: 'var(--dim)', fontSize: '0.7rem' }}>Connect a WhatsApp number first.</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem', flexShrink: 0 }}>
        <select style={{ ...fieldInputStyle, marginBottom: 0, width: 240 }} value={accountId} onChange={(e) => { setAccountId(e.target.value); setActiveId(''); }}>
          {accounts.map((a) => (<option key={a.id} value={a.id}>{a.label}</option>))}
        </select>
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexShrink: 0 }}>
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            style={{
              background: filter === f.key ? 'var(--grad)' : 'transparent',
              color: filter === f.key ? '#fff' : 'var(--dim)',
              border: '1px solid var(--border)',
              padding: '0.5rem 0.8rem',
              borderRadius: '4px',
              cursor: 'pointer',
              fontFamily: 'var(--mono)',
              fontSize: '0.6rem',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: '1rem', flex: 1, minHeight: 0 }}>
        {/* Conversation list */}
        <div style={{ width: 300, flexShrink: 0, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: '6px', background: 'var(--surface)' }}>
          {filtered.length === 0 ? (
            <div style={{ color: 'var(--dim2)', fontSize: '0.65rem', padding: '1.5rem', textAlign: 'center' }}>No conversations here.</div>
          ) : (
            filtered.map((c) => (
              <div
                key={c.id}
                onClick={() => setActiveId(c.id)}
                style={{
                  padding: '0.9rem 1rem',
                  borderBottom: '1px solid var(--border)',
                  cursor: 'pointer',
                  background: activeId === c.id ? 'var(--surface2)' : 'transparent',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontSize: '0.72rem', color: 'var(--white)', fontWeight: c.unread_count > 0 ? 'bold' : 'normal' }}>
                    {c.contacts?.name || c.contact_phone}
                  </div>
                  {c.unread_count > 0 && (
                    <span style={{ background: 'var(--red)', color: '#fff', borderRadius: 999, fontSize: '0.55rem', padding: '0.1rem 0.4rem' }}>
                      {c.unread_count}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: '0.62rem', color: 'var(--dim)', margin: '0.2rem 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {c.last_message_preview || '—'}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.55rem' }}>
                  <span style={{ color: STATUS_COLORS[c.status] || 'var(--dim)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{c.status}</span>
                  <span style={{ color: 'var(--dim2)' }}>{relativeTime(c.last_message_at)}</span>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Thread pane */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', border: '1px solid var(--border)', borderRadius: '6px', background: 'var(--surface)', minWidth: 0 }}>
          {!active ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--dim2)', fontSize: '0.7rem' }}>
              Select a conversation.
            </div>
          ) : (
            <>
              <div style={{ padding: '1rem 1.2rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
                <div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--white)' }}>{active.contacts?.name || active.contact_phone}</div>
                  <div style={{ fontSize: '0.6rem', color: 'var(--dim)' }}>{active.contact_phone}</div>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  {active.status !== 'resolved' ? (
                    <>
                      {active.assigned_agent_id !== currentUserId && (
                        <button onClick={() => claimConversation(active)} style={secondaryBtn}>Claim</button>
                      )}
                      <button onClick={() => resolveConversation(active)} style={secondaryBtn}>Resolve</button>
                    </>
                  ) : (
                    <button onClick={() => reopenConversation(active)} style={secondaryBtn}>Reopen</button>
                  )}
                </div>
              </div>

              <div style={{ flex: 1, overflowY: 'auto', padding: '1rem 1.2rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                {msgLoading ? (
                  <div style={{ color: 'var(--dim2)', fontSize: '0.65rem', textAlign: 'center' }}>Loading…</div>
                ) : messages.filter((m) => m.event_type === 'sent' || m.event_type === 'received').length === 0 ? (
                  <div style={{ color: 'var(--dim2)', fontSize: '0.65rem', textAlign: 'center' }}>No messages yet.</div>
                ) : (
                  messages
                    .filter((m) => m.event_type === 'sent' || m.event_type === 'received')
                    .map((m) => (
                      <div key={m.id} style={{ display: 'flex', justifyContent: m.direction === 'inbound' ? 'flex-start' : 'flex-end' }}>
                        <div style={{
                          maxWidth: '65%',
                          background: m.direction === 'inbound' ? 'var(--surface2)' : 'var(--grad)',
                          color: m.direction === 'inbound' ? 'var(--white)' : '#fff',
                          borderRadius: '10px',
                          padding: '0.5rem 0.7rem',
                          fontSize: '0.7rem',
                        }}>
                          <div>{m.body_text || <em style={{ opacity: 0.7 }}>[template message]</em>}</div>
                          <div style={{ fontSize: '0.52rem', opacity: 0.65, marginTop: '0.2rem', textAlign: 'right' }}>{relativeTime(m.created_at)}</div>
                        </div>
                      </div>
                    ))
                )}
              </div>

              <form onSubmit={handleSendReply} style={{ display: 'flex', gap: '0.6rem', padding: '1rem 1.2rem', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
                <input
                  style={{ ...fieldInputStyle, marginBottom: 0, flex: 1 }}
                  placeholder="Type a reply…"
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                />
                <button type="submit" style={{ ...primaryBtnStyle, flex: '0 0 auto' }} disabled={sending}>
                  {sending ? '…' : 'Send'}
                </button>
              </form>
              {error && <div style={{ color: 'var(--red)', fontSize: '0.6rem', padding: '0 1.2rem 0.8rem' }}>{error}</div>}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const secondaryBtn: React.CSSProperties = {
  background: 'transparent',
  border: '1px solid var(--border)',
  color: 'var(--dim)',
  padding: '0.4rem 0.8rem',
  borderRadius: '4px',
  cursor: 'pointer',
  fontFamily: 'var(--mono)',
  fontSize: '0.6rem',
  textTransform: 'uppercase',
};