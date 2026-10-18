import { useState } from 'react';
import { fieldInputStyle, primaryBtnStyle } from './crm/Modal';
import { blocksToEditable, editableToBlocks, replyContent, validateTemplate } from '../lib/savedTemplates';
import type { SavedKind } from '../lib/savedTemplates';

// The template editor: change a template, start from a copy of a built-in one, or write a new one from nothing.
//   * a team template  -> "Save changes" (everyone in the organization sees the new version) or "Save as a new template"
//   * a built-in one   -> "Save as my template": the built-in stays as it is, the copy appears under "My templates"
//   * a blank one      -> "Save as my template"
// It edits the same content the database stores (see savedTemplates.ts), so what is saved here works exactly like a template saved from
// a form. It is used by the email and WhatsApp template pickers, in the web app and on the desktop.

export interface EditorSpec {
  kind: SavedKind;
  name: string;
  description: string;
  content: any;
  /** Set when a team template is being changed: its database id. Absent for a built-in or a new one. */
  savedId?: string;
  /** What the panel is called. */
  title?: string;
}
export type SaveMode = 'update' | 'create';
export interface SaveInput { kind: SavedKind; name: string; description: string; content: any }

interface Props {
  spec: EditorSpec;
  canCreate: boolean;
  canEdit: boolean;
  onSave: (input: SaveInput, mode: SaveMode, savedId?: string) => Promise<void>;
  onClose: () => void;
}

