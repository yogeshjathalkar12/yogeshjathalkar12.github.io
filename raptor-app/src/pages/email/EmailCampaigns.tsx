import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { fieldInputStyle, primaryBtnStyle } from '../../components/crm/Modal';
import { toolApiBase } from '../../lib/config';

const EMAIL_API = `${toolApiBase('email')}`; // now the same backend as every other tool — see lib/config.ts

export default function EmailCampaigns() {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [accountId, setAccountId] = useState('');
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [name, setName] = useState('');
  const [subject, setSubject] = useState('');
  const [bodyHtml, setBodyHtml] = useState('<p>Hi {{first_name}},</p>\n\n<p></p>\n\n<p><a href="{{unsubscribe_url}}">Unsubscribe</a></p>');
  const [audienceTag, setAudienceTag] = useState('');
  const [segments, setSegments] = useState<any[]>([]);
  const [segmentId, setSegmentId] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A/B testing
  const [abTestEnabled, setAbTestEnabled] = useState(false);
  const [variants, setVariants] = useState<{ label: string; subject: string; body_html: string }[]>([
    { label: 'A', subject: '', body_html: '<p>Hi {{first_name}},</p>\n\n<p></p>\n\n<p><a href="{{unsubscribe_url}}">Unsubscribe</a></p>' },
    { label: 'B', subject: '', body_html: '<p>Hi {{first_name}},</p>\n\n<p></p>\n\n<p><a href="{{unsubscribe_url}}">Unsubscribe</a></p>' },
  ]);
  const [abTestPercentage, setAbTestPercentage] = useState('50');
  const [abWinnerMetric, setAbWinnerMetric] = useState<'click_rate' | 'open_rate'>('click_rate');
  const [abTestDurationHours, setAbTestDurationHours] = useState('4');
  const [decidingWinner, setDecidingWinner] = useState<string | null>(null);

  useEffect(() => {
    fetchAccounts();
  }, []);

  useEffect(() => {
    if (accountId) {
      fetchCampaigns();
      fetchSegments();
      const channel = supabase
        .channel(`email-campaigns-${accountId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'email_campaigns', filter: `account_id=eq.${accountId}` }, fetchCampaigns)
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

  async function fetchSegments() {
    const { data } = await supabase
      .from('email_segments')
      .select('id, name')
      .eq('account_id', accountId)
      .order('created_at', { ascending: false });
    setSegments(data || []);
  }

  async function fetchCampaigns() {
    const { data } = await supabase
      .from('email_campaigns')
      .select('*, email_campaign_recipients(status, opened_at, clicked_at, variant_id), email_campaign_variants(*)')
      .eq('account_id', accountId)
      .order('created_at', { ascending: false });
    setCampaigns(data || []);
  }

  function addVariant() {
    setVariants((prev) => [
      ...prev,
      { label: String.fromCharCode(65 + prev.length), subject: '', body_html: '<p>Hi {{first_name}},</p>\n\n<p></p>\n\n<p><a href="{{unsubscribe_url}}">Unsubscribe</a></p>' },
    ]);
  }

  function removeVariant(index: number) {
    setVariants((prev) => prev.filter((_, i) => i !== index));
  }

  function updateVariant(index: number, patch: Partial<{ label: string; subject: string; body_html: string }>) {
    setVariants((prev) => prev.map((v, i) => (i === index ? { ...v, ...patch } : v)));
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError('Campaign name is required.');
      return;
    }

    if (abTestEnabled) {
      if (variants.length < 2) {
        setError('An A/B test needs at least 2 variants.');
        return;
      }
      const incomplete = variants.find((v) => !v.subject.trim() || !v.body_html.trim());
      if (incomplete) {
        setError('Every variant needs a subject and a body.');
        return;
      }
      const missingUnsub = variants.find((v) => !v.body_html.includes('{{unsubscribe_url}}'));
      if (missingUnsub) {
        setError(`Variant "${missingUnsub.label}" is missing {{unsubscribe_url}}.`);
        return;
      }
      const pct = parseInt(abTestPercentage, 10);
      if (Number.isNaN(pct) || pct < 1 || pct > 100) {
        setError('Test percentage must be between 1 and 100.');
        return;
      }
      const duration = parseInt(abTestDurationHours, 10);
      if (Number.isNaN(duration) || duration < 1) {
        setError('Test duration must be at least 1 hour.');
        return;
      }
    } else if (!subject.trim() || !bodyHtml.includes('{{unsubscribe_url}}')) {
      setError(!bodyHtml.includes('{{unsubscribe_url}}') ? 'Body must include {{unsubscribe_url}}.' : 'Fill in all fields.');
      return;
    }

    setCreating(true);
    setError(null);
    try {
      const { data: campaignRows, error: insertErr } = await supabase.from('email_campaigns').insert({
        account_id: accountId,
        name: name.trim(),
        // subject/body_html are NOT NULL columns — for an A/B campaign
        // these are only ever a fallback label (e.g. shown if some other
        // part of the UI reads them directly); the actual content sent
        // always comes from the recipient's assigned variant.
        subject: abTestEnabled ? variants[0].subject.trim() : subject.trim(),
        body_html: abTestEnabled ? variants[0].body_html : bodyHtml,
        segment_id: segmentId || null,
        audience_tag: segmentId ? null : (audienceTag.trim() || null),
        ab_test_enabled: abTestEnabled,
        ab_test_percentage: abTestEnabled ? parseInt(abTestPercentage, 10) : 100,
        ab_winner_metric: abWinnerMetric,
        ab_test_duration_hours: abTestEnabled ? parseInt(abTestDurationHours, 10) : 4,
      }).select();
      if (insertErr) throw insertErr;

      if (abTestEnabled && campaignRows && campaignRows[0]) {
        const campaignId = campaignRows[0].id;
        const { error: variantErr } = await supabase.from('email_campaign_variants').insert(
          variants.map((v) => ({
            campaign_id: campaignId,
            label: v.label,
            subject: v.subject.trim(),
            body_html: v.body_html,
          }))
        );
        if (variantErr) throw variantErr;
      }

      setName('');
      setSubject('');
      setAudienceTag('');
      setAbTestEnabled(false);
      setVariants([
        { label: 'A', subject: '', body_html: '<p>Hi {{first_name}},</p>\n\n<p></p>\n\n<p><a href="{{unsubscribe_url}}">Unsubscribe</a></p>' },
        { label: 'B', subject: '', body_html: '<p>Hi {{first_name}},</p>\n\n<p></p>\n\n<p><a href="{{unsubscribe_url}}">Unsubscribe</a></p>' },
      ]);
      fetchCampaigns();
    } catch (err: any) {
      setError(err.message || 'Could not create campaign.');
    } finally {
      setCreating(false);
    }
  }

  async function handleSend(campaignId: string) {
    try {
      // The send endpoint now requires a real user JWT and checks account
      // ownership server-side — it used to accept this call from anyone.
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not signed in.');
      const resp = await fetch(`${EMAIL_API}/campaigns/${campaignId}/send`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        console.error('Failed to trigger campaign send:', body.detail || resp.status);
      }
      fetchCampaigns();
    } catch (err) {
      console.error('Failed to trigger campaign send:', err);
    }
  }

  async function handleDeclareWinner(campaignId: string) {
    setDecidingWinner(campaignId);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not signed in.');
      const resp = await fetch(`${EMAIL_API}/campaigns/${campaignId}/ab-test/declare-winner`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        console.error('Failed to declare winner:', body.detail || resp.status);
      }
      fetchCampaigns();
    } catch (err) {
      console.error('Failed to declare winner:', err);
    } finally {
      setDecidingWinner(null);
    }
  }

  function stats(c: any) {
    const recipients = c.email_campaign_recipients || [];
    const sent = recipients.filter((r: any) => r.status === 'sent').length;
    const failed = recipients.filter((r: any) => r.status === 'failed').length;
    const opened = recipients.filter((r: any) => !!r.opened_at).length;
    const clicked = recipients.filter((r: any) => !!r.clicked_at).length;
    return { total: recipients.length, sent, failed, opened, clicked };
  }

  function variantStats(c: any, variantId: string) {
    const recipients = (c.email_campaign_recipients || []).filter((r: any) => r.variant_id === variantId);
    const sent = recipients.filter((r: any) => r.status === 'sent').length;
    const opened = recipients.filter((r: any) => !!r.opened_at).length;
    const clicked = recipients.filter((r: any) => !!r.clicked_at).length;
    return {
      sent,
      openRate: sent > 0 ? Math.round((opened / sent) * 100) : 0,
      clickRate: sent > 0 ? Math.round((clicked / sent) * 100) : 0,
    };
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

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px', padding: '1.4rem', marginBottom: '1.6rem', maxWidth: 560 }}>
        <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: '1.2rem', marginBottom: '1rem' }}>New Campaign</div>
        <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
          <input style={fieldInputStyle} placeholder="Campaign name" value={name} onChange={(e) => setName(e.target.value)} />

          <label style={{ fontSize: '0.65rem', color: 'var(--dim)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <input type="checkbox" checked={abTestEnabled} onChange={(e) => setAbTestEnabled(e.target.checked)} />
            Run this as an A/B test
          </label>

          {abTestEnabled ? (
            <>
              <div style={{ fontSize: '0.6rem', color: 'var(--dim2)' }}>
                {abTestPercentage}% of the audience splits across variants; the winner (by {abWinnerMetric === 'click_rate' ? 'click' : 'open'} rate) goes to everyone else after {abTestDurationHours}h — or declare one manually anytime.
              </div>

              {variants.map((v, i) => (
                <div key={i} style={{ border: '1px solid var(--border)', borderRadius: '4px', padding: '0.8rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.6rem', color: 'var(--purple)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Variant {v.label}</span>
                    {variants.length > 2 && (
                      <button type="button" onClick={() => removeVariant(i)} style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--red)', padding: '0.2rem 0.5rem', borderRadius: '4px', cursor: 'pointer', fontSize: '0.55rem' }}>
                        Remove
                      </button>
                    )}
                  </div>
                  <input
                    style={{ ...fieldInputStyle, marginBottom: 0 }}
                    placeholder="Subject"
                    value={v.subject}
                    onChange={(e) => updateVariant(i, { subject: e.target.value })}
                  />
                  <textarea
                    style={{ ...fieldInputStyle, marginBottom: 0, minHeight: 120, fontFamily: 'var(--mono)', fontSize: '0.65rem', resize: 'vertical' }}
                    value={v.body_html}
                    onChange={(e) => updateVariant(i, { body_html: e.target.value })}
                  />
                </div>
              ))}
              <button type="button" onClick={addVariant} style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--dim)', padding: '0.5rem 0.8rem', borderRadius: '4px', cursor: 'pointer', fontSize: '0.6rem', alignSelf: 'flex-start' }}>
                + Add variant
              </button>

              <div style={{ display: 'flex', gap: '0.8rem', flexWrap: 'wrap' }}>
                <label style={{ fontSize: '0.6rem', color: 'var(--dim)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  Test %
                  <input type="number" min={1} max={100} style={{ ...fieldInputStyle, marginBottom: 0, width: 70 }} value={abTestPercentage} onChange={(e) => setAbTestPercentage(e.target.value)} />
                </label>
                <label style={{ fontSize: '0.6rem', color: 'var(--dim)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  Winner by
                  <select style={{ ...fieldInputStyle, marginBottom: 0, width: 110 }} value={abWinnerMetric} onChange={(e) => setAbWinnerMetric(e.target.value as 'click_rate' | 'open_rate')}>
                    <option value="click_rate">Click rate</option>
                    <option value="open_rate">Open rate</option>
                  </select>
                </label>
                <label style={{ fontSize: '0.6rem', color: 'var(--dim)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  After
                  <input type="number" min={1} style={{ ...fieldInputStyle, marginBottom: 0, width: 60 }} value={abTestDurationHours} onChange={(e) => setAbTestDurationHours(e.target.value)} />
                  hours
                </label>
              </div>
            </>
          ) : (
            <>
              <input style={fieldInputStyle} placeholder="Subject — supports {{first_name}} and {a|b} spintax" value={subject} onChange={(e) => setSubject(e.target.value)} />
              <textarea
                style={{ ...fieldInputStyle, minHeight: 160, fontFamily: 'var(--mono)', fontSize: '0.65rem', resize: 'vertical' }}
                value={bodyHtml}
                onChange={(e) => setBodyHtml(e.target.value)}
              />
            </>
          )}
          <select style={fieldInputStyle} value={segmentId} onChange={(e) => setSegmentId(e.target.value)}>
            <option value="">No segment — use plain audience tag below</option>
            {segments.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <input
            style={{ ...fieldInputStyle, opacity: segmentId ? 0.5 : 1 }}
            placeholder="Audience tag (optional — blank = everyone)"
            value={audienceTag}
            onChange={(e) => setAudienceTag(e.target.value)}
            disabled={!!segmentId}
          />
          {error && <div style={{ color: 'var(--red)', fontSize: '0.65rem' }}>{error}</div>}
          <button type="submit" style={primaryBtnStyle} disabled={creating}>
            {creating ? 'Creating…' : 'Create Campaign'}
          </button>
        </form>
      </div>

      <div style={{ fontSize: '0.58rem', letterSpacing: '0.18em', color: 'var(--dim)', textTransform: 'uppercase', marginBottom: '0.8rem' }}>Campaigns</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem', maxWidth: 620 }}>
        {campaigns.length === 0 ? (
          <div style={{ color: 'var(--dim2)', fontSize: '0.65rem' }}>No campaigns yet.</div>
        ) : (
          campaigns.map((c) => {
            const { total, sent, failed, opened, clicked } = stats(c);
            const openRate = sent > 0 ? Math.round((opened / sent) * 100) : 0;
            const clickRate = sent > 0 ? Math.round((clicked / sent) * 100) : 0;
            const campaignVariants = c.email_campaign_variants || [];
            const isAbTest = c.ab_test_enabled && campaignVariants.length > 0;
            const winner = campaignVariants.find((v: any) => v.id === c.ab_winner_variant_id);
            return (
              <div key={c.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px', padding: '1rem 1.2rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--white)' }}>
                      {c.name}
                      {isAbTest && <span style={{ color: 'var(--purple)', fontSize: '0.55rem', marginLeft: '0.5rem' }}>A/B TEST</span>}
                    </div>
                    <div style={{ fontSize: '0.6rem', color: 'var(--dim)' }}>
                      {c.status} {total > 0 && `· ${sent}/${total} sent${failed ? `, ${failed} failed` : ''}`}
                      {sent > 0 && ` · ${openRate}% opened, ${clickRate}% clicked`}
                    </div>
                  </div>
                  {c.status === 'draft' && (
                    <button
                      onClick={() => handleSend(c.id)}
                      style={{ background: 'var(--grad)', color: '#fff', border: 'none', padding: '0.5rem 1rem', borderRadius: '4px', cursor: 'pointer', fontSize: '0.6rem', textTransform: 'uppercase' }}
                    >
                      Send Now
                    </button>
                  )}
                </div>

                {isAbTest && (
                  <div style={{ marginTop: '0.8rem', paddingTop: '0.8rem', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {campaignVariants.map((v: any) => {
                      const vs = variantStats(c, v.id);
                      const isWinner = v.id === c.ab_winner_variant_id;
                      return (
                        <div key={v.id} style={{ fontSize: '0.6rem', color: isWinner ? 'var(--green)' : 'var(--dim)', display: 'flex', justifyContent: 'space-between' }}>
                          <span>{isWinner ? '★ ' : ''}Variant {v.label}: {v.subject}</span>
                          <span>{vs.sent} sent · {vs.openRate}% opened · {vs.clickRate}% clicked</span>
                        </div>
                      );
                    })}
                    {winner ? (
                      <div style={{ fontSize: '0.6rem', color: 'var(--green)', marginTop: '0.2rem' }}>
                        Winner: Variant {winner.label} — sent to the rest of the audience.
                      </div>
                    ) : (
                      <button
                        onClick={() => handleDeclareWinner(c.id)}
                        disabled={decidingWinner === c.id}
                        style={{ alignSelf: 'flex-start', background: 'transparent', border: '1px solid var(--border)', color: 'var(--dim)', padding: '0.4rem 0.8rem', borderRadius: '4px', cursor: 'pointer', fontSize: '0.58rem', textTransform: 'uppercase' }}
                      >
                        {decidingWinner === c.id ? 'Deciding…' : 'Declare winner now'}
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}