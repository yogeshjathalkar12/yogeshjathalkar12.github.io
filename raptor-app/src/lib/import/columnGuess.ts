// lib/import/columnGuess.ts
// Suggests, for each column of a table, which CRM field it is, from TWO independent signals:
//   1. the header words (a synonym table, matched on whole words so "Email" and "e-mail address" both land on email), and
//   2. the values (what share of the cells are emails, web addresses, phone numbers, numbers, dates, a few repeated labels).
// Header and values must not contradict each other: a column called "Contact Number" full of emails is NOT a phone column.
// Every guess carries a plain-words reason; the person always has the last word in the wizard.

import { cleanText, parseEmails, parsePhones, parseUrl, parseNumber, parseDate, parsePeople } from './values.ts';
import type { SheetTable } from './sheetShape.ts';

export type FieldId =
  | 'company.name' | 'company.website_url' | 'company.email' | 'company.phone' | 'company.address' | 'company.city'
  | 'company.industry' | 'company.description'
  | 'contact.name' | 'contact.first_name' | 'contact.last_name' | 'contact.role' | 'contact.email' | 'contact.phone' | 'contact.linkedin_url'
  | 'contact.status'
  | 'deal.title' | 'deal.value' | 'deal.stage' | 'deal.meeting_at'
  | 'custom' | 'ignore';

export interface FieldDef {
  id: FieldId;
  entity: 'company' | 'contact' | 'deal' | 'other';
  label: string;
  kind: 'text' | 'email' | 'phone' | 'url' | 'number' | 'date' | 'person' | 'label' | 'none';
}

export const FIELDS: FieldDef[] = [
  { id: 'company.name', entity: 'company', label: 'Company name', kind: 'text' },
  { id: 'company.website_url', entity: 'company', label: 'Company website', kind: 'url' },
  { id: 'company.email', entity: 'company', label: 'Company email', kind: 'email' },
  { id: 'company.phone', entity: 'company', label: 'Company phone', kind: 'phone' },
  { id: 'company.address', entity: 'company', label: 'Company address', kind: 'text' },
  { id: 'company.city', entity: 'company', label: 'Company city / region', kind: 'text' },
  { id: 'company.industry', entity: 'company', label: 'Industry', kind: 'label' },
  { id: 'company.description', entity: 'company', label: 'Company description', kind: 'text' },
  { id: 'contact.name', entity: 'contact', label: 'Contact name', kind: 'person' },
  { id: 'contact.first_name', entity: 'contact', label: 'Contact first name', kind: 'text' },
  { id: 'contact.last_name', entity: 'contact', label: 'Contact last name', kind: 'text' },
  { id: 'contact.role', entity: 'contact', label: 'Contact job title', kind: 'text' },
  { id: 'contact.email', entity: 'contact', label: 'Contact email', kind: 'email' },
  { id: 'contact.phone', entity: 'contact', label: 'Contact phone', kind: 'phone' },
  { id: 'contact.linkedin_url', entity: 'contact', label: 'Contact LinkedIn', kind: 'url' },
  { id: 'contact.status', entity: 'contact', label: 'Contact status', kind: 'label' },
  { id: 'deal.title', entity: 'deal', label: 'Deal title', kind: 'text' },
  { id: 'deal.value', entity: 'deal', label: 'Deal value', kind: 'number' },
  { id: 'deal.stage', entity: 'deal', label: 'Deal stage', kind: 'label' },
  { id: 'deal.meeting_at', entity: 'deal', label: 'Meeting date', kind: 'date' },
  { id: 'custom', entity: 'other', label: 'Keep as a custom field', kind: 'text' },
  { id: 'ignore', entity: 'other', label: "Don't import", kind: 'none' },
];
export const FIELD_BY_ID = new Map(FIELDS.map((f) => [f.id, f]));

