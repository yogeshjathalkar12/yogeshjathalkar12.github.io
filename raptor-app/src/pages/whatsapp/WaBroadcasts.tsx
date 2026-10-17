import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { fieldInputStyle, primaryBtnStyle } from '../../components/crm/Modal';
import WaTemplatePicker, { type PickerItem } from '../../components/whatsapp/WaTemplatePicker';
import { META_APPROVAL_STEPS, META_GROUPS, META_TEMPLATES, metaDetail, metaCopies } from '../../lib/waTemplates';
import { toolApiBase } from '../../lib/config';

const WHATSAPP_API = toolApiBase('whatsapp');

export default function WaBroadcasts() {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [accountId, setAccountId] = useState('');
  const [broadcasts, setBroadcasts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [name, setName] = useState('');
  const [templateName, setTemplateName] = useState('');
  const [templateLanguage, setTemplateLanguage] = useState('en_US');
  const [audienceTag, setAudienceTag] = useState('');
  const [usesName, setUsesName] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { fetchAccounts(); }, []);

  useEffect(() => {
    if (accountId) {
      fetchBroadcasts();
      const channel = supabase
        .channel(`wa-broadcasts-${accountId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'whatsapp_broadcasts', filter: `account_id=eq.${accountId}` }, fetchBroadcasts)
        .subscribe();
      return () => { supabase.removeChannel(channel); };
    }
  }, [accountId]);

  async function fetchAccounts() {
    const { data } = await supabase.from('whatsapp_accounts').select('*');
    setAccounts(data || []);
    if (data && data.length > 0) setAccountId(data[0].id);
    setLoading(false);
  }

  async function fetchBroadcasts() {
    const { data } = await supabase
      .from('whatsapp_broadcasts')
      .select('*, whatsapp_broadcast_recipients(status)')
      .eq('account_id', accountId)
      .order('created_at', { ascending: false });
    setBroadcasts(data || []);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !templateName.trim()) {
      setError('Name and an approved template name are both required.');
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const { error: insertErr } = await supabase.from('whatsapp_broadcasts').insert({
        account_id: accountId,
        name: name.trim(),
        template_name: templateName.trim(),
        template_language: templateLanguage.trim() || 'en_US',
        audience_tag: audienceTag.trim() || null,
        template_params_use_name: usesName,
      });
      if (insertErr) throw insertErr;
      setName(''); setTemplateName(''); setAudienceTag(''); setUsesName(false); setNotice(null);
      fetchBroadcasts();
    } catch (err: any) {
      setError(err.message || 'Could not create broadcast.');
    } finally {
      setCreating(false);
    }
  }

  // A template fills the form with the exact name Meta approved it under.
  function applyTemplate(id: string) {
    const t = META_TEMPLATES.find((x) => x.id === id);
    if (!t) return;
    setError(null);
    setName(t.name);
    setTemplateName(t.meta_name);
    setTemplateLanguage(t.language);
    setUsesName(t.uses_name);
    setNotice('Filled in below. This only works once you have submitted the template to Meta and it shows as Approved in WhatsApp Manager.');
  }

  const pickerItems: PickerItem[] = META_TEMPLATES.map((t) => ({
    id: t.id, category: t.group, name: t.name, when: t.when,
    badge: `${t.category === 'MARKETING' ? 'Marketing' : 'Utility'} · needs Meta approval`, detail: metaDetail(t), copy: metaCopies(t),
  }));

  async function handleSend(broadcastId: string) {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not signed in.');
      const resp = await fetch(`${WHATSAPP_API}/broadcasts/${broadcastId}/send`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        console.error('Failed to trigger broadcast:', body.detail || resp.status);
      }
      fetchBroadcasts();
    } catch (err) {
      console.error('Failed to trigger broadcast:', err);
    }
  }

  function stats(b: any) {
    const recipients = b.whatsapp_broadcast_recipients || [];
    const sent = recipients.filter((r: any) => r.status === 'sent').length;
    const failed = recipients.filter((r: any) => r.status === 'failed').length;
    return { total: recipients.length, sent, failed };
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

      <WaTemplatePicker
        intro="Ready-made messages for offers, launches, invitations, follow-ups and reminders. Meta must approve a message before you can broadcast it: copy the text, submit it, then come back."
        items={pickerItems}
        categories={META_GROUPS}
        actionLabel="Use this template"
        onUse={applyTemplate}
        guide={{
          title: 'How to get a message approved by Meta',
          steps: META_APPROVAL_STEPS,
          note: 'Only message people who agreed to hear from you on WhatsApp. Anyone who replies STOP is removed automatically.',
        }}
      />
      {notice && <div style={{ color: 'var(--green, #3ecf8e)', fontSize: '0.68rem', marginBottom: '1rem', maxWidth: 960 }}>{notice}</div>}

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px', padding: '1.4rem', marginBottom: '1.6rem', maxWidth: 960 }}>
        <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: '1.2rem', marginBottom: '1rem' }}>New Broadcast</div>
        <div style={{ fontSize: '0.6rem', color: 'var(--dim)', marginBottom: '0.8rem' }}>
          Template must already be approved in Meta Business Manager — free-form text isn't allowed for a cold broadcast.
        </div>
        <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
          <input style={fieldInputStyle} placeholder="Broadcast name" value={name} onChange={(e) => setName(e.target.value)} />
          <input style={fieldInputStyle} placeholder="Approved template name" value={templateName} onChange={(e) => setTemplateName(e.target.value)} />
          <input style={fieldInputStyle} placeholder="Template language (default en_US)" value={templateLanguage} onChange={(e) => setTemplateLanguage(e.target.value)} />
          <input style={fieldInputStyle} placeholder="Audience tag (optional — blank = everyone)" value={audienceTag} onChange={(e) => setAudienceTag(e.target.value)} />
          <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', fontSize: '0.65rem', color: 'var(--dim)', cursor: 'pointer' }}>
            <input type="checkbox" checked={usesName} onChange={(e) => setUsesName(e.target.checked)} />
            This template has one variable, {'{{1}}'}, to be filled with each contact&rsquo;s first name
          </label>
          {error && <div style={{ color: 'var(--red)', fontSize: '0.65rem' }}>{error}</div>}
          <button type="submit" style={primaryBtnStyle} disabled={creating}>
            {creating ? 'Creating…' : 'Create Broadcast'}
          </button>
        </form>
      </div>

      <div style={{ fontSize: '0.58rem', letterSpacing: '0.18em', color: 'var(--dim)', textTransform: 'uppercase', marginBottom: '0.8rem' }}>Broadcasts</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 420px), 1fr))', gap: '0.7rem', alignItems: 'start' }}>
        {broadcasts.length === 0 ? (
          <div style={{ color: 'var(--dim2)', fontSize: '0.65rem' }}>No broadcasts yet.</div>
        ) : (
          broadcasts.map((b) => {
            const { total, sent, failed } = stats(b);
            return (
              <div key={b.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px', padding: '1rem 1.2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--white)' }}>{b.name}</div>
                  <div style={{ fontSize: '0.6rem', color: 'var(--dim)' }}>
                    {b.status} {total > 0 && `· ${sent}/${total} sent${failed ? `, ${failed} failed` : ''}`}
                  </div>
                </div>
                {b.status !== 'done' && (
                  <button
                    onClick={() => handleSend(b.id)}
                    style={{ background: 'var(--grad)', color: '#fff', border: 'none', padding: '0.5rem 1rem', borderRadius: '4px', cursor: 'pointer', fontSize: '0.6rem', textTransform: 'uppercase' }}
                  >
                    Send Batch Now
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>
      <div style={{ fontSize: '0.58rem', color: 'var(--dim2)', marginTop: '0.8rem' }}>
        "Send Batch Now" sends one small batch immediately — the rest sends automatically via the scheduled tick every few minutes.
      </div>
    </div>
  );
}
