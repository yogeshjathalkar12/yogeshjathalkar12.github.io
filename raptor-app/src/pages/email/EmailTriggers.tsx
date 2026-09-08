import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { fieldInputStyle, primaryBtnStyle } from '../../components/crm/Modal';
import { toolApiBase } from '../../lib/config';
import EmailBodyEditor from '../../components/email/EmailBodyEditor';

const EMAIL_API = toolApiBase('email');

const EVENT_KEY_SUGGESTIONS = ['signup', 'purchase', 'cart_abandoned'];

export default function EmailTriggers() {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [accountId, setAccountId] = useState('');
  const [triggers, setTriggers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [name, setName] = useState('');
  const [eventKey, setEventKey] = useState('');
  const [actionType, setActionType] = useState<'send_email' | 'enroll_sequence'>('send_email');
  const [targetSequenceId, setTargetSequenceId] = useState('');
  const [sequences, setSequences] = useState<any[]>([]);
  const [subject, setSubject] = useState('');
  const [bodyHtml, setBodyHtml] = useState('');
  const [delayMinutes, setDelayMinutes] = useState('0');
  const [isTransactional, setIsTransactional] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formResetKey, setFormResetKey] = useState(0);

  // Shopify's own request signature, separate from the shared
  // X-Webhook-Secret above — set once per account, never re-displayed.
  const [shopifySecretInput, setShopifySecretInput] = useState('');
  const [savingShopifySecret, setSavingShopifySecret] = useState(false);
  const [shopifySecretSaved, setShopifySecretSaved] = useState(false);

  // Webhook secret is only ever visible right after account creation or
  // a regenerate call — never persisted to this component's fetches.
  const [revealedSecret, setRevealedSecret] = useState<string | null>(null);
  const [webhookSourceExample, setWebhookSourceExample] = useState<'generic' | 'shopify'>('generic');
  const [regenerating, setRegenerating] = useState(false);

  useEffect(() => {
    fetchAccounts();
  }, []);

  useEffect(() => {
    if (accountId) {
      fetchTriggers();
      fetchSequences();
      setRevealedSecret(null);
      setShopifySecretSaved(false);
      const channel = supabase
        .channel(`email-triggers-${accountId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'email_triggers', filter: `account_id=eq.${accountId}` }, fetchTriggers)
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

  async function fetchTriggers() {
    const { data } = await supabase
      .from('email_triggers')
      .select('*, email_trigger_events(status)')
      .eq('account_id', accountId)
      .order('created_at', { ascending: false });
    setTriggers(data || []);
  }

  async function fetchSequences() {
    const { data } = await supabase
      .from('email_sequences')
      .select('id, name')
      .eq('account_id', accountId)
      .order('created_at', { ascending: false });
    setSequences(data || []);
  }

  function triggerStats(t: any) {
    const events = t.email_trigger_events || [];
    const sent = events.filter((e: any) => e.status === 'sent').length;
    const pending = events.filter((e: any) => e.status === 'pending').length;
    const failed = events.filter((e: any) => e.status === 'failed').length;
    return { total: events.length, sent, pending, failed };
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !eventKey.trim()) {
      setError('Fill in the name and event key.');
      return;
    }
    if (actionType === 'enroll_sequence') {
      if (!targetSequenceId) {
        setError('Pick a sequence to enroll into.');
        return;
      }
    } else {
      if (!subject.trim() || !bodyHtml.trim()) {
        setError('Fill in the subject and body.');
        return;
      }
      if (!isTransactional && !bodyHtml.includes('{{unsubscribe_url}}')) {
        setError('Non-transactional triggers must include {{unsubscribe_url}} — check "transactional" only for receipts, welcome emails, etc.');
        return;
      }
    }
    const delay = parseInt(delayMinutes, 10);
    if (Number.isNaN(delay) || delay < 0) {
      setError('Delay must be a number of minutes, 0 or more.');
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const { error: insertErr } = await supabase.from('email_triggers').insert({
        account_id: accountId,
        name: name.trim(),
        event_key: eventKey.trim(),
        action_type: actionType,
        target_sequence_id: actionType === 'enroll_sequence' ? targetSequenceId : null,
        subject: actionType === 'send_email' ? subject.trim() : null,
        body_html: actionType === 'send_email' ? bodyHtml : null,
        delay_minutes: delay,
        is_transactional: isTransactional,
      });
      if (insertErr) throw insertErr;
      setName('');
      setEventKey('');
      setSubject('');
      setTargetSequenceId('');
      setDelayMinutes('0');
      setIsTransactional(false);
      setFormResetKey((k) => k + 1);
      fetchTriggers();
    } catch (err: any) {
      setError(err.message || 'Could not create trigger.');
    } finally {
      setCreating(false);
    }
  }

  async function handleToggleActive(t: any) {
    await supabase.from('email_triggers').update({ is_active: !t.is_active }).eq('id', t.id);
    fetchTriggers();
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this trigger? Already-sent history stays in your event log.')) return;
    await supabase.from('email_triggers').delete().eq('id', id);
    fetchTriggers();
  }

  async function handleRegenerateSecret() {
    if (revealedSecret && !confirm('This invalidates the current secret immediately — any webhook already configured with it will stop working until you update it there too. Continue?')) return;
    setRegenerating(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not signed in.');
      const resp = await fetch(`${EMAIL_API}/accounts/${accountId}/webhook-secret/regenerate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!resp.ok) throw new Error(`Could not generate a secret (${resp.status}).`);
      const body = await resp.json();
      setRevealedSecret(body.inbound_webhook_secret);
    } catch (err: any) {
      setError(err.message || 'Could not generate a webhook secret.');
    } finally {
      setRegenerating(false);
    }
  }

  async function handleSaveShopifySecret() {
    if (!shopifySecretInput.trim()) return;
    setSavingShopifySecret(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not signed in.');
      const resp = await fetch(`${EMAIL_API}/accounts/${accountId}/shopify-secret`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ webhook_secret: shopifySecretInput.trim() }),
      });
      if (!resp.ok) throw new Error(`Could not save the Shopify secret (${resp.status}).`);
      setShopifySecretInput('');
      setShopifySecretSaved(true);
    } catch (err: any) {
      setError(err.message || 'Could not save the Shopify secret.');
    } finally {
      setSavingShopifySecret(false);
    }
  }

  const webhookUrl = webhookSourceExample === 'shopify'
    ? `${EMAIL_API}/events/webhook/${accountId}?source=shopify&topic=orders/create`
    : `${EMAIL_API}/events/webhook/${accountId}?source=generic`;

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
        A trigger sends automatically the moment (or a set delay after) an event happens for a contact —
        from your own CRM in-process, or from an outside source below. This is separate from Campaigns,
        which fan one message out to many recipients at once.
      </div>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px', padding: '1.4rem', marginBottom: '1.6rem', maxWidth: 620 }}>
        <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: '1.2rem', marginBottom: '1rem' }}>External event source</div>
        <div style={{ fontSize: '0.65rem', color: 'var(--dim)', marginBottom: '0.8rem' }}>
          Point Shopify, Stripe, Zapier, or any custom integration at this URL, with the secret below as an{' '}
          <code style={{ fontFamily: 'var(--mono)' }}>X-Webhook-Secret</code> header.
        </div>
        <div style={{ display: 'flex', gap: '0.6rem', marginBottom: '0.8rem' }}>
          <button
            type="button"
            onClick={() => setWebhookSourceExample('generic')}
            style={{ ...fieldInputStyle, width: 'auto', padding: '0.4rem 0.8rem', cursor: 'pointer', background: webhookSourceExample === 'generic' ? 'var(--grad)' : undefined }}
          >
            Generic / Zapier
          </button>
          <button
            type="button"
            onClick={() => setWebhookSourceExample('shopify')}
            style={{ ...fieldInputStyle, width: 'auto', padding: '0.4rem 0.8rem', cursor: 'pointer', background: webhookSourceExample === 'shopify' ? 'var(--grad)' : undefined }}
          >
            Shopify example
          </button>
        </div>
        <div style={{ fontFamily: 'var(--mono)', fontSize: '0.62rem', color: 'var(--white)', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '4px', padding: '0.6rem 0.8rem', marginBottom: '0.8rem', wordBreak: 'break-all' }}>
          {webhookUrl}
        </div>
        {revealedSecret ? (
          <div style={{ fontFamily: 'var(--mono)', fontSize: '0.62rem', color: 'var(--purple)', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '4px', padding: '0.6rem 0.8rem', marginBottom: '0.8rem', wordBreak: 'break-all' }}>
            {revealedSecret}
            <div style={{ color: 'var(--dim)', marginTop: '0.4rem' }}>Copy this now — it won't be shown again.</div>
          </div>
        ) : null}
        <button type="button" style={{ ...primaryBtnStyle, width: 'auto', padding: '0.5rem 1rem' }} onClick={handleRegenerateSecret} disabled={regenerating}>
          {regenerating ? 'Generating…' : revealedSecret ? 'Regenerate secret' : 'Reveal / generate secret'}
        </button>

        {webhookSourceExample === 'shopify' && (
          <div style={{ marginTop: '1.2rem', paddingTop: '1.2rem', borderTop: '1px solid var(--border)' }}>
            <div style={{ fontSize: '0.65rem', color: 'var(--dim)', marginBottom: '0.6rem' }}>
              Shopify signs every webhook with its own secret (from your app/webhook settings) — set it here so
              requests are verified as genuinely from Shopify, on top of the shared secret above.
            </div>
            <div style={{ display: 'flex', gap: '0.6rem' }}>
              <input
                style={{ ...fieldInputStyle, marginBottom: 0, flex: 1 }}
                type="password"
                placeholder="Shopify webhook signing secret"
                value={shopifySecretInput}
                onChange={(e) => setShopifySecretInput(e.target.value)}
              />
              <button
                type="button"
                onClick={handleSaveShopifySecret}
                disabled={savingShopifySecret || !shopifySecretInput.trim()}
                style={{ ...primaryBtnStyle, width: 'auto', padding: '0.5rem 1rem' }}
              >
                {savingShopifySecret ? 'Saving…' : 'Save'}
              </button>
            </div>
            {shopifySecretSaved && <div style={{ color: 'var(--green)', fontSize: '0.6rem', marginTop: '0.5rem' }}>Saved — not shown again.</div>}
          </div>
        )}
      </div>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px', padding: '1.4rem', marginBottom: '1.6rem', maxWidth: 620 }}>
        <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: '1.2rem', marginBottom: '1rem' }}>New Trigger</div>
        <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
          <input style={fieldInputStyle} placeholder="Trigger name (e.g. Welcome email)" value={name} onChange={(e) => setName(e.target.value)} />
          <input
            style={fieldInputStyle}
            placeholder={`Event key — e.g. ${EVENT_KEY_SUGGESTIONS.join(', ')}`}
            value={eventKey}
            onChange={(e) => setEventKey(e.target.value)}
            list="event-key-suggestions"
          />
          <datalist id="event-key-suggestions">
            {EVENT_KEY_SUGGESTIONS.map((k) => <option key={k} value={k} />)}
          </datalist>

          <div style={{ display: 'flex', gap: '0.6rem' }}>
            <button
              type="button"
              onClick={() => setActionType('send_email')}
              style={{ ...fieldInputStyle, marginBottom: 0, flex: 1, cursor: 'pointer', background: actionType === 'send_email' ? 'var(--grad)' : undefined }}
            >
              Send an email
            </button>
            <button
              type="button"
              onClick={() => setActionType('enroll_sequence')}
              style={{ ...fieldInputStyle, marginBottom: 0, flex: 1, cursor: 'pointer', background: actionType === 'enroll_sequence' ? 'var(--grad)' : undefined }}
            >
              Enroll in a sequence
            </button>
          </div>

          {actionType === 'enroll_sequence' ? (
            sequences.length === 0 ? (
              <div style={{ fontSize: '0.65rem', color: 'var(--dim2)' }}>No sequences on this account yet — create one in the Sequences tab first.</div>
            ) : (
              <select style={fieldInputStyle} value={targetSequenceId} onChange={(e) => setTargetSequenceId(e.target.value)}>
                <option value="">Select sequence…</option>
                {sequences.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            )
          ) : (
            <>
              <input style={fieldInputStyle} placeholder="Subject — supports {{first_name}} and {a|b} spintax" value={subject} onChange={(e) => setSubject(e.target.value)} />
              <EmailBodyEditor
                key={formResetKey}
                initialHtml={bodyHtml}
                onChange={setBodyHtml}
                requireUnsubscribe={!isTransactional}
              />
            </>
          )}
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <label style={{ fontSize: '0.65rem', color: 'var(--dim)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              Delay
              <input
                type="number"
                min={0}
                style={{ ...fieldInputStyle, marginBottom: 0, width: 90 }}
                value={delayMinutes}
                onChange={(e) => setDelayMinutes(e.target.value)}
              />
              minutes
            </label>
            {actionType === 'send_email' && (
              <label style={{ fontSize: '0.65rem', color: 'var(--dim)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <input type="checkbox" checked={isTransactional} onChange={(e) => setIsTransactional(e.target.checked)} />
                Transactional (skips warmup cap, business hours, and the unsubscribe-link requirement)
              </label>
            )}
          </div>
          {error && <div style={{ color: 'var(--red)', fontSize: '0.65rem' }}>{error}</div>}
          <button type="submit" style={primaryBtnStyle} disabled={creating}>
            {creating ? 'Creating…' : 'Create Trigger'}
          </button>
        </form>
      </div>

      <div style={{ fontSize: '0.58rem', letterSpacing: '0.18em', color: 'var(--dim)', textTransform: 'uppercase', marginBottom: '0.8rem' }}>Triggers</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem', maxWidth: 620 }}>
        {triggers.length === 0 ? (
          <div style={{ color: 'var(--dim2)', fontSize: '0.65rem' }}>No triggers yet.</div>
        ) : (
          triggers.map((t) => {
            const { total, sent, pending, failed } = triggerStats(t);
            return (
              <div key={t.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px', padding: '1rem 1.2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--white)' }}>
                    {t.name} <span style={{ color: 'var(--dim)', fontFamily: 'var(--mono)' }}>· {t.event_key}</span>
                    {t.is_transactional && <span style={{ color: 'var(--purple)', fontSize: '0.55rem', marginLeft: '0.5rem' }}>TRANSACTIONAL</span>}
                  </div>
                  <div style={{ fontSize: '0.6rem', color: 'var(--dim)' }}>
                    {t.is_active ? 'active' : 'paused'}
                    {t.delay_minutes > 0 && ` · ${t.delay_minutes}min delay`}
                    {t.action_type === 'enroll_sequence'
                      ? ` · enrolls in "${sequences.find((s) => s.id === t.target_sequence_id)?.name || 'unknown sequence'}"`
                      : ''}
                    {total > 0 && ` · ${sent} sent, ${pending} pending${failed ? `, ${failed} failed` : ''}`}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    onClick={() => handleToggleActive(t)}
                    style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--dim)', padding: '0.4rem 0.8rem', borderRadius: '4px', cursor: 'pointer', fontSize: '0.6rem' }}
                  >
                    {t.is_active ? 'Pause' : 'Activate'}
                  </button>
                  <button
                    onClick={() => handleDelete(t.id)}
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
    </div>
  );
}