// header words -> field. Words are matched as whole words of the lower-cased header. First rule that matches with the best weight wins.
// Rules are about WORDS in any language-neutral English business sheet, never about one file's exact headers.
interface HeaderRule { field: FieldId; any: string[][]; not?: string[]; weight: number }
const W = (s: string) => s.split(' ');
const HEADER_RULES: HeaderRule[] = [
  { field: 'company.name', weight: 9, any: [W('company name'), W('company'), W('organisation'), W('organization'), W('org name'), W('business name'), W('firm'), W('startup name'), W('startup'), W('account name'), W('account'), W('employer'), W('client name')], not: ['type', 'size', 'segment', 'address', 'email', 'phone', 'website', 'url', 'industry', 'city', 'status', 'description'] },
  { field: 'company.website_url', weight: 9, any: [W('website'), W('web site'), W('web'), W('url'), W('site'), W('domain'), W('homepage'), W('web address'), W('company url')], not: ['source', 'sources', 'linkedin', 'status', 'verified'] },
  { field: 'contact.linkedin_url', weight: 10, any: [W('linkedin'), W('linked in')] },
  { field: 'contact.email', weight: 10, any: [W('contact email'), W('person email'), W('personal email'), W('work email'), W('hr email'), W('manager email')] },
  { field: 'company.email', weight: 8, any: [W('email'), W('e-mail'), W('emails'), W('email id'), W('email address'), W('mail'), W('mail id'), W('general email'), W('company email')] },
  { field: 'contact.phone', weight: 10, any: [W('contact phone'), W('mobile'), W('cell'), W('cell phone'), W('contact mobile'), W('direct phone'), W('direct dial')] },
  { field: 'company.phone', weight: 8, any: [W('phone'), W('telephone'), W('tel'), W('phone number'), W('contact number'), W('contact no'), W('number'), W('landline'), W('office phone'), W('phone no'), W('whatsapp')], not: ['fax', 'id', 'employees', 'sales', 'cycle'] },
  { field: 'contact.name', weight: 9, any: [W('contact name'), W('contact person'), W('contact'), W('person'), W('full name'), W('name of contact'), W('hr name'), W('owner name'), W('founder'), W('ceo'), W('decision maker'), W('point of contact'), W('poc'), W('lead name'), W('representative'), W('spoc')], not: ['email', 'phone', 'number', 'address', 'linkedin', 'status', 'details', 'info'] },
  { field: 'contact.first_name', weight: 9, any: [W('first name'), W('firstname'), W('given name'), W('forename')] },
  { field: 'contact.last_name', weight: 9, any: [W('last name'), W('lastname'), W('surname'), W('family name')] },
  { field: 'contact.role', weight: 9, any: [W('job title'), W('title'), W('designation'), W('role'), W('position'), W('job role'), W('job')], not: ['deal', 'company', 'startup'] },
  { field: 'company.address', weight: 8, any: [W('address'), W('addresses'), W('office address'), W('street'), W('location'), W('headquarters'), W('hq'), W('registered office'), W('office')], not: ['status', 'email', 'source', 'flag', 'basis'] },
  { field: 'company.city', weight: 8, any: [W('city'), W('region'), W('town'), W('district'), W('state'), W('area'), W('country'), W('locality'), W('zone')], not: ['flag', 'status'] },
  { field: 'company.industry', weight: 8, any: [W('industry'), W('sector'), W('vertical'), W('category'), W('domain of business'), W('business type'), W('segment'), W('niche')], not: ['basis'] },
  { field: 'company.description', weight: 7, any: [W('description'), W('about'), W('summary'), W('overview'), W('what they do'), W('validation'), W('details'), W('profile'), W('bio'), W('real world validation')] },
  { field: 'deal.title', weight: 9, any: [W('deal'), W('deal name'), W('deal title'), W('opportunity'), W('opportunity name'), W('project'), W('project name')] },
  { field: 'deal.value', weight: 9, any: [W('value'), W('deal value'), W('amount'), W('revenue'), W('price'), W('deal size'), W('worth'), W('budget'), W('arr'), W('mrr'), W('contract value')], not: ['employees'] },
  { field: 'deal.stage', weight: 9, any: [W('stage'), W('pipeline stage'), W('deal stage'), W('pipeline'), W('lead status'), W('funnel stage'), W('sales stage')] },
  { field: 'deal.meeting_at', weight: 8, any: [W('meeting'), W('meeting date'), W('meeting time'), W('appointment')] },
  { field: 'contact.status', weight: 6, any: [W('status'), W('temperature'), W('lead temperature'), W('lead status')], not: ['address', 'verified', 'verification'] },
];

