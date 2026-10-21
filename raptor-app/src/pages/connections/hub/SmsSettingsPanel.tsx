import { useEffect, useState } from 'react';
import type { SmsApi, SmsNumber, SmsSequence, SmsSettings } from './smsApi';
import { DEFAULT_SETTINGS, TAGS, TIME_ZONES, characters } from './smsApi';
import { Notice, buttonStyle, inputStyle, note } from './ui';

// The SMS settings: how the pipeline texts (Off / Semi-automatic / Automatic), the first text, the sending hours and the daily limit.
// Used in two places: the SMS tab under Channels, and the SMS button's dialog on the CRM pipeline. Only the owner or an admin can save
// (the database function checks that); everyone else sees the settings read-only by getting an error message on save.

const MODES: { value: SmsSettings['mode']; title: string; text: string }[] = [
  { value: 'off', title: 'Off', text: 'The pipeline sends nothing. Sequences you start by hand, replies and auto-answers still work.' },
  { value: 'semi', title: 'Semi-automatic', text: 'Each deal with a contact gets an SMS button next to Call. Nothing is sent until you click it.' },
  { value: 'auto', title: 'Automatic', text: 'The first text goes out as soon as a new deal with a contact phone number is added. Bulk imports are never texted automatically.' },
];

const hours = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_v, i) => from + i);
const hourLabel = (h: number) => (h === 24 ? '12 midnight' : h === 0 ? '12 midnight' : h === 12 ? '12 noon' : h < 12 ? `${h} am` : `${h - 12} pm`);

