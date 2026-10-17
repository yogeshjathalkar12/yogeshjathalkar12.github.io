import { useState } from 'react';
import { fieldInputStyle, primaryBtnStyle } from './crm/Modal';

interface Props {
  /** Saves the current work as a team template. May return a short note to show (for example what could not be kept). */
  onSave: (name: string, description: string) => Promise<string | void>;
  defaultName?: string;
  /** A reason the button is switched off (nothing to save yet, or this kind cannot be saved). */
  disabledReason?: string;
  label?: string;
}

const noteStyle = { fontSize: '0.72rem', color: 'var(--dim)', lineHeight: 1.6 } as const;
const ghost = { padding: '0.45rem 0.9rem', background: 'transparent', color: 'var(--white)', border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer', fontSize: '0.68rem' } as const;

// "Save as team template": asks for a name and a one-line description, then saves what is on screen so everyone in the
// organization finds it under "My templates". Shown only to people who may create records.
export default function SaveAsTemplate({ onSave, defaultName = '', disabledReason, label = 'Save as team template' }: Props) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(defaultName);
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    e.stopPropagation();
    setBusy(true);
    setMessage(null);
    try {
      const note = await onSave(name, description);
      setMessage({ ok: true, text: `Saved. Everyone in your organization finds it under “My templates”.${note ? ` ${note}` : ''}` });
      setOpen(false);
      setName(defaultName);
      setDescription('');
    } catch (err: any) {
      setMessage({ ok: false, text: err.message || 'Could not save the template.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ margin: '0.4rem 0' }}>
      {!open && (
        <button type="button" style={{ ...ghost, opacity: disabledReason ? 0.5 : 1 }} disabled={!!disabledReason} onClick={() => { setOpen(true); setMessage(null); if (!name) setName(defaultName); }}>
          {label}
        </button>
      )}
      {disabledReason && !open && <span style={{ ...noteStyle, marginLeft: 8 }}>{disabledReason}</span>}
      {open && (
        <div style={{ border: '1px solid var(--border)', borderRadius: 6, padding: '0.8rem', maxWidth: 520 }}>
          <input style={{ ...fieldInputStyle, marginBottom: '0.5rem' }} placeholder="Template name" maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />
          <input style={{ ...fieldInputStyle, marginBottom: '0.6rem' }} placeholder="When to use it (one line, optional)" maxLength={300} value={description} onChange={(e) => setDescription(e.target.value)} />
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button type="button" style={{ ...primaryBtnStyle, flex: 'none', padding: '0.5rem 1rem' }} disabled={busy || !name.trim()} onClick={submit}>{busy ? 'Saving…' : 'Save template'}</button>
            <button type="button" style={ghost} disabled={busy} onClick={() => setOpen(false)}>Cancel</button>
          </div>
        </div>
      )}
      {message && <div style={{ ...noteStyle, marginTop: 6, color: message.ok ? 'var(--green, #3ecf8e)' : 'var(--red, #ef5350)' }}>{message.text}</div>}
    </div>
  );
}
