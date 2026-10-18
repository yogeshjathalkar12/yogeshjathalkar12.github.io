import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { fieldInputStyle, primaryBtnStyle } from '../../components/crm/Modal';
import WaTemplatePicker, { type PickerItem } from '../../components/whatsapp/WaTemplatePicker';
import SaveAsTemplate from '../../components/SaveAsTemplate';
import { useSavedTemplates } from '../../hooks/useSavedTemplates';
import { useOrg } from '../../hooks/OrgContext';
import { MY_TEMPLATES, flowFromRow, promptFromRow, saveTemplate } from '../../lib/savedTemplates';
import { WA_FLOWS, WA_FLOW_CATEGORIES, WA_PROMPTS, buildFlowDefinition, definitionBlanks, findBlanks, flowDetail } from '../../lib/waTemplates';

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
  const [aiError, setAiError] = useState<string | null>(null);

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
    const blanks = findBlanks(aiPrompt);
    if (blanks.length > 0) {
      setAiError(`Fill in the parts in [square brackets] first: ${blanks.slice(0, 4).join(', ')}.`);
      return;
    }
    setAiError(null);
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

  const { can } = useOrg();
  const savedFlows = useSavedTemplates('wa_flow');
  const mineFlows = savedFlows.rows.map(flowFromRow).filter((f): f is NonNullable<typeof f> => !!f);
  const savedPrompts = useSavedTemplates('wa_prompt');
  const minePrompts = savedPrompts.rows.map(promptFromRow).filter((p): p is NonNullable<typeof p> => !!p);
  const [flowToSave, setFlowToSave] = useState('');

  // Saves an existing flow exactly as the builder holds it, so the team can create new ones from it.
  async function saveFlowAsTemplate(name: string, description: string) {
    const flow = flows.find((f) => f.id === flowToSave);
    if (!flow) throw new Error('Choose a flow first.');
    await saveTemplate(supabase, { kind: 'wa_flow', name, description, content: { entry_keyword: flow.entry_keyword, match_type: flow.match_type, definition: flow.definition } });
    await savedFlows.reload();
  }

  async function saveAiAsTemplate(name: string, description: string) {
    await saveTemplate(supabase, { kind: 'wa_prompt', name, description, content: { prompt: aiPrompt.trim() } });
    await savedPrompts.reload();
  }

  // A template creates the flow, paused, and opens it in the builder so the blanks can be filled in.
  async function applyFlow(id: string) {
    const saved = mineFlows.find((x) => x.id === id);
    const t = saved ? undefined : WA_FLOWS.find((x) => x.id === id);
    if (!saved && !t) return;
    setError(null);
    const { data, error: insertErr } = await supabase.from('whatsapp_flows').insert(saved ? {
      account_id: accountId, name: saved.name, entry_keyword: saved.entry_keyword, match_type: saved.match_type,
      definition: JSON.parse(JSON.stringify(saved.definition)), is_active: false,
    } : {
      account_id: accountId, name: t!.name, entry_keyword: t!.entry_keyword, match_type: t!.match_type,
      definition: buildFlowDefinition(t!), is_active: false,
    }).select().single();
    if (insertErr) { setError(insertErr.message || 'Could not create the flow.'); return; }
    navigate(`/whatsapp/flows/${data.id}`);
  }

  const flowItems: PickerItem[] = [
    ...mineFlows.map((f) => ({ id: f.id, category: MY_TEMPLATES, name: f.name, when: f.when, mine: true,
      detail: `Starts when the message ${f.match_type === 'exact' ? 'is exactly' : 'contains'} "${f.entry_keyword}".\n${f.definition.nodes.length - 1} steps.`,
      edit: { kind: 'wa_flow' as const, content: { entry_keyword: f.entry_keyword, match_type: f.match_type, definition: f.definition } } })),
    ...WA_FLOWS.map((t) => ({ id: t.id, category: t.category, name: t.name, when: t.when, detail: flowDetail(t),
      edit: { kind: 'wa_flow' as const, content: { entry_keyword: t.entry_keyword, match_type: t.match_type, definition: buildFlowDefinition(t) } } })),
  ];
  const promptItems: PickerItem[] = [
    ...minePrompts.map((p) => ({ id: p.id, category: MY_TEMPLATES, name: p.name, when: p.when, detail: p.prompt, mine: true, edit: { kind: 'wa_prompt' as const, content: { prompt: p.prompt } } })),
    ...WA_PROMPTS.map((p) => ({ id: p.id, category: p.category, name: p.name, when: p.when, detail: p.prompt, edit: { kind: 'wa_prompt' as const, content: { prompt: p.prompt } } })),
  ];

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

  // A flow talks to customers by itself, so one that still has a blank in it cannot be switched on.
  async function toggleActive(f: any) {
    if (!f.is_active) {
      const blanks = definitionBlanks(f.definition);
      if (blanks.length > 0) {
        setError(`Open the flow and fill in the parts in [square brackets] before switching it on: ${blanks.slice(0, 4).join(', ')}.`);
        return;
      }
    }
    setError(null);
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

      <div style={{ fontSize: '0.6rem', color: 'var(--dim)', marginBottom: '1.2rem', maxWidth: 900 }}>
        A flow starts when an inbound message matches its entry keyword and no other flow is already active for that contact. Flows are checked before plain keyword triggers — if a message matches both, the flow wins.
      </div>

      <WaTemplatePicker
        intro="Ready-made flows for qualifying leads, booking demos, support and feedback. A flow is created paused and opens in the builder so you can fill in your details."
        items={flowItems}
        categories={[...(mineFlows.length > 0 ? [MY_TEMPLATES] : []), ...WA_FLOW_CATEGORIES]}
        onDelete={can('delete') ? savedFlows.remove : undefined}
        editor={{ canCreate: can('create'), canEdit: can('edit'), onSave: savedFlows.persist }}
        actionLabel="Create this flow"
        onUse={applyFlow}
      />
      {error && <div style={{ color: 'var(--red)', fontSize: '0.65rem', marginBottom: '1rem', maxWidth: '100%' }}>{error}</div>}

      <div style={{ marginBottom: '1.6rem', maxWidth: '100%' }}>
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
            <WaTemplatePicker
              title="AI instruction templates"
              intro="Ready-made instructions for a sales, support or booking assistant. Fill in your business facts, because the AI only knows what you tell it."
              items={promptItems}
              categories={[...(minePrompts.length > 0 ? [MY_TEMPLATES] : []), 'AI assistant']}
              actionLabel="Use these instructions"
              onDelete={can('delete') ? savedPrompts.remove : undefined}
              editor={{ canCreate: can('create'), canEdit: can('edit'), onSave: savedPrompts.persist, createOwn: { kind: 'wa_prompt', content: { prompt: '' } } }}
              onUse={(id) => { const p = [...minePrompts, ...WA_PROMPTS].find((x) => x.id === id); if (p) { setAiPrompt(p.prompt); setAiError(null); } }}
            />
            <textarea
              style={{ ...fieldInputStyle, minHeight: 90, resize: 'vertical' }}
              placeholder="System prompt"
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
            />
            {aiError && <div style={{ color: 'var(--red)', fontSize: '0.65rem', marginBottom: '0.6rem' }}>{aiError}</div>}
            {can('create') && <SaveAsTemplate label="Save these instructions as team template" onSave={saveAiAsTemplate} disabledReason={aiPrompt.trim().length < 20 ? 'Write the instructions first.' : undefined} />}
            <button onClick={handleSaveAiSettings} style={primaryBtnStyle} disabled={savingAi}>{savingAi ? 'Saving…' : 'Save AI Settings'}</button>
          </div>
        )}
      </div>

      {/* Flows on the left (moved up), the New Flow card on the right. Narrow windows stack them. */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))', gap: '2rem', alignItems: 'start' }}>
        <div>
      <div style={{ fontSize: '0.58rem', letterSpacing: '0.18em', color: 'var(--dim)', textTransform: 'uppercase', marginBottom: '0.8rem' }}>Flows</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 420px), 1fr))', gap: '0.7rem', alignItems: 'start' }}>
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
        <div>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px', padding: '1.4rem', marginBottom: 0 }}>
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
      {can('create') && flows.length > 0 && (
        <div style={{ marginTop: '1rem' }}>
          <div style={{ fontSize: '0.58rem', letterSpacing: '0.18em', color: 'var(--dim)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>Share a flow with your team</div>
          <select style={{ ...fieldInputStyle, marginBottom: '0.4rem' }} value={flowToSave} onChange={(e) => setFlowToSave(e.target.value)}>
            <option value="">Choose a flow to save as a template…</option>
            {flows.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
          <SaveAsTemplate label="Save as team template" onSave={saveFlowAsTemplate} defaultName={flows.find((f) => f.id === flowToSave)?.name || ''} disabledReason={!flowToSave ? 'Choose a flow first.' : undefined} />
        </div>
      )}
        </div>
      </div>
    </div>
  );
}