export default function SmsSettingsPanel({ api, onSaved, onCancel }: { api: SmsApi; onSaved?: () => void; onCancel?: () => void }) {
  const [settings, setSettings] = useState<SmsSettings>(DEFAULT_SETTINGS);
  const [numbers, setNumbers] = useState<SmsNumber[]>([]);
  const [sequences, setSequences] = useState<SmsSequence[]>([]);
  const [optIn, setOptIn] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let live = true;
    Promise.all([api.settings(), api.numbers(), api.sequences()])
      .then(([s, n, q]) => {
        if (!live) return;
        setSettings({ ...s, connection_id: s.connection_id || (n[0] ? n[0].id : null) });
        setOptIn(!!s.opt_in_confirmed_at);
        setNumbers(n);
        setSequences(q);
      })
      .catch((err) => live && setError(err.message))
      .finally(() => live && setLoading(false));
    return () => { live = false; };
  }, [api]);

  const set = <K extends keyof SmsSettings>(key: K, value: SmsSettings[K]) => { setSettings((s) => ({ ...s, [key]: value })); setSaved(false); };

  async function save() {
    setError(null);
    if (settings.mode !== 'off' && !optIn) {
      setError('Please confirm that your contacts agreed to receive text messages from you.');
      return;
    }
    setSaving(true);
    try {
      await api.saveSettings(settings, optIn);
      setSaved(true);
      if (onSaved) onSaved();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div style={note}>Loading…</div>;
  const field: React.CSSProperties = { marginBottom: 14 };
  const label: React.CSSProperties = { display: 'block', fontSize: 12, color: 'var(--white)', marginBottom: 5 };

  return (
    <div style={{ maxWidth: 620 }}>
      <div style={{ ...field }}>
        <span style={label}>When should the pipeline text?</span>
        {MODES.map((m) => (
          <label key={m.value} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer', padding: '9px 11px', borderRadius: 6, marginBottom: 6,
            border: `1px solid ${settings.mode === m.value ? 'var(--purple, #8b5cf6)' : 'var(--border)'}`, background: settings.mode === m.value ? 'rgba(139,92,246,0.08)' : 'transparent' }}>
            <input type="radio" name="sms-mode" checked={settings.mode === m.value} onChange={() => set('mode', m.value)} style={{ marginTop: 3 }} />
            <span><span style={{ fontSize: 13, color: 'var(--white)' }}>{m.title}</span><span style={{ ...note, display: 'block' }}>{m.text}</span></span>
          </label>
        ))}
      </div>

      <div style={field}>
        <label style={label} htmlFor="sms-number">Send from this Twilio number</label>
        {numbers.length === 0 ? (
          <Notice tone="warn">No Twilio number is connected yet. Connect one on the SMS tab under Channels, then come back.</Notice>
        ) : (
          <select id="sms-number" style={inputStyle} value={settings.connection_id || ''} onChange={(e) => set('connection_id', e.target.value || null)}>
            {numbers.map((n) => <option key={n.id} value={n.id}>{n.label}{n.status !== 'connected' ? ` (${n.status})` : ''}</option>)}
          </select>
        )}
      </div>

      <div style={field}>
        <label style={label} htmlFor="sms-template">The first text</label>
        <textarea id="sms-template" rows={4} style={{ ...inputStyle, resize: 'vertical' }} value={settings.template} maxLength={480}
          placeholder="Hi {{first_name}}, this is Asha from Acme. Saw {{company}} is growing. Open to a quick chat this week?"
          onChange={(e) => set('template', e.target.value)} />
        <div style={note}>{characters(settings.template)}. Tags filled in for each person: {TAGS.map((t) => `{{${t}}}`).join('  ')}. Start with who you are, and keep it short.</div>
      </div>

      <div style={field}>
        <label style={label} htmlFor="sms-seq">After the first text, follow up with</label>
        <select id="sms-seq" style={inputStyle} value={settings.sequence_id || ''} onChange={(e) => set('sequence_id', e.target.value || null)}>
          <option value="">No follow-ups</option>
          {sequences.filter((q) => q.is_active).map((q) => <option key={q.id} value={q.id}>{q.name} ({q.steps.length} text{q.steps.length === 1 ? '' : 's'})</option>)}
        </select>
        <div style={note}>A follow-up stops by itself the moment the person answers or opts out.</div>
      </div>

      <div style={{ ...field, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 140px' }}>
          <label style={label} htmlFor="sms-from">Send texts from</label>
          <select id="sms-from" style={inputStyle} value={settings.send_from_hour} onChange={(e) => set('send_from_hour', Number(e.target.value))}>
            {hours(0, 23).map((h) => <option key={h} value={h}>{hourLabel(h)}</option>)}
          </select>
        </div>
        <div style={{ flex: '1 1 140px' }}>
          <label style={label} htmlFor="sms-until">until</label>
          <select id="sms-until" style={inputStyle} value={settings.send_until_hour} onChange={(e) => set('send_until_hour', Number(e.target.value))}>
            {hours(1, 24).map((h) => <option key={h} value={h}>{hourLabel(h)}</option>)}
          </select>
        </div>
        <div style={{ flex: '1 1 180px' }}>
          <label style={label} htmlFor="sms-zone">Time zone</label>
          <select id="sms-zone" style={inputStyle} value={settings.timezone} onChange={(e) => set('timezone', e.target.value)}>
            {(TIME_ZONES.includes(settings.timezone) ? TIME_ZONES : [settings.timezone, ...TIME_ZONES]).map((z) => <option key={z} value={z}>{z}</option>)}
          </select>
        </div>
      </div>
      <div style={{ ...note, marginTop: -6, marginBottom: 14 }}>Texts that Raptor starts wait for these hours (in India, promotional texts are allowed 9 am to 9 pm). A reply to someone who just wrote to you is not held back.</div>

      <div style={{ ...field, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 140px' }}>
          <label style={label} htmlFor="sms-limit">Most texts per day</label>
          <input id="sms-limit" type="number" min={1} max={200} style={inputStyle} value={settings.daily_limit} onChange={(e) => set('daily_limit', Math.max(1, Math.min(200, Number(e.target.value) || 1)))} />
        </div>
        <div style={{ flex: '1 1 140px' }}>
          <label style={label} htmlFor="sms-cc">Country code for 10-digit numbers</label>
          <input id="sms-cc" style={inputStyle} inputMode="numeric" maxLength={3} value={settings.country_code} onChange={(e) => set('country_code', e.target.value.replace(/\D/g, ''))} />
        </div>
      </div>

      <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13, color: 'var(--white)', marginBottom: 8, cursor: 'pointer' }}>
        <input type="checkbox" checked={settings.autoreply_enabled} onChange={(e) => set('autoreply_enabled', e.target.checked)} style={{ marginTop: 3 }} />
        <span>Answer incoming texts with my auto-reply rules.</span>
      </label>

      <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', ...note, marginBottom: 14, cursor: 'pointer' }}>
        <input type="checkbox" checked={optIn} onChange={(e) => { setOptIn(e.target.checked); setSaved(false); }} style={{ marginTop: 3 }} />
        <span>
          My contacts agreed to receive text messages from me. I am responsible for who I text, and in India for registering my sender and templates (DLT).
          {settings.opt_in_confirmed_at ? <span style={{ display: 'block' }}>Confirmed on {new Date(settings.opt_in_confirmed_at).toLocaleDateString()}.</span> : null}
        </span>
      </label>

      <div style={{ ...note, marginBottom: 14 }}>
        Texts go to one person at a time, never to a list. Nobody is texted twice within 30 days by automatic mode, a person who replies STOP is never texted again, and Raptor pauses at your daily limit.
      </div>

      {error ? <Notice tone="warn">{error}</Notice> : null}
      {saved ? <Notice tone="good">Saved.</Notice> : null}
      <div style={{ display: 'flex', gap: 8 }}>
        {onCancel ? <button type="button" style={buttonStyle('ghost')} onClick={onCancel}>Close</button> : null}
        <button type="button" style={buttonStyle('primary', saving)} disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save settings'}</button>
      </div>
    </div>
  );
}
