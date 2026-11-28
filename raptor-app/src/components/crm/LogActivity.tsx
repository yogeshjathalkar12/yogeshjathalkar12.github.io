// Writing down a note, call, meeting or message by hand against a contact (the CRM's Activity page).
import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { selectAll } from '../../lib/selectAll';

export const LOG_TYPES = ['note', 'call', 'meeting', 'email', 'whatsapp'];
const field = { width: '100%', padding: '0.55rem 0.7rem', background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--white)', fontFamily: 'var(--mono)', fontSize: '0.7rem', borderRadius: 4 } as const;
const label = { display: 'block', fontSize: '0.55rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--dim)', margin: '0.7rem 0 0.3rem' } as const;

export default function LogActivity({ onLogged, onClose }: { onLogged: () => void; onClose: () => void }) {
  const [contacts, setContacts] = useState<any[]>([]);
  const [contactId, setContactId] = useState('');
  const [type, setType] = useState('note');
  const [direction, setDirection] = useState('');
  const [content, setContent] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    let alive = true;
    selectAll(() => supabase.from('contacts').select('id, name').order('name', { ascending: true }))
      .then(({ data, error }: any) => {
        if (!alive) return;
        if (error) setMessage({ ok: false, text: 'Could not load your contacts.' });
        else setContacts(data || []);
      });
    return () => { alive = false; };
  }, []);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!contactId || !content.trim()) { setMessage({ ok: false, text: 'Choose a contact and write what happened.' }); return; }
    setBusy(true);
    setMessage(null);
    try {
      const { error } = await supabase.from('interactions').insert({ contact_id: contactId, type, content: content.trim(), direction: direction || null });
      if (error) throw error;
      await supabase.from('contacts').update({ last_interaction_at: new Date().toISOString() }).eq('id', contactId);
      setContent('');
      setMessage({ ok: true, text: 'Logged.' });
      onLogged();
    } catch (err: any) {
      setMessage({ ok: false, text: err.message || 'Could not log this.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, padding: '1.1rem 1.4rem', marginBottom: '1.4rem' }}>
      <div style={{ display: 'flex', gap: '0.8rem', flexWrap: 'wrap' }}>
        <div style={{ flex: 2, minWidth: 200 }}>
          <label style={label} htmlFor="log-contact">Contact</label>
          <select id="log-contact" style={field} value={contactId} onChange={(e) => setContactId(e.target.value)} required>
            <option value="">Choose…</option>
            {contacts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div style={{ flex: 1, minWidth: 120 }}>
          <label style={label} htmlFor="log-type">Type</label>
          <select id="log-type" style={field} value={type} onChange={(e) => setType(e.target.value)}>
            {LOG_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div style={{ flex: 1, minWidth: 120 }}>
          <label style={label} htmlFor="log-direction">Direction (optional)</label>
          <select id="log-direction" style={field} value={direction} onChange={(e) => setDirection(e.target.value)}>
            <option value="">not said</option>
            <option value="inbound">inbound</option>
            <option value="outbound">outbound</option>
          </select>
        </div>
      </div>
      <label style={label} htmlFor="log-content">What happened</label>
      <textarea id="log-content" style={field} rows={3} value={content} onChange={(e) => setContent(e.target.value)} required />
      {message && <div role={message.ok ? 'status' : 'alert'} style={{ fontSize: '0.65rem', color: message.ok ? 'var(--green)' : 'var(--red)', marginTop: '0.6rem' }}>{message.text}</div>}
      <div style={{ display: 'flex', gap: '0.6rem', marginTop: '0.8rem' }}>
        <button type="submit" disabled={busy} style={{ background: 'var(--grad)', color: '#fff', border: 'none', padding: '0.55rem 1.1rem', borderRadius: 4, cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{busy ? 'Logging…' : 'Log it'}</button>
        <button type="button" onClick={onClose} style={{ background: 'transparent', color: 'var(--dim)', border: '1px solid var(--border)', padding: '0.55rem 1.1rem', borderRadius: 4, cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Close</button>
      </div>
    </form>
  );
}