const field = { ...fieldInputStyle, marginBottom: '0.7rem' } as const;
const area = { ...field, minHeight: 110, resize: 'vertical', lineHeight: 1.55 } as const;
const label = { display: 'block', fontSize: '0.58rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--dim)', marginBottom: '0.3rem' } as const;
const note = { fontSize: '0.72rem', color: 'var(--dim)', lineHeight: 1.6 } as const;
const ghost = { padding: '0.5rem 0.9rem', background: 'transparent', color: 'var(--white)', border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer', fontSize: '0.68rem' } as const;
const tiny = { ...ghost, padding: '0.25rem 0.6rem', fontSize: '0.62rem' } as const;

interface StepDraft { delay_hours: string; subject: string; text: string }
interface Draft {
  subject: string; text: string; steps: StepDraft[];
  keyword: string; match_type: string; reply_kind: string; body: string; buttons: string[]; button_label: string; rows: { title: string; description: string }[];
  prompt: string; entry_keyword: string;
}

function startDraft(kind: SavedKind, c: any): Draft {
  const content = c || {};
  return {
    subject: content.subject || '',
    text: blocksToEditable(content.blocks || []),
    steps: (content.steps || [{ delay_hours: 0, subject: '', blocks: [] }]).map((s: any) => ({ delay_hours: String(s.delay_hours ?? 0), subject: s.subject || '', text: blocksToEditable(s.blocks || []) })),
    keyword: content.keyword || '', match_type: content.match_type || 'contains', reply_kind: content.reply_kind || 'text',
    body: content.body || '', buttons: content.buttons && content.buttons.length ? [...content.buttons] : [''], button_label: content.button_label || 'View options',
    rows: content.rows && content.rows.length ? content.rows.map((r: any) => ({ title: r.title, description: r.description || '' })) : [{ title: '', description: '' }],
    prompt: content.prompt || '', entry_keyword: content.entry_keyword || '',
    // text of a plain-text reply lives in `text` for replies and `text` for emails: keep the reply's own
    ...(kind === 'wa_reply' ? { text: content.text || '' } : {}),
  };
}

function buildContent(kind: SavedKind, d: Draft, original: any): any {
  switch (kind) {
    case 'email': return { subject: d.subject.trim(), blocks: editableToBlocks(d.text) };
    case 'email_sequence': return { steps: d.steps.map((s) => ({ delay_hours: Math.max(0, Math.round(Number(s.delay_hours) || 0)), subject: s.subject.trim(), blocks: editableToBlocks(s.text) })) };
    case 'wa_reply': return replyContent({ keyword: d.keyword, match_type: d.match_type as 'contains' | 'exact', reply_kind: d.reply_kind as 'text' | 'buttons' | 'list', text: d.text, body: d.body, buttons: d.buttons, button_label: d.button_label, rows: d.rows });
    case 'wa_prompt': return { prompt: d.prompt.trim() };
    case 'wa_flow': return { entry_keyword: d.entry_keyword.trim(), match_type: d.match_type, definition: original && original.definition };
    default: return {};
  }
}

export default function TemplateEditor({ spec, canCreate, canEdit, onSave, onClose }: Props) {
  const [name, setName] = useState(spec.name);
  const [description, setDescription] = useState(spec.description);
  const [d, setD] = useState<Draft>(() => startDraft(spec.kind, spec.content));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [saved, setSaved] = useState(false);
  const set = (patch: Partial<Draft>) => setD((x) => ({ ...x, ...patch }));
  const editingMine = !!spec.savedId;

  async function save(mode: SaveMode) {
    setMessage(null);
    const input: SaveInput = { kind: spec.kind, name, description, content: buildContent(spec.kind, d, spec.content) };
    const checked = validateTemplate(input);
    if ('error' in checked) { setMessage({ ok: false, text: String((checked as { error?: string }).error || 'Check the template and try again.') }); return; }
    setBusy(true);
    try {
      await onSave((checked as { value: SaveInput }).value, mode, spec.savedId);
      setSaved(true);
      setMessage({ ok: true, text: mode === 'update' ? 'Saved. Everyone in your organization now sees the changed template.' : 'Saved. Find it under "My templates".' });
    } catch (err: any) {
      setMessage({ ok: false, text: err.message || 'Could not save the template.' });
    } finally {
      setBusy(false);
    }
  }

  const stepInput = (i: number, patch: Partial<StepDraft>) => set({ steps: d.steps.map((s, j) => (j === i ? { ...s, ...patch } : s)) });

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '1rem', marginBottom: '0.9rem', background: 'var(--surface2, transparent)' }}>
      <strong style={{ color: 'var(--white)' }}>{spec.title || (editingMine ? 'Edit template' : 'Customise a copy')}</strong>
      <div style={{ ...note, marginBottom: '0.8rem' }}>
        {editingMine ? 'You are changing a template your team saved.' : spec.savedId === undefined && spec.name ? 'The ready-made template stays as it is; your changed copy is saved under "My templates".' : 'Write your own. It is saved under "My templates" for everyone in your organization.'}
      </div>

      <label style={label}>Name</label>
      <input style={field} maxLength={120} value={name} onChange={(e) => setName(e.target.value)} placeholder="Template name" />
      <label style={label}>When to use it (optional)</label>
      <input style={field} maxLength={300} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="One line that tells your team when to pick it" />

      {spec.kind === 'email' && (
        <>
          <label style={label}>Subject</label>
          <input style={field} maxLength={300} value={d.subject} onChange={(e) => set({ subject: e.target.value })} />
          <label style={label}>Message</label>
          <textarea style={{ ...area, minHeight: 170 }} value={d.text} onChange={(e) => set({ text: e.target.value })} />
          <div style={{ ...note, marginBottom: '0.8rem' }}>
            Leave a blank line between paragraphs. Start a line with “# ” for a heading. A line like “Book a call: https://…” becomes a button. Put parts to fill in later in [square brackets].
          </div>
        </>
      )}

      {spec.kind === 'email_sequence' && (
        <>
          {d.steps.map((s, i) => (
            <div key={i} style={{ border: '1px solid var(--border)', borderRadius: 6, padding: '0.7rem', marginBottom: '0.7rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', marginBottom: '0.5rem' }}>
                <strong style={{ fontSize: '0.8rem', color: 'var(--white)' }}>Email {i + 1}</strong>
                {d.steps.length > 1 && <button type="button" style={tiny} onClick={() => set({ steps: d.steps.filter((_, j) => j !== i) })}>Remove</button>}
              </div>
              <label style={label}>{i === 0 ? 'Sent first (hours after it starts)' : 'Wait this many hours after the previous email'}</label>
              <input style={{ ...field, maxWidth: 160 }} inputMode="numeric" value={s.delay_hours} onChange={(e) => stepInput(i, { delay_hours: e.target.value.replace(/[^\d]/g, '') })} />
              <label style={label}>Subject</label>
              <input style={field} maxLength={300} value={s.subject} onChange={(e) => stepInput(i, { subject: e.target.value })} />
              <label style={label}>Message</label>
              <textarea style={area} value={s.text} onChange={(e) => stepInput(i, { text: e.target.value })} />
            </div>
          ))}
          {d.steps.length < 15 && <button type="button" style={{ ...ghost, marginBottom: '0.8rem' }} onClick={() => set({ steps: [...d.steps, { delay_hours: '72', subject: '', text: '' }] })}>Add another email</button>}
          <div style={{ ...note, marginBottom: '0.8rem' }}>Same rules as a single email: blank line between paragraphs, “# ” for a heading, “Label: https://…” for a button.</div>
        </>
      )}

      {spec.kind === 'wa_reply' && (
        <>
          <label style={label}>When the message has this word or phrase</label>
          <input style={field} maxLength={100} value={d.keyword} onChange={(e) => set({ keyword: e.target.value })} />
          <label style={label}>Match</label>
          <select style={field} value={d.match_type} onChange={(e) => set({ match_type: e.target.value })}>
            <option value="contains">Contains the word</option>
            <option value="exact">Is exactly the word</option>
          </select>
          <label style={label}>Reply with</label>
          <select style={field} value={d.reply_kind} onChange={(e) => set({ reply_kind: e.target.value })}>
            <option value="text">A text message</option>
            <option value="buttons">A message with up to 3 buttons</option>
            <option value="list">A message with a list of options</option>
          </select>
          {d.reply_kind === 'text' ? (
            <>
              <label style={label}>Message</label>
              <textarea style={area} maxLength={1024} value={(d as any).text} onChange={(e) => set({ text: e.target.value })} />
            </>
          ) : (
            <>
              <label style={label}>Message</label>
              <textarea style={area} maxLength={1024} value={d.body} onChange={(e) => set({ body: e.target.value })} />
            </>
          )}
          {d.reply_kind === 'buttons' && (
            <>
              <label style={label}>Buttons (up to 20 characters each)</label>
              {d.buttons.map((b, i) => (
                <div key={i} style={{ display: 'flex', gap: 6 }}>
                  <input style={field} maxLength={20} value={b} onChange={(e) => set({ buttons: d.buttons.map((x, j) => (j === i ? e.target.value : x)) })} />
                  {d.buttons.length > 1 && <button type="button" style={{ ...tiny, alignSelf: 'flex-start', marginTop: 4 }} onClick={() => set({ buttons: d.buttons.filter((_, j) => j !== i) })}>Remove</button>}
                </div>
              ))}
              {d.buttons.length < 3 && <button type="button" style={{ ...ghost, marginBottom: '0.8rem' }} onClick={() => set({ buttons: [...d.buttons, ''] })}>Add a button</button>}
            </>
          )}
          {d.reply_kind === 'list' && (
            <>
              <label style={label}>Text on the list button (up to 20 characters)</label>
              <input style={field} maxLength={20} value={d.button_label} onChange={(e) => set({ button_label: e.target.value })} />
              <label style={label}>Options (title up to 24 characters, description up to 72)</label>
              {d.rows.map((r, i) => (
                <div key={i} style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <input style={{ ...field, flex: '1 1 160px' }} maxLength={24} placeholder="Title" value={r.title} onChange={(e) => set({ rows: d.rows.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)) })} />
                  <input style={{ ...field, flex: '2 1 220px' }} maxLength={72} placeholder="Description (optional)" value={r.description} onChange={(e) => set({ rows: d.rows.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)) })} />
                  {d.rows.length > 1 && <button type="button" style={{ ...tiny, alignSelf: 'flex-start', marginTop: 4 }} onClick={() => set({ rows: d.rows.filter((_, j) => j !== i) })}>Remove</button>}
                </div>
              ))}
              {d.rows.length < 10 && <button type="button" style={{ ...ghost, marginBottom: '0.8rem' }} onClick={() => set({ rows: [...d.rows, { title: '', description: '' }] })}>Add an option</button>}
            </>
          )}
        </>
      )}

      {spec.kind === 'wa_prompt' && (
        <>
          <label style={label}>Instructions for the AI assistant</label>
          <textarea style={{ ...area, minHeight: 200 }} maxLength={4000} value={d.prompt} onChange={(e) => set({ prompt: e.target.value })} />
          <div style={{ ...note, marginBottom: '0.8rem' }}>The AI only knows what you tell it here: add your business facts (prices, hours, what you do not do).</div>
        </>
      )}

      {spec.kind === 'wa_flow' && (
        <>
          <label style={label}>The flow starts when the message has this word or phrase</label>
          <input style={field} maxLength={100} value={d.entry_keyword} onChange={(e) => set({ entry_keyword: e.target.value })} />
          <label style={label}>Match</label>
          <select style={field} value={d.match_type} onChange={(e) => set({ match_type: e.target.value })}>
            <option value="contains">Contains the word</option>
            <option value="exact">Is exactly the word</option>
          </select>
          <div style={{ ...note, marginBottom: '0.8rem' }}>The steps of a flow are changed in the flow builder: create the flow from this template, change its steps there, then save it as a team template again.</div>
        </>
      )}

      {message && <div style={{ ...note, marginBottom: '0.7rem', color: message.ok ? 'var(--green, #3ecf8e)' : 'var(--red, #ef5350)' }}>{message.text}</div>}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {!saved && editingMine && (
          <button type="button" style={{ ...primaryBtnStyle, flex: 'none', padding: '0.55rem 1rem', opacity: canEdit ? 1 : 0.55 }} disabled={busy || !canEdit} onClick={() => save('update')}>{busy ? 'Saving…' : 'Save changes'}</button>
        )}
        {!saved && (
          <button type="button" style={editingMine ? { ...ghost, opacity: canCreate ? 1 : 0.55 } : { ...primaryBtnStyle, flex: 'none', padding: '0.55rem 1rem', opacity: canCreate ? 1 : 0.55 }} disabled={busy || !canCreate} onClick={() => save('create')}>
            {busy && !editingMine ? 'Saving…' : editingMine ? 'Save as a new template' : 'Save as my template'}
          </button>
        )}
        <button type="button" style={ghost} disabled={busy} onClick={onClose}>{saved ? 'Close' : 'Cancel'}</button>
        {!saved && editingMine && !canEdit && <span style={note}>You need the permission to edit records to change a team template.</span>}
        {!saved && !canCreate && <span style={note}>You need the permission to create records to save templates.</span>}
      </div>
    </div>
  );
}
