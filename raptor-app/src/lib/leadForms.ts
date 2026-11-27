// lib/leadForms.ts
// Website lead forms (db/migrations/2026-11-28_a_lead_forms.sql). The public page is ventures/raptor/form.html on the website.

export const FORM_PAGE = 'https://shoonyaorigins.com/ventures/raptor/form.html';

export interface LeadForm {
  id: string;
  token: string;
  name: string;
  title: string;
  intro: string;
  button_text: string;
  thanks_text: string;
  ask_company: boolean;
  ask_phone: boolean;
  ask_message: boolean;
  require_phone: boolean;
  assignee_id: string | null;
  enabled: boolean;
  created_at: string;
}

export type LeadFormDraft = Omit<LeadForm, 'id' | 'token' | 'created_at'>;

export const NEW_FORM: LeadFormDraft = {
  name: 'Website', title: 'Contact us', intro: '', button_text: 'Send', thanks_text: 'Thank you. We will get back to you soon.',
  ask_company: true, ask_phone: true, ask_message: true, require_phone: false, assignee_id: null, enabled: true,
};

export const formLink = (token: string): string => `${FORM_PAGE}?f=${encodeURIComponent(token)}`;

const attribute = (text: string) => text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** The lines a customer pastes into their website. The height fits the fields the form asks for. */
export function embedCode(form: Pick<LeadForm, 'token' | 'title' | 'ask_company' | 'ask_phone' | 'ask_message' | 'intro'>): string {
  const height = 330 + (form.ask_company ? 70 : 0) + (form.ask_phone ? 70 : 0) + (form.ask_message ? 140 : 0) + (form.intro ? 60 : 0);
  return `<iframe src="${formLink(form.token)}&embed=1" title="${attribute(form.title || 'Contact form')}" `
    + `style="width:100%;max-width:480px;height:${height}px;border:0" loading="lazy"></iframe>`;
}

/** What is wrong with a form before saving it, in plain words; null when it can be saved. */
export function formProblem(draft: LeadFormDraft): string | null {
  if (!draft.name.trim()) return 'Give the form a name (only your team sees it).';
  if (draft.name.trim().length > 80) return 'The name can be 80 characters at most.';
  if (draft.title.length > 120) return 'The heading can be 120 characters at most.';
  if (draft.intro.length > 500) return 'The introduction can be 500 characters at most.';
  if (!draft.button_text.trim() || draft.button_text.trim().length > 40) return 'The button needs 1 to 40 characters.';
  if (draft.thanks_text.length > 300) return 'The thank-you text can be 300 characters at most.';
  return null;
}

/** The columns to write: trimmed, and "phone required" only when the phone is asked for. */
export function formRow(draft: LeadFormDraft) {
  return {
    name: draft.name.trim(), title: draft.title.trim(), intro: draft.intro.trim(), button_text: draft.button_text.trim(),
    thanks_text: draft.thanks_text.trim(), ask_company: draft.ask_company, ask_phone: draft.ask_phone, ask_message: draft.ask_message,
    require_phone: draft.ask_phone && draft.require_phone, assignee_id: draft.assignee_id || null, enabled: draft.enabled,
  };
}
