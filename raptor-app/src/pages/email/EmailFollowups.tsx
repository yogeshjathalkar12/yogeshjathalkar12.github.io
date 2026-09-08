import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { fieldInputStyle, primaryBtnStyle } from '../../components/crm/Modal';

const CONDITIONS = [
  { value: 'opened', label: 'Opened the original email' },
  { value: 'not_opened', label: "Didn't open the original email" },
  { value: 'clicked', label: 'Clicked a link in the original email' },
  { value: 'not_clicked', label: "Didn't click a link in the original email" },
];

export default function EmailFollowups() {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [accountId, setAccountId] = useState('');
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [campaignId, setCampaignId] = useState('');
  const [followups, setFollowups] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [name, setName] = useState('');
  const [condition, setCondition] = useState('not_opened');
  const [waitHours, setWaitHours] = useState('24');
  const [subject, setSubject] = useState('');
  const [bodyHtml, setBodyHtml] = useState('<p>Hi {{first_name}},</p>\n\n<p></p>\n\n<p><a href="{{unsubscribe_url}}">Unsubscribe</a></p>');
  const [isTransactional, setIsTransactional] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchAccounts();
  }, []);

  useEffect(() => {
    if (accountId) fetchCampaigns();
  }, [accountId]);

  useEffect(() => {
    if (campaignId) {
      fetchFollowups();
      const channel = supabase
        .channel(`campaign-followups-${campaignId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'campaign_followups', filter: `source_campaign_id=eq.${campaignId}` }, fetchFollowups)
        .subscribe();
      return () => { supabase.removeChannel(channel); };
    } else {
      setFollowups([]);
    }
  }, [campaignId]);

  async function fetchAccounts() {
    const { data } = await supabase.from('email_accounts').select('*');
    setAccounts(data || []);
    if (data && data.length > 0) setAccountId(data[0].id);
    setLoading(false);
  }

  async function fetchCampaigns() {
    const { data } = await supabase
      .from('email_campaigns')
      .select('id, name, status')
      .eq('account_id', accountId)
      .order('created_at', { ascending: false });
    setCampaigns(data || []);
    setCampaignId(data && data.length > 0 ? data[0].id : '');
  }

  async function fetchFollowups() {
    const { data } = await supabase
      .from('campaign_followups')
      .select('*, campaign_followup_sends(status)')
      .eq('source_campaign_id', campaignId)
      .order('created_at', { ascending: false });
    setFollowups(data || []);
  }

  function followupStats(f: any) {
    const sends = f.campaign_followup_sends || [];
    const sent = sends.filter((s: any) => s.status === 'sent').length;
    const notApplicable = sends.filter((s: any) => s.status === 'not_applicable').length;
    const failed = sends.filter((s: any) => s.status === 'failed').length;
    const skipped = sends.filter((s: any) => s.status === 'skipped_suppressed' || s.status === 'skipped_missing_unsubscribe').length;
    return { total: sends.length, sent, notApplicable, failed, skipped };
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !subject.trim() || !bodyHtml.trim()) {
      setError('Fill in all fields.');
      return;
    }
    if (!isTransactional && !bodyHtml.includes('{{unsubscribe_url}}')) {
      setError('Non-transactional follow-ups must include {{unsubscribe_url}} — check "transactional" only for receipts, welcome emails, etc.');
      return;
    }
    const hours = parseInt(waitHours, 10);
    if (Number.isNaN(hours) || hours < 0) {
      setError('Wait time must be a number of hours, 0 or more.');
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const { error: insertErr } = await supabase.from('campaign_followups').insert({
        source_campaign_id: campaignId,
        name: name.trim(),
        condition,
        wait_hours: hours,
        subject: subject.trim(),
        body_html: bodyHtml,
        is_transactional: isTransactional,
      });
      if (insertErr) throw insertErr;
      setName('');
      setSubject('');
      fetchFollowups();
    } catch (err: any) {
      setError(err.message || 'Could not create follow-up.');
    } finally {
      setCreating(false);
    }
  }

  async function handleToggleActive(f: any) {
    await supabase.from('campaign_followups').update({ is_active: !f.is_active }).eq('id', f.id);
    fetchFollowups();
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this follow-up rule? Already-sent history stays in your event log.')) return;
    await supabase.from('campaign_followups').delete().eq('id', id);
    fetchFollowups();
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
        {campaigns.length > 0 && (
          <select style={{ ...fieldInputStyle, marginBottom: 0, width: 280 }} value={campaignId} onChange={(e) => setCampaignId(e.target.value)}>
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        )}
      </div>

      <div style={{ fontSize: '0.65rem', color: 'var(--dim)', marginBottom: '1.4rem', maxWidth: 620 }}>
        A follow-up checks each recipient of the selected campaign once, a set number of hours after
        their original send, and sends different content depending on whether they opened or clicked —
        exactly once per recipient, never repeated.
      </div>

      {campaigns.length === 0 ? (
        <div style={{ color: 'var(--dim2)', fontSize: '0.65rem' }}>Create a campaign on this account first — follow-ups branch off an existing campaign's send.</div>
      ) : (
        <>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px', padding: '1.4rem', marginBottom: '1.6rem', maxWidth: 620 }}>
            <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: '1.2rem', marginBottom: '1rem' }}>New Follow-up</div>
            <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
              <input style={fieldInputStyle} placeholder="Follow-up name (e.g. Re-engage non-openers)" value={name} onChange={(e) => setName(e.target.value)} />
              <div style={{ display: 'flex', gap: '0.8rem', alignItems: 'center' }}>
                <select style={{ ...fieldInputStyle, marginBottom: 0, flex: 1 }} value={condition} onChange={(e) => setCondition(e.target.value)}>
                  {CONDITIONS.map((c) => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
                <label style={{ fontSize: '0.65rem', color: 'var(--dim)', display: 'flex', alignItems: 'center', gap: '0.4rem', whiteSpace: 'nowrap' }}>
                  wait
                  <input
                    type="number"
                    min={0}
                    style={{ ...fieldInputStyle, marginBottom: 0, width: 80 }}
                    value={waitHours}
                    onChange={(e) => setWaitHours(e.target.value)}
                  />
                  hours
                </label>
              </div>
              <input style={fieldInputStyle} placeholder="Subject — supports {{first_name}} and {a|b} spintax" value={subject} onChange={(e) => setSubject(e.target.value)} />
              <textarea
                style={{ ...fieldInputStyle, minHeight: 160, fontFamily: 'var(--mono)', fontSize: '0.65rem', resize: 'vertical' }}
                value={bodyHtml}
                onChange={(e) => setBodyHtml(e.target.value)}
              />
              <label style={{ fontSize: '0.65rem', color: 'var(--dim)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <input type="checkbox" checked={isTransactional} onChange={(e) => setIsTransactional(e.target.checked)} />
                Transactional (skips warmup cap, business hours, and the unsubscribe-link requirement)
              </label>
              {error && <div style={{ color: 'var(--red)', fontSize: '0.65rem' }}>{error}</div>}
              <button type="submit" style={primaryBtnStyle} disabled={creating}>
                {creating ? 'Creating…' : 'Create Follow-up'}
              </button>
            </form>
          </div>

          <div style={{ fontSize: '0.58rem', letterSpacing: '0.18em', color: 'var(--dim)', textTransform: 'uppercase', marginBottom: '0.8rem' }}>Follow-ups for this campaign</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem', maxWidth: 620 }}>
            {followups.length === 0 ? (
              <div style={{ color: 'var(--dim2)', fontSize: '0.65rem' }}>No follow-ups yet.</div>
            ) : (
              followups.map((f) => {
                const { total, sent, notApplicable, failed, skipped } = followupStats(f);
                const conditionLabel = CONDITIONS.find((c) => c.value === f.condition)?.label || f.condition;
                return (
                  <div key={f.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px', padding: '1rem 1.2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--white)' }}>
                        {f.name}
                        {f.is_transactional && <span style={{ color: 'var(--purple)', fontSize: '0.55rem', marginLeft: '0.5rem' }}>TRANSACTIONAL</span>}
                      </div>
                      <div style={{ fontSize: '0.6rem', color: 'var(--dim)' }}>
                        {f.is_active ? 'active' : 'paused'} · {conditionLabel} · {f.wait_hours}h wait
                        {total > 0 && ` · ${sent} sent, ${notApplicable} n/a${skipped ? `, ${skipped} skipped` : ''}${failed ? `, ${failed} failed` : ''}`}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button
                        onClick={() => handleToggleActive(f)}
                        style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--dim)', padding: '0.4rem 0.8rem', borderRadius: '4px', cursor: 'pointer', fontSize: '0.6rem' }}
                      >
                        {f.is_active ? 'Pause' : 'Activate'}
                      </button>
                      <button
                        onClick={() => handleDelete(f.id)}
                        style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--red)', padding: '0.4rem 0.8rem', borderRadius: '4px', cursor: 'pointer', fontSize: '0.6rem' }}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </>
      )}
    </div>
  );
}