import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { fieldInputStyle, primaryBtnStyle } from '../../components/crm/Modal';

export default function WaFlows() {
  const navigate = useNavigate();
  const [accounts, setAccounts] = useState<any[]>([]);
  const [accountId, setAccountId] = useState('');
  const [flows, setFlows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [name, setName] = useState('');
  const [entryKeyword, setEntryKeyword] = useState('');
  const [matchType, setMatchType] = useState<'contains' | 'exact'>('contains');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [, setAiSettings] = useState<any | null>(null);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiEnabled, setAiEnabled] = useState(true);
  const [savingAi, setSavingAi] = useState(false);
  const [showAiSettings, setShowAiSettings] = useState(false);

  useEffect(() => { fetchAccounts(); }, []);
  useEffect(() => {
    if (accountId) {
      fetchFlows();
      fetchAiSettings();
    }
  }, [accountId]);

  async function fetchAccounts() {
    const { data } = await supabase.from('whatsapp_accounts').select('*');
    setAccounts(data || []);
    if (data && data.length > 0) setAccountId(data[0].id);
    setLoading(false);
  }

  async function fetchFlows() {
    const { data } = await supabase.from('whatsapp_flows').select('*').eq('account_id', accountId).order('created_at', { ascending: false });
    setFlows(data || []);
  }

  async function fetchAiSettings() {
    const { data } = await supabase.from('whatsapp_ai_settings').select('*').eq('account_id', accountId).maybeSingle();
    setAiSettings(data);
    setAiPrompt(data?.system_prompt || 'You are a helpful assistant answering questions on behalf of this business over WhatsApp. Keep replies short — 1-3 sentences.');
    setAiEnabled(data?.is_enabled ?? true);
  }

  async function handleSaveAiSettings() {
    setSavingAi(true);
    try {
      await supabase.from('whatsapp_ai_settings').upsert(
        { account_id: accountId, system_prompt: aiPrompt.trim(), is_enabled: aiEnabled, updated_at: new Date().toISOString() },
        { onConflict: 'account_id' }
      );
      fetchAiSettings();
    } finally {
      setSavingAi(false);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !entryKeyword.trim()) { setError('Name and entry keyword are both required.'); return; }
    setCreating(true);
    setError(null);
    try {
      const startNodeId = 'start_1';
      const { data, error: insertErr } = await supabase.from('whatsapp_flows').insert({
        account_id: accountId,
        name: name.trim(),
        entry_keyword: entryKeyword.trim(),
        match_type: matchType,
        definition: {
          nodes: [{ id: startNodeId, type: 'flowNode', position: { x: 250, y: 50 }, data: { kind: 'start', label: 'Start', branches: [] } }],
          edges: [],
        },
      }).select().single();
      if (insertErr) throw insertErr;
      navigate(`/whatsapp/flows/${data.id}`);
    } catch (err: any) {
      setError(err.message || 'Could not create flow.');
    } finally {
      setCreating(false);
    }
  }

  async function toggleActive(f: any) {
    await supabase.from('whatsapp_flows').update({ is_active: !f.is_active }).eq('id', f.id);
    fetchFlows();
  }

  async function handleRemove(id: string) {
    if (!confirm('Delete this flow? Contacts currently in it will fall back to plain keyword triggers.')) return;
    await supabase.from('whatsapp_flows').delete().eq('id', id);
    fetchFlows();
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

      <div style={{ fontSize: '0.6rem', color: 'var(--dim)', marginBottom: '1.2rem', maxWidth: 640 }}>
        A flow starts when an inbound message matches its entry keyword and no other flow is already active for that contact. Flows are checked before plain keyword triggers — if a message matches both, the flow wins.
      </div>

      <div style={{ marginBottom: '1.6rem', maxWidth: 640 }}>
        <button
          onClick={() => setShowAiSettings((v) => !v)}
          style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--dim)', padding: '0.5rem 0.9rem', borderRadius: '4px', cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: '0.6rem', textTransform: 'uppercase', marginBottom: '0.8rem' }}
        >
          {showAiSettings ? '▾' : '▸'} AI Reply Settings
        </button>
        {showAiSettings && (
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px', padding: '1.2rem' }}>
            <div style={{ fontSize: '0.6rem', color: 'var(--dim)', marginBottom: '0.8rem' }}>
              Used by any "AI Reply" node in your flows. Needs an Anthropic key already saved under your AI Content Suite settings — this doesn't ask for a new one.
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.65rem', marginBottom: '0.8rem', cursor: 'pointer' }}>
              <input type="checkbox" checked={aiEnabled} onChange={(e) => setAiEnabled(e.target.checked)} />
              Enable AI Reply nodes for this number
            </label>
            <textarea
              style={{ ...fieldInputStyle, minHeight: 90, resize: 'vertical' }}
              placeholder="System prompt"
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
            />
            <button onClick={handleSaveAiSettings} style={primaryBtnStyle} disabled={savingAi}>{savingAi ? 'Saving…' : 'Save AI Settings'}</button>
          </div>
        )}
      </div>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px', padding: '1.4rem', marginBottom: '1.6rem', maxWidth: 480 }}>
        <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: '1.2rem', marginBottom: '1rem' }}>New Flow</div>
        <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
          <input style={fieldInputStyle} placeholder="Flow name (e.g. Lead Qualification)" value={name} onChange={(e) => setName(e.target.value)} />
          <input style={fieldInputStyle} placeholder="Entry keyword (e.g. hi, hello, start)" value={entryKeyword} onChange={(e) => setEntryKeyword(e.target.value)} />
          <select style={fieldInputStyle} value={matchType} onChange={(e) => setMatchType(e.target.value as 'contains' | 'exact')}>
            <option value="contains">Message contains this word</option>
            <option value="exact">Message is exactly this</option>
          </select>
          {error && <div style={{ color: 'var(--red)', fontSize: '0.65rem' }}>{error}</div>}
          <button type="submit" style={primaryBtnStyle} disabled={creating}>{creating ? 'Creating…' : 'Create & Open Builder'}</button>
        </form>
      </div>

      <div style={{ fontSize: '0.58rem', letterSpacing: '0.18em', color: 'var(--dim)', textTransform: 'uppercase', marginBottom: '0.8rem' }}>Flows</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem', maxWidth: 640 }}>
        {flows.length === 0 ? (
          <div style={{ color: 'var(--dim2)', fontSize: '0.65rem' }}>No flows yet.</div>
        ) : (
          flows.map((f) => (
            <div key={f.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px', padding: '1rem 1.2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ cursor: 'pointer', flex: 1 }} onClick={() => navigate(`/whatsapp/flows/${f.id}`)}>
                <div style={{ fontSize: '0.75rem', color: 'var(--white)' }}>{f.name}</div>
                <div style={{ fontSize: '0.6rem', color: 'var(--dim)' }}>
                  entry: "{f.entry_keyword}" ({f.match_type}) · {(f.definition?.nodes || []).length} nodes
                </div>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button onClick={() => toggleActive(f)} style={{ background: 'transparent', border: '1px solid var(--border)', color: f.is_active ? 'var(--accent)' : 'var(--dim)', padding: '0.4rem 0.8rem', borderRadius: '4px', cursor: 'pointer', fontSize: '0.6rem' }}>
                  {f.is_active ? 'Active' : 'Paused'}
                </button>
                <button onClick={() => navigate(`/whatsapp/flows/${f.id}`)} style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--dim)', padding: '0.4rem 0.8rem', borderRadius: '4px', cursor: 'pointer', fontSize: '0.6rem' }}>
                  Edit
                </button>
                <button onClick={() => handleRemove(f.id)} style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--red)', padding: '0.4rem 0.8rem', borderRadius: '4px', cursor: 'pointer', fontSize: '0.6rem' }}>
                  Delete
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}