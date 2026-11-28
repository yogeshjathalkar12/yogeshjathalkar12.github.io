import { useEffect, useState } from 'react';
import type { SmsApi, SmsIndia, SmsTemplate } from './smsApi';
import { Notice, buttonStyle, inputStyle, note } from './ui';

// Texting India from your own registered sender name (DLT). Closed by default and saved on its own; a database without these
// settings shows nothing. The server sends from the name only to +91 numbers and only texts that match a registered template.

const blank: SmsTemplate = { name: '', template_id: '', text: '' };

export default function IndiaSmsSettings({ api }: { api: SmsApi }) {
  const [form, setForm] = useState<SmsIndia | null>(null);
  const [savedName, setSavedName] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    let live = true;
    api.india().then((s) => {
      if (!live || !s) return;
      setForm(s);
      setSavedName(s.confirmed_at ? s.sender_id : '');
      setConfirmed(!!s.confirmed_at);
      setOpen(s.enabled);
    }).catch((e) => live && setError(e.message));
    return () => { live = false; };
  }, [api]);

  if (!form) return error ? <Notice tone="warn">{error}</Notice> : null;

  const change = (patch: Partial<SmsIndia>) => { setForm({ ...form, ...patch }); setDone(false); };
  const template = (i: number, patch: Partial<SmsTemplate>) => change({ templates: form.templates.map((t, n) => (n === i ? { ...t, ...patch } : t)) });
  const label: React.CSSProperties = { display: 'block', fontSize: 12, color: 'var(--white)', marginBottom: 5 };
  // the approval was given for one name: another one has to be confirmed again
  const stillConfirmed = confirmed && (!savedName || savedName === form.sender_id);

  async function save() {
    if (!form) return;
    setBusy(true);
    setError('');
    try {
      await api.saveIndia(form, stillConfirmed);
      setSavedName(form.enabled ? form.sender_id : '');
      setDone(true);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ marginTop: 26, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
      <button type="button" style={buttonStyle('ghost')} aria-expanded={open} onClick={() => setOpen((v) => !v)}>India: send from your registered name (DLT)</button>
      {open && (
        <div style={{ marginTop: 14 }}>
          <div style={{ ...note, marginBottom: 12 }}>
            For Indian numbers, Twilio sends domestic texts only from a sender name you registered on an operator's DLT portal and then had Twilio approve
            (Twilio quotes about 10 business days). Without it, texts go the international route and arrive from a random number.
          </div>
          <Notice tone="warn">A sender name cannot receive replies: STOP, automatic answers and the inbox do not work for these texts. Put another way to opt out in your template.</Notice>

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', margin: '12px 0' }}>
            <div style={{ flex: '1 1 160px' }}>
              <label style={label} htmlFor="india-sender">Registered sender name</label>
              <input id="india-sender" style={inputStyle} maxLength={11} value={form.sender_id} onChange={(e) => change({ sender_id: e.target.value.replace(/[^A-Za-z0-9]/g, '') })} />
            </div>
            <div style={{ flex: '1 1 220px' }}>
              <label style={label} htmlFor="india-entity">DLT entity ID (for your records)</label>
              <input id="india-entity" style={inputStyle} inputMode="numeric" maxLength={30} value={form.entity_id} onChange={(e) => change({ entity_id: e.target.value.replace(/\D/g, '') })} />
            </div>
          </div>

          <span style={label}>Registered templates</span>
          <div style={{ ...note, marginBottom: 8 }}>Copy each one exactly as registered, with {'{#var#}'} where something changes (up to 30 characters each). A text to India that matches none of them is not sent.</div>
          {form.templates.map((t, i) => (
            <div key={i} style={{ border: '1px solid var(--border)', borderRadius: 6, padding: 10, marginBottom: 8 }}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                <input aria-label={`Template ${i + 1} name`} placeholder="Name" style={{ ...inputStyle, flex: '1 1 160px' }} maxLength={80} value={t.name} onChange={(e) => template(i, { name: e.target.value })} />
                <input aria-label={`Template ${i + 1} ID`} placeholder="Template ID" inputMode="numeric" style={{ ...inputStyle, flex: '1 1 200px' }} maxLength={30} value={t.template_id} onChange={(e) => template(i, { template_id: e.target.value.replace(/\D/g, '') })} />
                <button type="button" style={buttonStyle('danger')} onClick={() => change({ templates: form.templates.filter((_x, n) => n !== i) })}>Remove</button>
              </div>
              <textarea aria-label={`Template ${i + 1} text`} rows={2} maxLength={480} style={{ ...inputStyle, resize: 'vertical' }} value={t.text} onChange={(e) => template(i, { text: e.target.value })} />
            </div>
          ))}
          <button type="button" style={buttonStyle('ghost', form.templates.length >= 100)} disabled={form.templates.length >= 100} onClick={() => change({ templates: [...form.templates, { ...blank }] })}>Add a template</button>

          <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13, color: 'var(--white)', margin: '14px 0 8px', cursor: 'pointer' }}>
            <input type="checkbox" checked={form.enabled} onChange={(e) => change({ enabled: e.target.checked })} style={{ marginTop: 3 }} />
            <span>Send texts to Indian numbers from this name.</span>
          </label>
          {form.enabled && (
            <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', ...note, marginBottom: 12, cursor: 'pointer' }}>
              <input type="checkbox" checked={stillConfirmed} onChange={(e) => { setConfirmed(e.target.checked); setSavedName(''); }} style={{ marginTop: 3 }} />
              <span>Twilio has approved this sender name on my account.</span>
            </label>
          )}
          {error && <Notice tone="warn">{error}</Notice>}
          {done && <Notice tone="good">Saved.</Notice>}
          <button type="button" style={buttonStyle('primary', busy)} disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save India settings'}</button>
        </div>
      )}
    </div>
  );
}
