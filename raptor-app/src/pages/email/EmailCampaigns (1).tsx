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
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchAccounts();
  }, []);

  useEffect(() => {
    if (accountId) {
      fetchCampaigns();
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

  async function fetchCampaigns() {
    const { data } = await supabase
      .from('email_campaigns')
      .select('*, email_campaign_recipients(status)')
      .eq('account_id', accountId)
      .order('created_at', { ascending: false });
    setCampaigns(data || []);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !subject.trim() || !bodyHtml.includes('{{unsubscribe_url}}')) {
      setError(!bodyHtml.includes('{{unsubscribe_url}}') ? 'Body must include {{unsubscribe_url}}.' : 'Fill in all fields.');
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const { error: insertErr } = await supabase.from('email_campaigns').insert({
        account_id: accountId,
        name: name.trim(),
        subject: subject.trim(),
        body_html: bodyHtml,
        audience_tag: audienceTag.trim() || null,
      });
      if (insertErr) throw insertErr;
      setName('');
      setSubject('');
      setAudienceTag('');
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

  function stats(c: any) {
    const recipients = c.email_campaign_recipients || [];
    const sent = recipients.filter((r: any) => r.status === 'sent').length;
    const failed = recipients.filter((r: any) => r.status === 'failed').length;
    return { total: recipients.length, sent, failed };
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
          <input style={fieldInputStyle} placeholder="Subject — supports {{first_name}} and {a|b} spintax" value={subject} onChange={(e) => setSubject(e.target.value)} />
          <textarea
            style={{ ...fieldInputStyle, minHeight: 160, fontFamily: 'var(--mono)', fontSize: '0.65rem', resize: 'vertical' }}
            value={bodyHtml}
            onChange={(e) => setBodyHtml(e.target.value)}
          />
          <input style={fieldInputStyle} placeholder="Audience tag (optional — blank = everyone)" value={audienceTag} onChange={(e) => setAudienceTag(e.target.value)} />
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
            const { total, sent, failed } = stats(c);
            return (
              <div key={c.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px', padding: '1rem 1.2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--white)' }}>{c.name}</div>
                  <div style={{ fontSize: '0.6rem', color: 'var(--dim)' }}>
                    {c.status} {total > 0 && `· ${sent}/${total} sent${failed ? `, ${failed} failed` : ''}`}
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
            );
          })
        )}
      </div>
    </div>
  );
}
