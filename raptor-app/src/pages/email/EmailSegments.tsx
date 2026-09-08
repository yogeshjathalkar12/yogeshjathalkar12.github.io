import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { fieldInputStyle, primaryBtnStyle } from '../../components/crm/Modal';

const CONDITION_TYPES = [
  { value: 'tag', label: 'Has tag', needsTag: true },
  { value: 'not_tag', label: "Doesn't have tag", needsTag: true },
  { value: 'opened_campaign', label: 'Opened campaign', needsCampaign: true },
  { value: 'not_opened_campaign', label: "Didn't open campaign", needsCampaign: true },
  { value: 'clicked_campaign', label: 'Clicked a link in campaign', needsCampaign: true },
  { value: 'not_clicked_campaign', label: "Didn't click a link in campaign", needsCampaign: true },
];

function emptyCondition() {
  return { type: 'tag', tag: '', campaign_id: '' };
}

export default function EmailSegments() {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [accountId, setAccountId] = useState('');
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [segments, setSegments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [name, setName] = useState('');
  const [match, setMatch] = useState<'all' | 'any'>('all');
  const [conditions, setConditions] = useState<any[]>([emptyCondition()]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchAccounts();
  }, []);

  useEffect(() => {
    if (accountId) {
      fetchSegments();
      fetchCampaigns();
      const channel = supabase
        .channel(`email-segments-${accountId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'email_segments', filter: `account_id=eq.${accountId}` }, fetchSegments)
        .subscribe();
      return () => { supabase.removeChannel(channel); };
    }
  }, [accountId]);

  async function fetchAccounts() {
    const { data } = await supabase.from('email_accounts').select('*');
    setAccounts(data || []);
    if (data && data.length > 0) setAccountId(data[0].id);
    setLoading(false);
  }

  async function fetchCampaigns() {
    const { data } = await supabase
      .from('email_campaigns')
      .select('id, name')
      .eq('account_id', accountId)
      .order('created_at', { ascending: false });
    setCampaigns(data || []);
  }

  async function fetchSegments() {
    const { data } = await supabase
      .from('email_segments')
      .select('*')
      .eq('account_id', accountId)
      .order('created_at', { ascending: false });
    setSegments(data || []);
  }

  function updateCondition(index: number, patch: any) {
    setConditions((prev) => prev.map((c, i) => (i === index ? { ...c, ...patch } : c)));
  }

  function addCondition() {
    setConditions((prev) => [...prev, emptyCondition()]);
  }

  function removeCondition(index: number) {
    setConditions((prev) => prev.filter((_, i) => i !== index));
  }

  function describeCondition(c: any): string {
    const def = CONDITION_TYPES.find((t) => t.value === c.type);
    if (!def) return c.type;
    if (def.needsTag) return `${def.label}: ${c.tag}`;
    if (def.needsCampaign) {
      const camp = campaigns.find((camp) => camp.id === c.campaign_id);
      return `${def.label}: ${camp?.name || 'unknown campaign'}`;
    }
    return def.label;
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError('Give the segment a name.');
      return;
    }
    const cleanConditions = conditions.filter((c) => {
      const def = CONDITION_TYPES.find((t) => t.value === c.type);
      if (def?.needsTag) return !!c.tag.trim();
      if (def?.needsCampaign) return !!c.campaign_id;
      return true;
    });
    if (cleanConditions.length === 0) {
      setError('Add at least one complete condition.');
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const rules = {
        match,
        conditions: cleanConditions.map((c) => {
          const def = CONDITION_TYPES.find((t) => t.value === c.type);
          if (def?.needsTag) return { type: c.type, tag: c.tag.trim() };
          if (def?.needsCampaign) return { type: c.type, campaign_id: c.campaign_id };
          return { type: c.type };
        }),
      };
      const { error: insertErr } = await supabase.from('email_segments').insert({
        account_id: accountId,
        name: name.trim(),
        rules,
      });
      if (insertErr) throw insertErr;
      setName('');
      setMatch('all');
      setConditions([emptyCondition()]);
      fetchSegments();
    } catch (err: any) {
      setError(err.message || 'Could not create segment.');
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this segment? Campaigns already using it keep their already-resolved recipient list — only future use of this segment is affected.')) return;
    await supabase.from('email_segments').delete().eq('id', id);
    fetchSegments();
  }

  if (loading) return <div style={{ padding: '2rem', color: 'var(--dim)' }}>Loading…</div>;

  if (accounts.length === 0) {
    return <div style={{ padding: '2rem', color: 'var(--dim)', fontSize: '0.7rem' }}>Connect a sending account first.</div>;
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.4rem' }}>
        <select style={{ ...fieldInputStyle, marginBottom: 0, width: 240 }} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>{a.label}</option>
          ))}
        </select>
      </div>

      <div style={{ fontSize: '0.65rem', color: 'var(--dim)', marginBottom: '1.4rem', maxWidth: 620 }}>
        A segment combines tag and engagement conditions to target a campaign more precisely than a single tag —
        e.g. "has tag 'customer' AND didn't open the last campaign." Pick a segment instead of a plain audience
        tag when creating a campaign.
      </div>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px', padding: '1.4rem', marginBottom: '1.6rem', maxWidth: 620 }}>
        <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: '1.2rem', marginBottom: '1rem' }}>New Segment</div>
        <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
          <input style={fieldInputStyle} placeholder="Segment name (e.g. Engaged customers)" value={name} onChange={(e) => setName(e.target.value)} />

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <span style={{ fontSize: '0.65rem', color: 'var(--dim)' }}>Match</span>
            <select style={{ ...fieldInputStyle, marginBottom: 0, width: 140 }} value={match} onChange={(e) => setMatch(e.target.value as 'all' | 'any')}>
              <option value="all">ALL conditions</option>
              <option value="any">ANY condition</option>
            </select>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            {conditions.map((c, i) => {
              const def = CONDITION_TYPES.find((t) => t.value === c.type);
              return (
                <div key={i} style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
                  <select
                    style={{ ...fieldInputStyle, marginBottom: 0, flex: 1 }}
                    value={c.type}
                    onChange={(e) => updateCondition(i, { type: e.target.value })}
                  >
                    {CONDITION_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                  {def?.needsTag && (
                    <input
                      style={{ ...fieldInputStyle, marginBottom: 0, flex: 1 }}
                      placeholder="tag"
                      value={c.tag}
                      onChange={(e) => updateCondition(i, { tag: e.target.value })}
                    />
                  )}
                  {def?.needsCampaign && (
                    <select
                      style={{ ...fieldInputStyle, marginBottom: 0, flex: 1 }}
                      value={c.campaign_id}
                      onChange={(e) => updateCondition(i, { campaign_id: e.target.value })}
                    >
                      <option value="">Select campaign…</option>
                      {campaigns.map((camp) => (
                        <option key={camp.id} value={camp.id}>{camp.name}</option>
                      ))}
                    </select>
                  )}
                  {conditions.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeCondition(i)}
                      style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--red)', padding: '0.4rem 0.6rem', borderRadius: '4px', cursor: 'pointer', fontSize: '0.6rem', flexShrink: 0 }}
                    >
                      ✕
                    </button>
                  )}
                </div>
              );
            })}
            <button
              type="button"
              onClick={addCondition}
              style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--dim)', padding: '0.5rem 0.8rem', borderRadius: '4px', cursor: 'pointer', fontSize: '0.6rem', alignSelf: 'flex-start' }}
            >
              + Add condition
            </button>
          </div>

          {error && <div style={{ color: 'var(--red)', fontSize: '0.65rem' }}>{error}</div>}
          <button type="submit" style={primaryBtnStyle} disabled={creating}>
            {creating ? 'Creating…' : 'Create Segment'}
          </button>
        </form>
      </div>

      <div style={{ fontSize: '0.58rem', letterSpacing: '0.18em', color: 'var(--dim)', textTransform: 'uppercase', marginBottom: '0.8rem' }}>Segments</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem', maxWidth: 620 }}>
        {segments.length === 0 ? (
          <div style={{ color: 'var(--dim2)', fontSize: '0.65rem' }}>No segments yet.</div>
        ) : (
          segments.map((s) => (
            <div key={s.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px', padding: '1rem 1.2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--white)' }}>{s.name}</div>
                <div style={{ fontSize: '0.6rem', color: 'var(--dim)' }}>
                  Match {s.rules?.match?.toUpperCase() || 'ALL'} of: {(s.rules?.conditions || []).map(describeCondition).join(' · ')}
                </div>
              </div>
              <button
                onClick={() => handleDelete(s.id)}
                style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--red)', padding: '0.4rem 0.8rem', borderRadius: '4px', cursor: 'pointer', fontSize: '0.6rem' }}
              >
                Delete
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}