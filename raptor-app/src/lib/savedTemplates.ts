// Saved team templates: the team's own versions of the starter templates, kept in the cloud database
// (db/migrations/2026-10-18_saved_templates.sql) and shared by everyone in the organization, in the web app and on every PC.
//
// A saved template has the same shape as a built-in one, so it flows through exactly the same "use this template" code: the rows are
// turned into built-in-shaped objects by the *FromRow helpers below. Row-level security decides who may read, create, edit and
// delete; this file checks that what is saved is well formed, and turns database errors into plain words.
//
// The desktop app uses a copy of this file (raptor-ui/src/savedTemplates.js, generated from it and kept in sync by hand).
// Everything takes the Supabase client as an argument, so it can be tested without a network.

import type { TemplateBlock } from './emailTemplates';

export type SavedKind = 'email' | 'email_sequence' | 'wa_reply' | 'wa_flow' | 'wa_prompt';
export const SAVED_KINDS: SavedKind[] = ['email', 'email_sequence', 'wa_reply', 'wa_flow', 'wa_prompt'];

export interface SavedRow {
  id: string; kind: SavedKind; name: string; description: string; content: any;
  created_by: string | null; created_at: string; updated_at: string;
}

export const MY_TEMPLATES = 'My templates';
export const MAX_NAME = 120;
export const MAX_DESCRIPTION = 300;
export const MAX_CONTENT_CHARS = 200000;
const COLUMNS = 'id, kind, name, description, content, created_by, created_at, updated_at';

// ───────────── database errors in plain words ─────────────

export function friendlyError(error: any, action = 'save'): string {
  const text = String((error && (error.message || error.details)) || '');
  const code = error && error.code;
  if (code === '42P01' || code === 'PGRST205' || /does not exist|could not find the table/i.test(text)) {
    return 'Saved templates are not set up on this account yet. The database step still has to be run.';
  }
  if (code === '42501' || /row-level security|permission denied/i.test(text)) {
    return `You do not have permission to ${action} templates. Ask your organization's owner.`;
  }
  if (/check constraint|too long|violates/i.test(text)) return 'That template is too long to save. Shorten it and try again.';
  return `Could not ${action} the template. Try again.`;
}

// ───────────── checking what is about to be saved ─────────────

const isText = (v: unknown, max: number) => typeof v === 'string' && v.length <= max;
const isInt = (v: unknown, min: number, max: number) => Number.isInteger(v) && (v as number) >= min && (v as number) <= max;

function blocksProblem(blocks: any): string | null {
  if (!Array.isArray(blocks) || blocks.length === 0) return 'The email is empty.';
  if (blocks.length > 40) return 'The email has too many parts.';
  let hasText = false;
  for (const b of blocks) {
    if (!b || typeof b !== 'object') return 'The email has a part that is not valid.';
    if (b.type === 'text' || b.type === 'heading') {
      if (!isText(b.content, 5000)) return 'A paragraph of the email is too long.';
      if (b.content.trim()) hasText = true;
    } else if (b.type === 'button') {
      if (!isText(b.label, 100) || !b.label.trim()) return 'A button of the email needs a label.';
      if (!isText(b.url ?? '', 2000)) return 'A button link is too long.';
    } else return 'The email has a part that is not valid.';
  }
  return hasText ? null : 'The email has no text.';
}

const FLOW_KINDS = new Set(['start', 'message', 'question', 'buttons', 'list', 'condition', 'ai_reply', 'handoff', 'end']);