const tokens = (h: string) => h.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim().split(' ').filter(Boolean);
const containsPhrase = (toks: string[], phrase: string[]) => {
  for (let i = 0; i + phrase.length <= toks.length; i++) if (phrase.every((p, k) => toks[i + k] === p || toks[i + k] === p + 's')) return true;
  return false;
};

interface HeaderMatch { field: FieldId; score: number }

export function headerCandidates(header: string): HeaderMatch[] {
  const toks = tokens(header);
  if (!toks.length) return [];
  const out: HeaderMatch[] = [];
  for (const rule of HEADER_RULES) {
    if (rule.not && toks.some((t) => rule.not!.includes(t))) continue;
    let best = 0;
    for (const phrase of rule.any) {
      if (!containsPhrase(toks, phrase)) continue;
      // exact whole header = strongest, a longer phrase is stronger than a one-word hit
      const exact = toks.length === phrase.length ? 3 : 0;
      best = Math.max(best, rule.weight + phrase.length + exact);
    }
    if (best) out.push({ field: rule.field, score: best });
  }
  return out.sort((a, b) => b.score - a.score);
}

// ------------------------------------------------------------------ value profile

export interface ColumnProfile {
  samples: string[];               // a few real values to show next to the guess
  filled: number;
  total: number;
  distinct: number;
  share: { email: number; phone: number; url: number; number: number; date: number; person: number; multi: number; long: number; serial: number };
  topValues: { value: string; count: number }[];
  placeholders: { value: string; count: number }[];   // texts that were treated as empty, most frequent first
  phoneProblems: number;
  emailProblems: number;
}

export function profileColumn(values: string[]): ColumnProfile {
  const total = values.length;
  const real: string[] = [];
  const ph = new Map<string, number>();
  for (const v of values) {
    const c = cleanText(v);
    if (c) real.push(c);
    else if (v.trim()) ph.set(v.trim(), (ph.get(v.trim()) || 0) + 1);
  }
  let email = 0, phone = 0, url = 0, num = 0, date = 0, person = 0, multi = 0, long = 0, phoneProblems = 0, emailProblems = 0;
  const sample = real.length > 400 ? real.filter((_, i) => i % Math.ceil(real.length / 400) === 0) : real;
  const sn = sample.length || 1;
  for (const v of sample) {
    const e = parseEmails(v);
    if (e.primary) { email++; if (e.others.length) multi++; } else if (/@/.test(v)) emailProblems++;
    const p = parsePhones(v);
    if (p.primary && /^[\d\s()+./-]+$/.test(v.replace(/\.0+$/, ''))) { phone++; if (p.others.length) multi++; } else if (/^[\d\s()+./\-eE.]+$/.test(v) && v.replace(/\D/g, '').length >= 6) phoneProblems++;
    if (parseUrl(v).url && !e.primary) url++;
    if (parseNumber(v).value !== null && /^[\s\d.,₹$€£()+-]+[kKmMbB]?$/.test(v)) num++;
    if (parseDate(v).value) date++;
    if (v.length > 80) long++;
    const pp = parsePeople(v).people;
    if (pp.length && pp.every((x) => x.name.split(' ').length >= 2 && x.name.split(' ').length <= 4) && !/[\d@/]/.test(v.replace(/\([^)]*\)/g, ''))) person++;   // one word is not enough evidence of a person
  }
  const counts = new Map<string, number>();
  for (const v of real) counts.set(v, (counts.get(v) || 0) + 1);
  const topValues = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([value, count]) => ({ value, count }));
  const nums = real.map((v) => v.trim()).filter(Boolean);
  const serial = nums.length >= 3 && nums.every((v) => /^\d{1,6}$/.test(v)) && nums.map(Number).every((v, i, a) => i === 0 || v > a[i - 1]) ? 1 : 0;
  return {
    samples: real.slice(0, 3).map((v) => (v.length > 60 ? v.slice(0, 60) + '…' : v)),
    filled: real.length, total, distinct: counts.size,
    share: { email: email / sn, phone: phone / sn, url: url / sn, number: num / sn, date: date / sn, person: person / sn, multi: multi / sn, long: long / sn, serial },
    topValues,
    placeholders: [...ph.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([value, count]) => ({ value, count })),
    phoneProblems, emailProblems,
  };
}

