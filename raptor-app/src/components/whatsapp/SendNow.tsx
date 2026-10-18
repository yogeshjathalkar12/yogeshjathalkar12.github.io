import { useState } from 'react';
import { fieldInputStyle, primaryBtnStyle } from '../crm/Modal';

export interface SendNowBody {
  account_id: string;
  phone: string;
  text?: string;
  template?: { name: string; language: string; params: string[] };
}

interface Props {
  accountId: string;
  /** Sends it through the server, right away (POST /send-now). Throws an Error with a plain-words message when it cannot. */
  onSend: (body: SendNowBody) => Promise<void>;
}

const noteStyle = { fontSize: '0.72rem', color: 'var(--dim)', lineHeight: 1.6 } as const;
const labelStyle = { display: 'block', fontSize: '0.58rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--dim)', marginBottom: '0.3rem' } as const;
const field = { ...fieldInputStyle, marginBottom: '0.7rem' } as const;
const ghost = { padding: '0.45rem 0.9rem', background: 'transparent', color: 'var(--white)', border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer', fontSize: '0.68rem' } as const;

// "Send a message now": one WhatsApp message, delivered immediately to any number. Nothing is queued and nothing waits for a schedule.
// Free text works only if the person wrote to you in the last 24 hours (Meta's rule); an approved template works at any time.
export default function SendNow({ accountId, onSend }: Props) {
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState('');
  const [mode, setMode] = useState<'text' | 'template'>('text');
  const [text, setText] = useState('');
  const [name, setName] = useState('');
  const [language, setLanguage] = useState('en_US');
  const [params, setParams] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const ready = accountId && phone.replace(/\D/g, '').length >= 8 && (mode === 'text' ? text.trim() : name.trim());

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      await onSend({
        account_id: accountId, phone,
        ...(mode === 'text' ? { text: text.trim() } : { template: { name: name.trim(), language: language.trim() || 'en_US', params: params.map((p) => p.trim()) } }),
      });
      setMessage({ ok: true, text: 'Sent. It was handed to WhatsApp just now.' });
      setText('');
    } catch (err: any) {
      setMessage({ ok: false, text: err.message || 'Could not send the message.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ marginBottom: '1rem', flexShrink: 0 }}>
      <button type="button" style={{ ...ghost, fontSize: '0.7rem' }} onClick={() => { setOpen((o) => !o); setMessage(null); }}>{open ? 'Close' : 'Send a message now'}</button>
      {open && (
        <form onSubmit={submit} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '1rem', marginTop: '0.7rem', background: 'var(--surface)', maxWidth: 640 }}>
          <div style={{ ...noteStyle, marginBottom: '0.8rem' }}>
            Delivered immediately: nothing is queued or scheduled. People who opted out are never messaged.
          </div>
          <label style={labelStyle}>Phone number, with country code</label>
          <input style={field} inputMode="tel" placeholder="919876543210" value={phone} onChange={(e) => setPhone(e.target.value)} />
          <label style={labelStyle}>What to send</label>
          <select style={field} value={mode} onChange={(e) => setMode(e.target.value as 'text' | 'template')}>
            <option value="text">A text message (only if they wrote to you in the last 24 hours)</option>
            <option value="template">An approved template (works any time)</option>
          </select>
          {mode === 'text' ? (
            <>
              <label style={labelStyle}>Message</label>
              <textarea style={{ ...field, minHeight: 90, resize: 'vertical' }} maxLength={4096} value={text} onChange={(e) => setText(e.target.value)} />
            </>
          ) : (
            <>
              <label style={labelStyle}>Template name, exactly as in WhatsApp Manager</label>
              <input style={field} placeholder="order_ready" value={name} onChange={(e) => setName(e.target.value)} />
              <label style={labelStyle}>Language</label>
              <input style={{ ...field, maxWidth: 160 }} placeholder="en_US" value={language} onChange={(e) => setLanguage(e.target.value)} />
              <label style={labelStyle}>Variables, in order ({'{{1}}'}, {'{{2}}'}...)</label>
              {params.map((p, i) => (
                <div key={i} style={{ display: 'flex', gap: 6 }}>
                  <input style={field} placeholder={`Value for {{${i + 1}}}`} value={p} onChange={(e) => setParams(params.map((x, j) => (j === i ? e.target.value : x)))} />
                  <button type="button" style={{ ...ghost, alignSelf: 'flex-start', marginTop: 2 }} onClick={() => setParams(params.filter((_, j) => j !== i))}>Remove</button>
                </div>
              ))}
              {params.length < 10 && <button type="button" style={{ ...ghost, marginBottom: '0.8rem' }} onClick={() => setParams([...params, ''])}>Add a variable</button>}
            </>
          )}
          {message && <div style={{ ...noteStyle, marginBottom: '0.7rem', color: message.ok ? 'var(--green, #3ecf8e)' : 'var(--red, #ef5350)' }}>{message.text}</div>}
          <button type="submit" style={{ ...primaryBtnStyle, flex: 'none', padding: '0.6rem 1.2rem', opacity: ready && !busy ? 1 : 0.55 }} disabled={!ready || busy}>{busy ? 'Sending…' : 'Send now'}</button>
        </form>
      )}
    </div>
  );
}