// null when the content is fine for its kind, otherwise a sentence saying what is wrong.
export function contentProblem(kind: SavedKind, c: any): string | null {
  if (!c || typeof c !== 'object' || Array.isArray(c)) return 'The template is empty.';
  switch (kind) {
    case 'email':
      if (!isText(c.subject, 300) || !c.subject.trim()) return 'Give the email a subject.';
      return blocksProblem(c.blocks);
    case 'email_sequence': {
      if (!Array.isArray(c.steps) || c.steps.length === 0) return 'The sequence has no emails.';
      if (c.steps.length > 15) return 'The sequence has too many emails.';
      for (const [i, s] of c.steps.entries()) {
        if (!s || !isInt(s.delay_hours, 0, 8760)) return `Email ${i + 1} has a wait that is not valid.`;
        if (!isText(s.subject, 300) || !s.subject.trim()) return `Email ${i + 1} needs a subject.`;
        const p = blocksProblem(s.blocks);
        if (p) return `Email ${i + 1}: ${p}`;
      }
      return null;
    }
    case 'wa_reply': {
      if (!isText(c.keyword, 100) || !c.keyword.trim()) return 'The reply needs a keyword.';
      if (c.match_type !== 'contains' && c.match_type !== 'exact') return 'The reply needs a match type.';
      if (c.reply_kind === 'text') return isText(c.text, 1024) && c.text.trim() ? null : 'The reply text is empty or too long.';
      if (c.reply_kind === 'buttons') {
        if (!isText(c.body, 1024) || !c.body.trim()) return 'The reply needs a message.';
        if (!Array.isArray(c.buttons) || c.buttons.length < 1 || c.buttons.length > 3) return 'A reply has one to three buttons.';
        return c.buttons.every((b: any) => isText(b, 20) && b.trim()) ? null : 'A button label is empty or longer than 20 characters.';
      }
      if (c.reply_kind === 'list') {
        if (!isText(c.body, 1024) || !c.body.trim()) return 'The reply needs a message.';
        if (!isText(c.button_label ?? 'View options', 20)) return 'The list button label is longer than 20 characters.';
        if (!Array.isArray(c.rows) || c.rows.length < 1 || c.rows.length > 10) return 'A list has one to ten options.';
        return c.rows.every((r: any) => r && isText(r.title, 24) && r.title.trim() && isText(r.description ?? '', 72)) ? null : 'A list option is empty or too long.';
      }
      return 'The reply type is not supported.';
    }
    case 'wa_flow': {
      if (!isText(c.entry_keyword, 100) || !c.entry_keyword.trim()) return 'The flow needs an entry keyword.';
      if (c.match_type !== 'contains' && c.match_type !== 'exact') return 'The flow needs a match type.';
      const d = c.definition;
      if (!d || !Array.isArray(d.nodes) || !Array.isArray(d.edges) || d.nodes.length < 2) return 'The flow has no steps yet.';
      const ids = new Set<string>();
      for (const n of d.nodes) {
        if (!n || typeof n.id !== 'string' || !n.data || !FLOW_KINDS.has(n.data.kind)) return 'The flow has a step that is not valid.';
        ids.add(n.id);
      }
      return d.edges.every((e: any) => e && ids.has(e.source) && ids.has(e.target)) ? null : 'The flow has a connection to a missing step.';
    }
    case 'wa_prompt':
      return isText(c.prompt, 4000) && c.prompt.trim().length >= 20 ? null : 'The instructions are too short or too long (20 to 4000 characters).';
    default:
      return 'This kind of template is not supported.';
  }
}

export function validateTemplate({ kind, name, description, content }: { kind: SavedKind; name: string; description?: string; content: any }) {
  if (!SAVED_KINDS.includes(kind)) return { error: 'This kind of template is not supported.' } as const;
  const cleanName = String(name || '').trim();
  if (!cleanName) return { error: 'Give the template a name.' } as const;
  if (cleanName.length > MAX_NAME) return { error: `The name can be up to ${MAX_NAME} characters.` } as const;
  const cleanDescription = String(description || '').trim();
  if (cleanDescription.length > MAX_DESCRIPTION) return { error: `The description can be up to ${MAX_DESCRIPTION} characters.` } as const;
  const problem = contentProblem(kind, content);
  if (problem) return { error: problem } as const;
  if (JSON.stringify(content).length > MAX_CONTENT_CHARS) return { error: 'That template is too long to save.' } as const;
  return { value: { kind, name: cleanName, description: cleanDescription, content } } as const;
}

// ───────────── database ─────────────

export async function listSaved(supabase: any, kind?: SavedKind): Promise<SavedRow[]> {
  let query = supabase.from('saved_templates').select(COLUMNS);
  if (kind) query = query.eq('kind', kind);
  const { data, error } = await query.order('updated_at', { ascending: false });
  if (error) throw new Error(friendlyError(error, 'load'));
  return (data || []) as SavedRow[];
}

export async function saveTemplate(supabase: any, input: { kind: SavedKind; name: string; description?: string; content: any }): Promise<SavedRow> {
  const checked = validateTemplate(input);
  if ('error' in checked) throw new Error(checked.error);
  const { data, error } = await supabase.from('saved_templates').insert(checked.value).select(COLUMNS).single();
  if (error) throw new Error(friendlyError(error, 'save'));
  return data as SavedRow;
}

export async function deleteSaved(supabase: any, id: string): Promise<void> {
  const { error } = await supabase.from('saved_templates').delete().eq('id', id);
  if (error) throw new Error(friendlyError(error, 'delete'));
}

// ───────────── turning what is on screen into blocks, and blocks into text ─────────────

/** Plain text -> paragraph blocks (a blank line starts a new paragraph). Used by the desktop, whose mail is plain text. */
export function textToBlocks(text: string): TemplateBlock[] {
  return String(text || '').split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean).map((content) => ({ type: 'text', content }));
}

/** Blocks -> plain text (a button becomes a line with its link to fill in). */
export function blocksToText(blocks: TemplateBlock[]): string {
  return (blocks || []).map((b) => (b.type === 'button' ? `${String(b.label).replace(/^\[|\]$/g, '')}: ${b.url || '[link]'}` : b.content)).join('\n\n');
}