// ------------------------------------------------------------------ the guess

export interface Guess {
  field: FieldId;
  confidence: 'high' | 'medium' | 'low';
  reason: string;
  alternatives: FieldId[];
}

const PROVENANCE = new Set(['source', 'sources', 'reference', 'references', 'citation', 'citations', 'origin', 'evidence', 'proof', 'via']);

const VALUE_FIELD: Record<string, FieldId> = { email: 'company.email', phone: 'company.phone', url: 'company.website_url' };

export function guessColumn(header: string, profile: ColumnProfile): Guess {
  const cands = headerCandidates(header);
  const s = profile.share;
  const strong = (k: 'email' | 'phone' | 'url') => s[k] >= 0.6;
  const alt = (list: FieldId[]) => [...new Set(list)].slice(0, 3);

  // an empty column is not worth a field
  if (profile.filled === 0) return { field: 'ignore', confidence: 'high', reason: 'The column is empty.', alternatives: [] };
  // a row counter
  if (s.serial && /^(id|no|sr|sl|s\.?\s?no|serial|#|sno|index|number|column [a-z]+)$/i.test(header.trim().replace(/\./g, ''))) {
    return { field: 'ignore', confidence: 'high', reason: 'Only 1, 2, 3 ... row numbers.', alternatives: ['custom'] };
  }

  // a column that says where the data CAME FROM ("Source URL(s)", "Reference") is provenance: keep it, never read it as the company's own data
  if (tokens(header).some((t) => PROVENANCE.has(t))) {
    return { field: 'custom', confidence: 'medium', reason: `"${header}" says where the information came from, so it is kept as a custom field instead of being read as the company's own web address, email or phone.`, alternatives: alt(['ignore', cands[0]?.field as FieldId].filter(Boolean) as FieldId[]) };
  }

  // values that clearly are one kind override a header that says another kind (and the other way round is reported in the reason)
  for (const kind of ['email', 'url', 'phone'] as const) {
    if (!strong(kind)) continue;
    const want = candsOfKind(cands, kind);
    if (want) return { field: want, confidence: 'high', reason: `The header says "${header}" and ${pct(s[kind])} of the values are ${kindWord(kind)}.`, alternatives: alt([VALUE_FIELD[kind], ...(kind === 'email' ? ['contact.email'] : kind === 'phone' ? ['contact.phone'] : ['contact.linkedin_url']) as FieldId[], 'custom']) };
    // the header names something else but the values are clearly of this kind: trust the values
    const top = cands[0];
    const f = kind === 'url' && /linkedin/i.test(profile.samples.join(' ')) ? 'contact.linkedin_url' : VALUE_FIELD[kind];
    return { field: f, confidence: 'medium', reason: `${pct(s[kind])} of the values look like ${kindWord(kind)}, though the header "${header}" does not say so.`, alternatives: alt([top?.field as FieldId, 'custom'].filter(Boolean) as FieldId[]) };
  }

  const top = cands[0];
  if (top) {
    const def = FIELD_BY_ID.get(top.field)!;
    // header says a kind that the values contradict
    if (def.kind === 'phone' && s.phone < 0.4 && profile.phoneProblems > profile.filled * 0.4) {
      return { field: top.field, confidence: 'low', reason: `Header says phone but most values are not usable phone numbers (${profile.phoneProblems} damaged).`, alternatives: alt(['custom', 'ignore']) };
    }
    if (def.kind === 'email' && s.email < 0.3) return { field: 'custom', confidence: 'low', reason: `The header says email but few values contain an address.`, alternatives: alt([top.field, 'ignore']) };
    if (def.kind === 'number' && s.number < 0.4) return { field: 'custom', confidence: 'low', reason: `The header says a value but the cells are not numbers.`, alternatives: alt([top.field, 'ignore']) };
    if (def.kind === 'url' && s.url < 0.4) return { field: 'custom', confidence: 'low', reason: `The header says a web address but the cells are not addresses.`, alternatives: alt([top.field, 'ignore']) };
    if (def.kind === 'date' && s.date < 0.4) return { field: 'custom', confidence: 'low', reason: `The header says a date but the cells are not dates.`, alternatives: alt([top.field, 'ignore']) };
    if (top.field === 'company.address' && profile.filled >= 8 && profile.distinct <= 3) {
      return { field: 'custom', confidence: 'low', reason: `Only ${profile.distinct} different values: this looks like a flag or label, not addresses.`, alternatives: alt([top.field, 'ignore']) };
    }
    if (top.field === 'company.description' && s.long < 0.2 && profile.distinct <= 12 && profile.filled > 12) {
      return { field: 'custom', confidence: 'medium', reason: `Only ${profile.distinct} different values: this looks like a label or category, not a description.`, alternatives: alt(['company.industry', 'company.description']) };
    }
    const second = cands[1];
    const clear = !second || top.score - second.score >= 2;
    return { field: top.field, confidence: top.score >= 14 && clear ? 'high' : 'medium', reason: `The header "${header}" matches ${def.label.toLowerCase()}.`, alternatives: alt([second?.field as FieldId, 'custom', 'ignore'].filter(Boolean) as FieldId[]) };
  }

  // a bare "Name": the person in a list of people, the company in a list of companies; the values decide
  if (tokens(header).join(' ') === 'name' && profile.filled >= 3) {
    return s.person >= 0.6
      ? { field: 'contact.name', confidence: 'medium', reason: 'The header is just "Name" and the values look like names of people.', alternatives: alt(['company.name', 'custom']) }
      : { field: 'company.name', confidence: 'medium', reason: 'The header is just "Name" and the values do not look like names of people, so it is read as the company name.', alternatives: alt(['contact.name', 'custom']) };
  }

  // no header hint: values only
  if (s.date >= 0.7) return { field: 'custom', confidence: 'low', reason: 'These look like dates; keep as a custom field unless you know which date it is.', alternatives: alt(['deal.meeting_at', 'ignore']) };
  if (s.number >= 0.8) return { field: 'custom', confidence: 'low', reason: 'These are numbers; there is no header to say what they count.', alternatives: alt(['deal.value', 'ignore']) };
  if (s.person >= 0.7 && profile.filled >= 5 && profile.distinct >= profile.filled * 0.5) return { field: 'contact.name', confidence: 'low', reason: 'These look like people\'s names.', alternatives: alt(['company.name', 'custom']) };
  return { field: 'custom', confidence: 'low', reason: 'No clear match; keep it as a custom field so nothing is lost, or choose Don\'t import.', alternatives: alt(['ignore', 'company.description']) };
}

function candsOfKind(cands: HeaderMatch[], kind: 'email' | 'phone' | 'url'): FieldId | null {
  for (const c of cands) if (FIELD_BY_ID.get(c.field)?.kind === kind) return c.field;
  return null;
}
const kindWord = (k: string) => (k === 'url' ? 'web addresses' : k === 'phone' ? 'phone numbers' : 'email addresses');
const pct = (x: number) => `${Math.round(x * 100)}%`;

export interface ColumnSuggestion { columnIndex: number; header: string; profile: ColumnProfile; guess: Guess }

/** The whole table: one suggestion per column, with a rule that two columns never claim the same single-value field. */
export function suggestMapping(table: SheetTable): ColumnSuggestion[] {
  const out: ColumnSuggestion[] = table.columns.map((col, k) => {
    const profile = profileColumn(table.rows.map((r) => r[k]));
    return { columnIndex: k, header: col.header, profile, guess: guessColumn(col.header, profile) };
  });
  const SINGLE = new Set<FieldId>(['company.name', 'company.website_url', 'contact.name', 'contact.first_name', 'contact.last_name', 'contact.role', 'deal.title', 'deal.value', 'deal.stage', 'company.industry', 'company.description', 'company.city', 'company.address', 'company.email', 'company.phone', 'contact.email', 'contact.phone', 'contact.linkedin_url', 'contact.status', 'deal.meeting_at']);
  const rank = { high: 3, medium: 2, low: 1 };
  const winners = new Map<FieldId, number>();
  out.forEach((s, i) => {
    if (!SINGLE.has(s.guess.field)) return;
    const cur = winners.get(s.guess.field);
    if (cur === undefined || rank[s.guess.confidence] > rank[out[cur].guess.confidence] || (rank[s.guess.confidence] === rank[out[cur].guess.confidence] && s.profile.filled > out[cur].profile.filled)) winners.set(s.guess.field, i);
  });
  out.forEach((s, i) => {
    if (SINGLE.has(s.guess.field) && winners.get(s.guess.field) !== i) {
      s.guess = { field: 'custom', confidence: 'low', reason: `Another column fits "${FIELD_BY_ID.get(s.guess.field)!.label}" better; this one is kept as a custom field.`, alternatives: [s.guess.field, 'ignore'] };
    }
  });
  return out;
}


// ------------------------------------------------------------------ what is one row? (company list, people list or deals)

export type RowKindGuess = 'company' | 'contact' | 'deal';

export function inferRowKind(sug: ColumnSuggestion[], rows: number): RowKindGuess {
  const by = (f: FieldId) => sug.find((s) => s.guess.field === f);
  if (by('deal.title')) return 'deal';
  if (by('contact.first_name') || by('contact.last_name')) return 'contact';
  const co = by('company.name'), ct = by('contact.name');
  if (co && ct) {
    // a people list repeats company names and rarely leaves the person blank; a company list has one row per company
    const coRatio = co.profile.distinct / Math.max(1, co.profile.filled);
    const ctFilled = ct.profile.filled / Math.max(1, rows);
    const ctRatio = ct.profile.distinct / Math.max(1, ct.profile.filled);
    return ctFilled >= 0.5 && ctRatio >= 0.85 && coRatio <= 0.85 ? 'contact' : 'company';
  }
  if (co) return 'company';
  if (ct) return 'contact';
  return 'company';
}

const PERSONAL_WORDS = /(contact|person|hr|work|personal|mobile|cell|direct|manager|owner)/i;

/** A generic "Email"/"Phone" column belongs to whatever a row IS: the company in a company list, the person in a people list. */
export function retargetField(kind: RowKindGuess, field: FieldId, header: string, hasPerson = false): FieldId {
  // in a people list, and in a deal list that names a person on each row, a plain "Email"/"Phone" is the person's
  const personal = kind === 'contact' || (kind === 'deal' && hasPerson);
  if (personal) {
    if (field === 'company.email') return 'contact.email';
    if (field === 'company.phone') return 'contact.phone';
  } else {
    if (field === 'contact.email' && !PERSONAL_WORDS.test(header)) return 'company.email';
    if (field === 'contact.phone' && !PERSONAL_WORDS.test(header)) return 'company.phone';
  }
  return field;
}

export function suggestSetup(table: SheetTable): { suggestions: ColumnSuggestion[]; rowKind: RowKindGuess } {
  const suggestions = suggestMapping(table);
  const rowKind = inferRowKind(suggestions, table.rows.length);
  const hasPerson = suggestions.some((s) => s.guess.field === 'contact.name' || s.guess.field === 'contact.first_name' || s.guess.field === 'contact.last_name');
  for (const s of suggestions) s.guess = { ...s.guess, field: retargetField(rowKind, s.guess.field, s.header, hasPerson) };
  return { suggestions, rowKind };
}
