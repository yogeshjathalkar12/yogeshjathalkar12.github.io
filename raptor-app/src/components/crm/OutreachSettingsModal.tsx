import { useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import Modal, { fieldInputStyle, fieldLabelStyle, ghostBtnStyle, primaryBtnStyle } from './Modal';

// Email mode and template for the pipeline. Stored per organization (crm_outreach_settings) and changed only through
// crm_outreach_save, which lets just the owner or an admin do it. What each mode does, and the safeguards, are in
// db/migrations/2026-10-14_crm_outreach.sql. The email itself is sent by the user's desktop app (the relay).

export type OutreachMode = 'off' | 'semi' | 'auto';

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

const TAGS = ['first_name', 'last_name', 'name', 'company', 'deal_title'];
const SAMPLE: Record<string, string> = { first_name: 'Priya', last_name: 'Sharma', name: 'Priya Sharma', company: 'Acme Pvt Ltd', deal_title: 'Website revamp' };

const DEFAULT_SUBJECT = 'Quick question, {{first_name}}';
const DEFAULT_BODY = 'Hi {{first_name}},\n\nI came across {{company}} and thought what we do could be a good fit.\n\nWould you be open to a short call this week?\n\nThanks';

const MODES: { value: OutreachMode; title: string; text: string }[] = [
  { value: 'off', title: 'Off', text: 'Nothing is sent.' },
  { value: 'semi', title: 'Semi-automatic', text: 'Each deal with a contact gets an Email button next to Call. Nothing is sent until you click it.' },
  { value: 'auto', title: 'Automatic', text: 'The email goes out as soon as a new deal with a contact email is added. Bulk imports are never emailed automatically.' },
];

function fill(text: string): string {
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, key: string) => SAMPLE[key] ?? '');
}

export default function OutreachSettingsModal({ open, onClose, onSaved }: Props) {
  const [mode, setMode] = useState<OutreachMode>('off');
  const [subject, setSubject] = useState(DEFAULT_SUBJECT);
  const [body, setBody] = useState(DEFAULT_BODY);
  const [understood, setUnderstood] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setUnderstood(false);
    setLoading(true);
    supabase
      .from('crm_outreach_settings')
      .select('mode, subject, body')
      .maybeSingle()
      .then(({ data, error: err }) => {
        if (err) { setError('Email automation is not available yet: the database part still has to be installed.'); return; }
        if (data) {
          setMode(data.mode as OutreachMode);
          setSubject(data.subject);
          setBody(data.body);
        }
      })
      .then(() => setLoading(false), () => setLoading(false));
  }, [open]);

  function insertTag(tag: string) {
    const el = bodyRef.current;
    const token = `{{${tag}}}`;
    if (!el) { setBody((b) => b + token); return; }
    const start = el.selectionStart ?? body.length;
    const end = el.selectionEnd ?? body.length;
    setBody(body.slice(0, start) + token + body.slice(end));
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(start + token.length, start + token.length); });
  }

  async function save() {
    setError(null);
    if (mode === 'auto' && !understood) {
      setError('Please confirm that new deals will be emailed automatically.');
      return;
    }
    setSaving(true);
    const { error: err } = await supabase.rpc('crm_outreach_save', { p_mode: mode, p_subject: subject, p_body: body });
    setSaving(false);
    if (err) { setError(err.message); return; }
    onSaved();
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title="Email automation" width={560}>
      {loading ? (
        <div style={{ color: 'var(--dim)', fontSize: '0.7rem' }}>Loading…</div>
      ) : (
        <>
          <label style={fieldLabelStyle}>Mode</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1.2rem' }}>
            {MODES.map((m) => (
              <label
                key={m.value}
                style={{
                  display: 'flex', gap: '0.6rem', alignItems: 'flex-start', cursor: 'pointer', padding: '0.7rem 0.8rem', borderRadius: 4,
                  border: `1px solid ${mode === m.value ? 'var(--purple)' : 'var(--border)'}`,
                  background: mode === m.value ? 'rgba(168,85,247,0.08)' : 'transparent',
                }}
              >
                <input type="radio" name="outreach-mode" checked={mode === m.value} onChange={() => setMode(m.value)} style={{ marginTop: 3 }} />
                <span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--white)' }}>{m.title}</span>
                  <span style={{ display: 'block', fontSize: '0.62rem', color: 'var(--dim)', lineHeight: 1.6 }}>{m.text}</span>
                </span>
              </label>
            ))}
          </div>

          {mode !== 'off' && (
            <>
              <label style={fieldLabelStyle}>Subject</label>
              <input style={fieldInputStyle} value={subject} maxLength={200} onChange={(e) => setSubject(e.target.value)} />

              <label style={fieldLabelStyle}>Message</label>
              <textarea ref={bodyRef} style={{ ...fieldInputStyle, minHeight: 150, resize: 'vertical' }} value={body} maxLength={5000} onChange={(e) => setBody(e.target.value)} />
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', alignItems: 'center', margin: '-0.5rem 0 1rem' }}>
                <span style={{ fontSize: '0.58rem', color: 'var(--dim)' }}>Insert:</span>
                {TAGS.map((t) => (
                  <button key={t} type="button" onClick={() => insertTag(t)} style={{ ...ghostBtnStyle, flex: 'none', padding: '0.2rem 0.5rem', fontSize: '0.58rem', textTransform: 'none', letterSpacing: 0 }}>
                    {`{{${t}}}`}
                  </button>
                ))}
              </div>

              <div style={{ border: '1px dashed var(--border)', borderRadius: 4, padding: '0.8rem', marginBottom: '1rem' }}>
                <div style={{ fontSize: '0.55rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--dim)', marginBottom: '0.4rem' }}>Preview</div>
                <div style={{ fontSize: '0.7rem', color: 'var(--white)', marginBottom: '0.4rem' }}>{fill(subject)}</div>
                <div style={{ fontSize: '0.65rem', color: 'var(--dim)', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{fill(body)}</div>
              </div>

              <div style={{ fontSize: '0.6rem', color: 'var(--dim)', lineHeight: 1.7, marginBottom: '1rem' }}>
                Your Raptor desktop app sends it from the mailbox connected there, at that mailbox's own daily limit and opening hours. Keep the app open and signed in: mail not sent within 48 hours expires instead of going out late.
                Nobody is emailed twice within 30 days.
              </div>
            </>
          )}

          {mode === 'auto' && (
            <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start', fontSize: '0.62rem', color: 'var(--dim)', lineHeight: 1.6, marginBottom: '1rem', cursor: 'pointer' }}>
              <input type="checkbox" checked={understood} onChange={(e) => setUnderstood(e.target.checked)} style={{ marginTop: 2 }} />
              <span>I understand that every new deal with a contact email will be emailed automatically from my mailbox, and that I am responsible for who I email.</span>
            </label>
          )}

          {error && <div style={{ color: 'var(--red)', fontSize: '0.65rem', marginBottom: '0.8rem' }}>{error}</div>}
          <div style={{ display: 'flex', gap: '0.6rem' }}>
            <button type="button" style={ghostBtnStyle} onClick={onClose}>Cancel</button>
            <button type="button" style={primaryBtnStyle} disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save'}</button>
          </div>
        </>
      )}
    </Modal>
  );
}
