import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import Modal, { fieldLabelStyle, fieldInputStyle, primaryBtnStyle, ghostBtnStyle, toolBtnStyle, toolPrimaryStyle } from '../../components/crm/Modal';
import { useOrg } from '../../hooks/OrgContext';
import { useDirectory } from '../../hooks/useDirectory';
import { shortName } from '../../lib/team';
import { isNotInstalled } from '../../lib/dbMissing';
import { type LeadForm, type LeadFormDraft, NEW_FORM, embedCode, formLink, formProblem, formRow } from '../../lib/leadForms';

// CRM > Web forms: forms a customer puts on their website. What visitors send becomes a contact with a follow-up task
// (db/migrations/2026-11-28_a_lead_forms.sql).

interface Submission { id: string; form_id: string; contact_id: string | null; data: Record<string, string>; problem: string | null; created_at: string; }

const card: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, padding: '1.1rem 1.3rem' };
const small: React.CSSProperties = { fontSize: '0.65rem', color: 'var(--dim)', lineHeight: 1.6 };
const check: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.7rem', marginBottom: 8 };

export default function CrmForms() {
  const { isOwner, can } = useOrg();
  const manage = isOwner || can('manage_automations');
  const { entries } = useDirectory();
  const [forms, setForms] = useState<LeadForm[]>([]);
  const [received, setReceived] = useState<Submission[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading');
  const [message, setMessage] = useState('');
  const [editing, setEditing] = useState<{ id: string | null; draft: LeadFormDraft } | null>(null);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [copied, setCopied] = useState('');

  async function load() {
    const [f, s] = await Promise.all([
      supabase.from('lead_forms').select('*').order('created_at', { ascending: false }),
      supabase.from('lead_form_submissions').select('*').order('created_at', { ascending: false }).limit(50),
    ]);
    if (f.error) {
      setState(isNotInstalled(f.error) ? 'missing' : 'error');
      setMessage(f.error.message);
      return;
    }
    setForms((f.data || []) as LeadForm[]);
    setReceived((s.data || []) as Submission[]);
    setState('ready');
  }
  useEffect(() => { load(); }, []);

  const set = (patch: Partial<LeadFormDraft>) => setEditing((e) => (e ? { ...e, draft: { ...e.draft, ...patch } } : e));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    const wrong = formProblem(editing.draft);
    if (wrong) { setProblem(wrong); return; }
    setSaving(true);
    setProblem(null);
    const row = formRow(editing.draft);
    const { error } = editing.id
      ? await supabase.from('lead_forms').update(row).eq('id', editing.id)
      : await supabase.from('lead_forms').insert(row);
    setSaving(false);
    if (error) { setProblem(error.message); return; }
    setEditing(null);
    load();
  }

  async function remove(id: string) {
    if (!confirm('Delete this form? It stops working on your website. Contacts it brought in are kept.')) return;
    const { error } = await supabase.from('lead_forms').delete().eq('id', id);
    if (error) { setProblem(error.message); return; }
    setEditing(null);
    load();
  }

  async function copy(key: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
    } catch {
      window.prompt('Copy this:', text);
    }
  }

  if (state === 'loading') return <div style={small}>Loading forms…</div>;
  if (state === 'missing') return <div style={card}><div style={small}>Web forms need a database update first: run <b>2026-11-28_a_lead_forms.sql</b> in Supabase.</div></div>;
  if (state === 'error') return <div style={card}><div style={{ ...small, color: 'var(--red)' }}>Could not load the forms: {message}</div></div>;

  const formName = (id: string) => forms.find((f) => f.id === id)?.name || 'A deleted form';
  const d = editing?.draft;

  return (
    <div style={{ overflowY: 'auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', marginBottom: '1.2rem' }}>
        <div style={{ ...small, maxWidth: 560 }}>
          Put a form on your website. Each message becomes a contact (or a note on the one with that email) and a follow-up task.
          No deal is created and nothing is sent to the visitor.
        </div>
        {manage && <button style={{ ...toolPrimaryStyle, alignSelf: 'flex-start' }} onClick={() => { setProblem(null); setEditing({ id: null, draft: { ...NEW_FORM } }); }}>+ New form</button>}
      </div>

      {forms.length === 0 && <div style={{ ...card, textAlign: 'center' }}><div style={small}>No forms yet.</div></div>}
      <div style={{ display: 'grid', gap: '0.8rem' }}>
        {forms.map((f) => (
          <div key={f.id} style={{ ...card, opacity: f.enabled ? 1 : 0.6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: '0.85rem', color: 'var(--white)' }}>{f.name}</div>
                <div style={small}>{f.enabled ? 'On' : 'Off'} · {f.title || 'No heading'}</div>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <a style={toolBtnStyle} href={formLink(f.token)} target="_blank" rel="noopener noreferrer">Open</a>
                <button style={toolBtnStyle} onClick={() => copy(`link-${f.id}`, formLink(f.token))}>{copied === `link-${f.id}` ? 'Copied' : 'Copy link'}</button>
                <button style={toolBtnStyle} onClick={() => copy(`code-${f.id}`, embedCode(f))}>{copied === `code-${f.id}` ? 'Copied' : 'Copy website code'}</button>
                {manage && <button style={toolBtnStyle} onClick={() => { setProblem(null); setEditing({ id: f.id, draft: { ...f } }); }}>Edit</button>}
              </div>
            </div>
          </div>
        ))}
      </div>

      {received.length > 0 && (
        <div style={{ ...card, marginTop: '1.2rem', overflowX: 'auto' }}>
          <div style={{ ...fieldLabelStyle, marginBottom: 10 }}>Latest messages</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.68rem' }}>
            <tbody>
              {received.map((s) => (
                <tr key={s.id} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '0.5rem 0.4rem', color: 'var(--dim)', whiteSpace: 'nowrap' }}>{new Date(s.created_at).toLocaleString()}</td>
                  <td style={{ padding: '0.5rem 0.4rem', color: 'var(--dim)' }}>{formName(s.form_id)}</td>
                  <td style={{ padding: '0.5rem 0.4rem' }}>
                    {s.contact_id ? <a style={{ color: 'var(--purple)' }} href={`#/crm/contacts?open=${s.contact_id}`}>{s.data.name}</a> : s.data.name}
                    <div style={{ color: 'var(--dim)' }}>{s.data.email}{s.data.phone ? ` · ${s.data.phone}` : ''}</div>
                    {s.problem && <div style={{ color: 'var(--red)' }}>Not added to contacts: {s.problem}</div>}
                  </td>
                  <td style={{ padding: '0.5rem 0.4rem', color: 'var(--dim)', maxWidth: 360 }}>{s.data.message || ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing?.id ? 'Edit form' : 'New form'} width={520}>
        {d && (
          <form onSubmit={save}>
            <label style={fieldLabelStyle}>Name (only your team sees it)</label>
            <input style={fieldInputStyle} value={d.name} maxLength={80} onChange={(e) => set({ name: e.target.value })} />
            <label style={fieldLabelStyle}>Heading</label>
            <input style={fieldInputStyle} value={d.title} maxLength={120} onChange={(e) => set({ title: e.target.value })} />
            <label style={fieldLabelStyle}>Introduction (optional)</label>
            <textarea style={{ ...fieldInputStyle, minHeight: 56 }} value={d.intro} maxLength={500} onChange={(e) => set({ intro: e.target.value })} />
            <div style={{ ...fieldLabelStyle, marginBottom: 8 }}>Name and email are always asked. Also ask for:</div>
            <label style={check}><input type="checkbox" checked={d.ask_company} onChange={(e) => set({ ask_company: e.target.checked })} /> Company</label>
            <label style={check}><input type="checkbox" checked={d.ask_phone} onChange={(e) => set({ ask_phone: e.target.checked })} /> Phone</label>
            {d.ask_phone && <label style={{ ...check, marginLeft: 24 }}><input type="checkbox" checked={d.require_phone} onChange={(e) => set({ require_phone: e.target.checked })} /> Phone is required</label>}
            <label style={check}><input type="checkbox" checked={d.ask_message} onChange={(e) => set({ ask_message: e.target.checked })} /> Message</label>
            <label style={fieldLabelStyle}>Button text</label>
            <input style={fieldInputStyle} value={d.button_text} maxLength={40} onChange={(e) => set({ button_text: e.target.value })} />
            <label style={fieldLabelStyle}>Shown after sending</label>
            <input style={fieldInputStyle} value={d.thanks_text} maxLength={300} onChange={(e) => set({ thanks_text: e.target.value })} />
            <label style={fieldLabelStyle}>Who follows up</label>
            <select style={fieldInputStyle} value={d.assignee_id || ''} onChange={(e) => set({ assignee_id: e.target.value || null })}>
              <option value="">The organization owner</option>
              {entries.map((m) => <option key={m.user_id} value={m.user_id}>{shortName(m.email)}</option>)}
            </select>
            <label style={check}><input type="checkbox" checked={d.enabled} onChange={(e) => set({ enabled: e.target.checked })} /> The form is on</label>
            {problem && <div style={{ ...small, color: 'var(--red)', marginBottom: 10 }}>{problem}</div>}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              {editing?.id && <button type="button" style={{ ...ghostBtnStyle, color: 'var(--red)', marginRight: 'auto' }} onClick={() => remove(editing.id as string)}>Delete</button>}
              <button type="button" style={ghostBtnStyle} onClick={() => setEditing(null)}>Cancel</button>
              <button type="submit" style={{ ...primaryBtnStyle, width: 'auto' }} disabled={saving}>{saving ? 'Saving…' : 'Save form'}</button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