function cleanText(html: string): string {
  const withBreaks = html.replace(/<br\s*\/?>/gi, '\n');
  const holder = document.createElement('div');
  holder.innerHTML = withBreaks;
  return (holder.textContent || '').replace(/ /g, ' ').replace(/[ \t]+\n/g, '\n').trim();
}

/**
 * The email editor's HTML -> simple blocks, so a saved template can be edited visually again. It understands what the visual editor
 * writes (paragraphs, headings, buttons; the unsubscribe footer, dividers and spacers are dropped because the editor re-adds a footer).
 * Images and hand-written HTML cannot be kept: `lossy` says so, and the text is kept as plain paragraphs.
 */
export function htmlToBlocks(html: string): { blocks: TemplateBlock[]; lossy: boolean } {
  const source = String(html || '');
  const doc = new DOMParser().parseFromString(source, 'text/html');
  const cell = doc.querySelector('td');
  const blocks: TemplateBlock[] = [];
  let lossy = !/role="presentation"/.test(source);
  const addText = (type: 'text' | 'heading', content: string) => { if (content) blocks.push({ type, content }); };

  if (cell) {
    for (const el of Array.from(cell.children)) {
      const tag = el.tagName;
      if (tag === 'TABLE') {
        const a = el.querySelector('a');
        if (a) blocks.push({ type: 'button', label: (a.textContent || '').trim(), url: a.getAttribute('href') || '' });
        continue;
      }
      if (el.querySelector('img')) { lossy = true; continue; }
      if (el.querySelector('hr')) continue;
      if (/\{\{unsubscribe_url\}\}/.test(el.innerHTML)) continue;
      const text = cleanText(el.innerHTML);
      if (!text) continue;
      const style = (el.getAttribute('style') || '').replace(/\s+/g, '');
      if (tag === 'DIV' && /font-size:22px/.test(style)) addText('heading', text);
      else {
        if (tag !== 'DIV' && tag !== 'P') lossy = true;
        addText('text', text);
      }
    }
  }
  if (blocks.length === 0) {
    lossy = true;
    addText('text', cleanText((doc.body && doc.body.innerHTML) || source));
  }
  return { blocks, lossy };
}

// ───────────── saved rows -> the shapes the built-in templates have, so the same "use this" code applies ─────────────

const common = (row: SavedRow) => ({ id: `saved:${row.id}`, category: MY_TEMPLATES, name: row.name, when: row.description || 'Saved by your team', mine: true as const });

export function emailFromRow(row: SavedRow) {
  const c = row.content || {};
  return contentProblem('email', c) ? null : { ...common(row), subject: c.subject as string, blocks: c.blocks as TemplateBlock[] };
}

export function sequenceFromRow(row: SavedRow) {
  const c = row.content || {};
  return contentProblem('email_sequence', c) ? null : { ...common(row), steps: c.steps as { delay_hours: number; subject: string; blocks: TemplateBlock[] }[] };
}

export function replyFromRow(row: SavedRow) {
  const c = row.content || {};
  if (contentProblem('wa_reply', c)) return null;
  return {
    ...common(row), keyword: c.keyword as string, match_type: c.match_type as 'contains' | 'exact', reply_kind: c.reply_kind as 'text' | 'buttons' | 'list',
    text: c.text as string | undefined, body: c.body as string | undefined, buttons: c.buttons as string[] | undefined,
    button_label: c.button_label as string | undefined, rows: c.rows as { title: string; description?: string }[] | undefined,
  };
}

export function flowFromRow(row: SavedRow) {
  const c = row.content || {};
  return contentProblem('wa_flow', c) ? null : { ...common(row), entry_keyword: c.entry_keyword as string, match_type: c.match_type as 'contains' | 'exact', definition: c.definition };
}

export function promptFromRow(row: SavedRow) {
  const c = row.content || {};
  return contentProblem('wa_prompt', c) ? null : { ...common(row), prompt: c.prompt as string };
}

/** A keyword reply as the triggers form holds it -> the content to store. */
export function replyContent(form: {
  keyword: string; match_type: 'contains' | 'exact'; reply_kind: 'text' | 'buttons' | 'list';
  text?: string; body?: string; buttons?: string[]; button_label?: string; rows?: { title: string; description?: string }[];
}) {
  const base = { keyword: form.keyword.trim(), match_type: form.match_type, reply_kind: form.reply_kind };
  if (form.reply_kind === 'text') return { ...base, text: (form.text || '').trim() };
  if (form.reply_kind === 'buttons') return { ...base, body: (form.body || '').trim(), buttons: (form.buttons || []).map((b) => b.trim()).filter(Boolean) };
  return {
    ...base, body: (form.body || '').trim(), button_label: (form.button_label || 'View options').trim(),
    rows: (form.rows || []).filter((r) => r.title.trim()).map((r) => ({ title: r.title.trim(), description: (r.description || '').trim() })),
  };
}
