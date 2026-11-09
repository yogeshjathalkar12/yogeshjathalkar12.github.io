// lib/import/plan.ts
// From mapped tables to a PLAN: which companies / contacts / deals will be created, which existing records get empty fields
// filled, which rows are set aside and why. Nothing here talks to the network or writes anything, so the preview the person sees
// is computed by the very same code that the import then executes.
//
// Rules (all general, none about one file):
//   * One company = one key: the normalised name (case, punctuation, "Pvt. Ltd." / "Inc" ignored). Same key inside the file(s)
//     is merged (first non-empty value wins, several emails/phones all kept); same key as a CRM company means "update that one,
//     fill empty fields only".
//   * Near-matches ("Xpressbee Tech Hub" / "Xpressbees") and shared website addresses are only SUGGESTED. They are never merged
//     unless the person says so (`links`).
//   * A value that is a placeholder ("Address not found") counts as empty. A value that cannot be right (a phone that Excel turned
//     into -65794813.19) is dropped with a note, never stored.
//   * Several emails/phones in one cell: the first is primary, the rest are kept in "Other emails"/"Other phones" custom fields.

import { cleanText, parseEmails, parsePhones, parseUrl, parsePeople, parseNumber, parseDate, normalizeCompanyName, nameSimilarity } from './values.ts';
import type { DateOrder } from './values.ts';
import type { FieldId } from './columnGuess.ts';
import type { SheetTable } from './sheetShape.ts';
import { allKeys, bookNormalizeName } from './prospects.ts';

export type Entity = 'company' | 'contact' | 'deal';
export type RowKind = Entity;

export interface ColumnChoice { field: FieldId; customEntity?: Entity; customName?: string }
export interface TableSetup { table: SheetTable; choices: ColumnChoice[]; rowKind: RowKind }
export interface ImportOptions {
  dateOrder: DateOrder;
  extraPlaceholders: Set<string>;
  stageMap: Record<string, string>;    // lower-cased raw value -> stage key
  stageKeys: Set<string>;
  defaultStage: string;
}

export interface SourceRef { sheet: string; row: number }

export interface CompanyRec {
  key: string; name: string; website_url?: string; domain?: string; email?: string; phone?: string; address?: string; city?: string;
  industry?: string; description?: string; custom: Record<string, string>; otherEmails: string[]; otherPhones: string[]; rows: SourceRef[];
}
export interface ContactRec {
  key: string; name: string; first_name?: string; last_name?: string; email?: string; phone?: string; linkedin_url?: string; status?: string;
  custom: Record<string, string>; otherEmails: string[]; otherPhones: string[]; companyKey: string | null; rows: SourceRef[];
}
export interface DealRec {
  title: string; value: number; stage: string; meeting_at?: string; custom: Record<string, string>;
  companyKey: string | null; contactKey: string | null; rows: SourceRef[];
}

export interface RowOutcome { sheet: string; row: number; status: 'skipped' | 'fixed'; messages: string[] }

export interface Parsed {
  companies: Map<string, CompanyRec>;
  contacts: Map<string, ContactRec>;
  deals: DealRec[];
  outcomes: RowOutcome[];
  rowsRead: number;
  rowsUsed: number;
  merged: { companies: number; contacts: number };
  conflicts: number;           // two rows disagreed on a single value; the first was kept
}

const SINGLE_COMPANY = ['website_url', 'email', 'phone', 'address', 'city', 'industry', 'description'] as const;

const personKey = (name: string) => name.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

const titleCase = (s: string) => s.replace(/\b\p{L}/gu, (c) => c.toUpperCase());

function nameFromEmail(email: string): string {
  return titleCase(email.split('@')[0].replace(/[._\-+0-9]+/g, ' ').trim()) || email;
}

// ------------------------------------------------------------------ rows -> records

export function parseTables(setups: TableSetup[], opts: ImportOptions): Parsed {
  const out: Parsed = { companies: new Map(), contacts: new Map(), deals: [], outcomes: [], rowsRead: 0, rowsUsed: 0, merged: { companies: 0, contacts: 0 }, conflicts: 0 };

  for (const setup of setups) {
    const { table, choices, rowKind } = setup;
    table.rows.forEach((cells, ri) => {
      out.rowsRead++;
      const ref: SourceRef = { sheet: table.name, row: table.rowNumbers[ri] };
      const msgs: string[] = [];
      const f: Partial<Record<FieldId, string>> = {};
      const customs: { entity: Entity; name: string; value: string }[] = [];
      choices.forEach((ch, c) => {
        if (ch.field === 'ignore') return;
        const v = cleanText(cells[c], opts.extraPlaceholders);
        if (!v) return;
        if (ch.field === 'custom') {
          customs.push({ entity: ch.customEntity || rowKind, name: (ch.customName || table.columns[c].header).trim(), value: v });
        } else if (!f[ch.field]) f[ch.field] = v;
      });

      // --- company
      const companyName = f['company.name'];
      let company: CompanyRec | null = null;
      if (companyName) {
        company = { key: normalizeCompanyName(companyName), name: companyName, custom: {}, otherEmails: [], otherPhones: [], rows: [ref] };
        const email = f['company.email'] ? parseEmails(f['company.email']) : null;
        if (email) { company.email = email.primary ?? undefined; company.otherEmails = email.others; email.problems.forEach((p) => msgs.push(`Company email left out: ${p}`)); }
        const phone = f['company.phone'] ? parsePhones(f['company.phone']) : null;
        if (phone) { company.phone = phone.primary ?? undefined; company.otherPhones = phone.others; phone.problems.forEach((p) => msgs.push(`Company phone left out: ${p}`)); }
        const url = f['company.website_url'] ? parseUrl(f['company.website_url']) : null;
        if (url) { company.website_url = url.url ?? undefined; company.domain = url.domain ?? undefined; url.problems.forEach((p) => msgs.push(`Website left out: ${p}`)); }
        for (const k of ['address', 'city', 'industry', 'description'] as const) { const v = f[`company.${k}` as FieldId]; if (v) company[k] = v; }
      }

      // --- contacts
      const contacts: ContactRec[] = [];
      const cEmail = f['contact.email'] ? parseEmails(f['contact.email']) : null;
      const cPhone = f['contact.phone'] ? parsePhones(f['contact.phone']) : null;
      cEmail?.problems.forEach((p) => msgs.push(`Contact email left out: ${p}`));
      cPhone?.problems.forEach((p) => msgs.push(`Contact phone left out: ${p}`));
      const emails = cEmail ? [cEmail.primary, ...cEmail.others].filter(Boolean) as string[] : [];
      const phones = cPhone ? [cPhone.primary, ...cPhone.others].filter(Boolean) as string[] : [];
      let people = f['contact.name'] ? parsePeople(f['contact.name']).people : [];
      if (!people.length && (f['contact.first_name'] || f['contact.last_name'])) {
        const first = f['contact.first_name'] || '', last = f['contact.last_name'] || '';
        const name = `${first} ${last}`.trim();
        people = [{ name, first, last, role: null, honorific: null }];
      }
      if (!people.length && emails.length) people = [{ name: nameFromEmail(emails[0]), first: '', last: '', role: null, honorific: null }];
      const pairEmails = people.length > 1 && emails.length === people.length;
      const pairPhones = people.length > 1 && phones.length === people.length;
      if (people.length > 1 && (emails.length > 1 && !pairEmails || phones.length > 1 && !pairPhones)) msgs.push('Several people and a different number of emails/phones: all were given to the first person.');
      people.forEach((p, i) => {
        const em = pairEmails ? [emails[i]] : i === 0 ? emails : [];
        const ph = pairPhones ? [phones[i]] : i === 0 ? phones : [];
        const rec: ContactRec = {
          key: '', name: p.name, first_name: p.first || undefined, last_name: p.last || undefined, email: em[0], phone: ph[0],
          linkedin_url: undefined, custom: {}, otherEmails: em.slice(1), otherPhones: ph.slice(1), companyKey: company ? company.key : null, rows: [ref],
        };
        const role = f['contact.role'] || p.role;
        if (role) rec.custom['Job title'] = role;
        if (i === 0 && f['contact.linkedin_url']) { const u = parseUrl(f['contact.linkedin_url']); if (u.url) rec.linkedin_url = u.url; else u.problems.forEach((x) => msgs.push(`LinkedIn left out: ${x}`)); }
        if (i === 0 && f['contact.status']) {
          const s = f['contact.status'].toLowerCase();
          if (['cold', 'active', 'hot', 'new'].includes(s)) rec.status = s; else msgs.push(`Status "${f['contact.status']}" is not one of cold / active / hot, left as default.`);
        }
        rec.key = rec.email ? `e:${rec.email}` : `n:${personKey(rec.name)}|${rec.companyKey ?? ''}`;
        contacts.push(rec);
      });

      // --- deal
      let deal: DealRec | null = null;
      if (f['deal.title']) {
        const v = f['deal.value'] ? parseNumber(f['deal.value']) : null;
        if (v?.problem) msgs.push(`Deal value left at 0: ${v.problem}`);
        const rawStage = (f['deal.stage'] || '').trim().toLowerCase();
        let stage = opts.defaultStage;
        if (rawStage) {
          if (opts.stageMap[rawStage]) stage = opts.stageMap[rawStage];
          else if (opts.stageKeys.has(rawStage)) stage = rawStage;
          else msgs.push(`Stage "${f['deal.stage']}" has no match in your pipeline, put in "${opts.defaultStage}".`);
        }
        let meeting: string | undefined;
        if (f['deal.meeting_at']) {
          const d = parseDate(f['deal.meeting_at'], opts.dateOrder);
          if (d.value) { meeting = d.value; if (d.ambiguous) msgs.push(`Date "${f['deal.meeting_at']}" could be day-first or month-first.`); } else if (d.problem) msgs.push(`Meeting date left out: ${d.problem}`);
        }
        deal = { title: f['deal.title'], value: v?.value ?? 0, stage, meeting_at: meeting, custom: {}, companyKey: company ? company.key : null, contactKey: contacts[0]?.key ?? null, rows: [ref] };
      }

      // --- custom field columns go to the entity they were assigned to
      for (const c of customs) {
        const target = c.entity === 'company' ? company : c.entity === 'contact' ? contacts[0] : deal;
        if (target) (target.custom[c.name] = target.custom[c.name] ?? c.value);
        else msgs.push(`"${c.name}" kept nowhere: this row has no ${c.entity}.`);
      }

      // --- is the row usable? what it must have depends on what a row means in this table
      const missing = rowKind === 'company' ? (!company ? 'a company name' : '') : rowKind === 'contact' ? (!contacts.length ? 'a contact name or email' : '') : (!deal ? 'a deal title' : '');
      if (missing) { out.outcomes.push({ ...ref, status: 'skipped', messages: [`This row has no ${missing.replace(/^a /, '')}.`, ...msgs] }); return; }

      out.rowsUsed++;
      if (msgs.length) out.outcomes.push({ ...ref, status: 'fixed', messages: msgs });

      if (company) addCompany(out, company);
      for (const ct of contacts) addContact(out, ct);
      if (deal) out.deals.push(deal);
    });
  }
  // multi-value overflow becomes custom fields, so nothing the person typed is lost
  for (const c of out.companies.values()) overflow(c);
  for (const c of out.contacts.values()) overflow(c);
  return out;
}

function overflow(r: { custom: Record<string, string>; otherEmails: string[]; otherPhones: string[]; email?: string; phone?: string }) {
  const em = [...new Set(r.otherEmails.filter((e) => e !== r.email))];
  const ph = [...new Set(r.otherPhones.filter((p) => p.replace(/\D/g, '') !== (r.phone || '').replace(/\D/g, '')))];
  if (em.length) r.custom['Other emails'] = em.join('; ');
  if (ph.length) r.custom['Other phones'] = ph.join('; ');
}

function addCompany(out: Parsed, c: CompanyRec) {
  const have = out.companies.get(c.key);
  if (!have) { out.companies.set(c.key, c); return; }
  out.merged.companies++;
  have.rows.push(...c.rows);
  for (const k of SINGLE_COMPANY) {
    if (!c[k]) continue;
    if (!have[k]) have[k] = c[k];
    else if (have[k] !== c[k]) {
      out.conflicts++;
      if (k === 'email') have.otherEmails.push(c.email!);
      if (k === 'phone') have.otherPhones.push(c.phone!);
    }
  }
  if (!have.domain && c.domain) have.domain = c.domain;
  have.otherEmails.push(...c.otherEmails); have.otherPhones.push(...c.otherPhones);
  for (const [k, v] of Object.entries(c.custom)) if (!have.custom[k]) have.custom[k] = v;
}

function addContact(out: Parsed, c: ContactRec) {
  const have = out.contacts.get(c.key);
  if (!have) { out.contacts.set(c.key, c); return; }
  out.merged.contacts++;
  have.rows.push(...c.rows);
  for (const k of ['phone', 'linkedin_url', 'status', 'first_name', 'last_name'] as const) {
    if (!c[k]) continue;
    if (!have[k]) have[k] = c[k];
    else if (have[k] !== c[k]) { out.conflicts++; if (k === 'phone') have.otherPhones.push(c.phone!); }
  }
  have.otherEmails.push(...c.otherEmails); have.otherPhones.push(...c.otherPhones);
  for (const [k, v] of Object.entries(c.custom)) if (!have.custom[k]) have.custom[k] = v;
}

// ------------------------------------------------------------------ suggestions

export interface Existing {
  companies: { id: string; name: string; website_url: string | null; phone: string | null; email: string | null; address: string | null; city: string | null; industry: string | null; description: string | null; custom_fields: Record<string, any> | null; created_at?: string }[];
  contacts: { id: string; name: string; email: string | null; phone: string | null; company_id: string | null; first_name: string | null; last_name: string | null; linkedin_url: string | null; custom_fields: Record<string, any> | null }[];
  deals: { id: string; title: string; company_id: string | null }[];
  dossiers?: { id: string; entity_name: string; company_key: string | null; company_id: string | null }[];   // the prospect book (prospect_dossiers)
  defs: Record<Entity, Map<string, string>>;   // lower-cased custom field name -> def id
}

export interface Suggestion {
  id: string;
  score: number;
  reason: string;            // "very similar name" | "same website"
  file: { key: string; name: string };
  other: { kind: 'existing'; id: string; name: string } | { kind: 'file'; key: string; name: string };
}

/** A decision the person took on a suggestion: "yes, same company". Anything not listed here stays separate. */
export type Links = Record<string, { existingId?: string; intoKey?: string }>;

const prefixes = (key: string) => [...new Set(key.split(' ').filter((t) => t.length >= 3).map((t) => t.slice(0, 4)))];

export function findSuggestions(parsed: Parsed, existing: Existing): Suggestion[] {
  const out: Suggestion[] = [];
  const idx = new Map<string, { kind: 'existing' | 'file'; key: string; id?: string; name: string; domain?: string }[]>();
  const add = (e: { kind: 'existing' | 'file'; key: string; id?: string; name: string; domain?: string }) => {
    for (const p of prefixes(e.key)) { const a = idx.get(p) || []; a.push(e); idx.set(p, a); }
  };
  const existingKeys = new Set<string>();
  for (const c of existing.companies) { const key = normalizeCompanyName(c.name); existingKeys.add(key); add({ kind: 'existing', key, id: c.id, name: c.name, domain: undefined }); }
  for (const c of parsed.companies.values()) add({ kind: 'file', key: c.key, name: c.name, domain: c.domain });
  const seen = new Set<string>();
  for (const c of parsed.companies.values()) {
    if (existingKeys.has(c.key)) continue; // exact match: handled as an update, nothing to suggest
    const cands = new Map<string, { kind: 'existing' | 'file'; key: string; id?: string; name: string }>();
    for (const p of prefixes(c.key)) for (const e of idx.get(p) || []) if (!(e.kind === 'file' && e.key === c.key)) cands.set(`${e.kind}:${e.id ?? e.key}`, e);
    let best: { score: number; e: { kind: 'existing' | 'file'; key: string; id?: string; name: string } } | null = null;
    for (const e of cands.values()) {
      if (e.kind === 'file' && e.key === c.key) continue;
      const s = nameSimilarity(c.key, e.key);
      if (s >= 0.8 && (!best || s > best.score)) best = { score: s, e };
    }
    if (best) {
      const pair = [c.key, best.e.kind === 'file' ? best.e.key : best.e.id].sort().join('|');
      if (!seen.has(pair)) {
        seen.add(pair);
        out.push({ id: `s${out.length}`, score: best.score, reason: 'very similar name', file: { key: c.key, name: c.name }, other: best.e.kind === 'existing' ? { kind: 'existing', id: best.e.id!, name: best.e.name } : { kind: 'file', key: best.e.key, name: best.e.name } });
      }
    }
  }
  // same website under different names
  const byDomain = new Map<string, CompanyRec[]>();
  for (const c of parsed.companies.values()) if (c.domain) byDomain.set(c.domain, [...(byDomain.get(c.domain) || []), c]);
  for (const list of byDomain.values()) {
    for (let i = 1; i < list.length; i++) {
      const pair = [list[0].key, list[i].key].sort().join('|');
      if (seen.has(pair)) continue;
      seen.add(pair);
      out.push({ id: `s${out.length}`, score: 0.7, reason: 'same website', file: { key: list[i].key, name: list[i].name }, other: { kind: 'file', key: list[0].key, name: list[0].name } });
    }
  }
  return out.sort((a, b) => b.score - a.score).slice(0, 300);
}

/** Merges file companies the person said are the same. Contacts and deals follow their company. */
export function applyFileLinks(parsed: Parsed, links: Links): Parsed {
  const target = (key: string): string => { let k = key, hops = 0; while (links[k]?.intoKey && hops++ < 20) k = links[k].intoKey!; return k; };
  const next: Parsed = { ...parsed, companies: new Map(), contacts: new Map(), deals: [], merged: { ...parsed.merged }, conflicts: parsed.conflicts };
  for (const c of parsed.companies.values()) {
    const t = target(c.key);
    if (t === c.key || !parsed.companies.has(t)) { next.companies.set(c.key, { ...c, custom: { ...c.custom }, otherEmails: [...c.otherEmails], otherPhones: [...c.otherPhones], rows: [...c.rows] }); continue; }
  }
  for (const c of parsed.companies.values()) {
    const t = target(c.key);
    if (t !== c.key && parsed.companies.has(t) && next.companies.has(t)) addCompany(next, { ...c, key: t });
  }
  const remap = (k: string | null) => (k ? (parsed.companies.has(target(k)) ? target(k) : k) : null);
  for (const ct of parsed.contacts.values()) {
    const rec = { ...ct, companyKey: remap(ct.companyKey), custom: { ...ct.custom }, otherEmails: [...ct.otherEmails], otherPhones: [...ct.otherPhones], rows: [...ct.rows] };
    if (!rec.email) rec.key = `n:${personKey(rec.name)}|${rec.companyKey ?? ''}`;
    addContact(next, rec);
  }
  for (const d of parsed.deals) next.deals.push({ ...d, companyKey: remap(d.companyKey) });
  for (const c of next.companies.values()) overflow(c);
  for (const c of next.contacts.values()) overflow(c);
  return next;
}

// ------------------------------------------------------------------ the plan against the CRM

export interface CompanyCreate { id: string; rec: CompanyRec }
export interface ContactCreate { id: string; companyId: string | null; rec: ContactRec }
export interface DealCreate { id: string; companyId: string | null; contactId: string | null; rec: DealRec }
export interface ProspectCreate { id: string; entityName: string; companyId: string | null; rec: CompanyRec; contacts: ContactRec[] }
export interface UpdatePlan { table: 'companies' | 'contacts'; id: string; name: string; patch: Record<string, string> }   // keys: column or 'cf:<defId>' or 'cfnew:<entity>:<name>'

export interface Plan {
  companies: { create: CompanyCreate[]; update: UpdatePlan[]; unchanged: number };
  contacts: { create: ContactCreate[]; update: UpdatePlan[]; unchanged: number };
  deals: { create: DealCreate[]; skipped: number };
  prospects: { create: ProspectCreate[]; alreadyThere: number; sharedSite: number };
  newCustomFields: { entity: Entity; name: string }[];
  outcomes: RowOutcome[];
  counts: { rowsRead: number; rowsUsed: number; skipped: number; fixed: number; mergedInFile: number; conflicts: number };
}

const COMPANY_COLS = ['website_url', 'phone', 'email', 'address', 'city', 'industry', 'description'] as const;
const isEmptyVal = (v: any) => v === null || v === undefined || v === '' || (typeof v === 'string' && v.trim() === '');

function customPatch(entity: Entity, custom: Record<string, string>, existingCustom: Record<string, any> | null, defs: Map<string, string>, wanted: Set<string>): Record<string, string> {
  const patch: Record<string, string> = {};
  for (const [name, value] of Object.entries(custom)) {
    const id = defs.get(name.toLowerCase());
    if (id) { if (isEmptyVal(existingCustom?.[id])) patch[`cf:${id}`] = value; } else { patch[`cfnew:${entity}:${name}`] = value; wanted.add(`${entity}\u0000${name}`); }
  }
  return patch;
}

export function planImport(parsed: Parsed, existing: Existing, links: Links = {}, newId: () => string = () => crypto.randomUUID(), opts: { prospects?: boolean } = {}): Plan {
  const wanted = new Set<string>();
  const exByKey = new Map<string, Existing['companies'][number]>();
  for (const c of [...existing.companies].sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')))) {
    const k = normalizeCompanyName(c.name);
    if (!exByKey.has(k)) exByKey.set(k, c);
  }
  const exById = new Map(existing.companies.map((c) => [c.id, c]));

  const plan: Plan = {
    companies: { create: [], update: [], unchanged: 0 }, contacts: { create: [], update: [], unchanged: 0 }, deals: { create: [], skipped: 0 },
    prospects: { create: [], alreadyThere: 0, sharedSite: 0 },
    newCustomFields: [], outcomes: parsed.outcomes,
    counts: { rowsRead: parsed.rowsRead, rowsUsed: parsed.rowsUsed, skipped: parsed.outcomes.filter((o) => o.status === 'skipped').length, fixed: parsed.outcomes.filter((o) => o.status === 'fixed').length, mergedInFile: parsed.merged.companies + parsed.merged.contacts, conflicts: parsed.conflicts },
  };

  // companies -> an id each (existing or new)
  const companyId = new Map<string, string>();
  for (const c of parsed.companies.values()) {
    const link = links[c.key];
    const match = (link?.existingId && exById.get(link.existingId)) || exByKey.get(c.key);
    if (match) {
      companyId.set(c.key, match.id);
      const patch: Record<string, string> = {};
      for (const col of COMPANY_COLS) { const v = c[col]; if (v && isEmptyVal((match as any)[col])) patch[col] = v; }
      Object.assign(patch, customPatch('company', c.custom, match.custom_fields, existing.defs.company, wanted));
      if (Object.keys(patch).length) plan.companies.update.push({ table: 'companies', id: match.id, name: match.name, patch }); else plan.companies.unchanged++;
    } else {
      const id = newId();
      companyId.set(c.key, id);
      plan.companies.create.push({ id, rec: c });
      for (const name of Object.keys(c.custom)) if (!existing.defs.company.has(name.toLowerCase())) wanted.add(`company\u0000${name}`);
    }
  }

  // contacts: by email first, then name within the same company (the same rule the app's own forms use)
  const exByEmail = new Map<string, Existing['contacts'][number]>();
  const exByName = new Map<string, Existing['contacts'][number]>();
  for (const c of existing.contacts) {
    if (c.email) exByEmail.set(c.email.trim().toLowerCase(), c);
    exByName.set(`${personKey(c.name)}|${c.company_id ?? ''}`, c);
  }
  const contactId = new Map<string, string>();
  for (const c of parsed.contacts.values()) {
    const cid = c.companyKey ? companyId.get(c.companyKey) ?? null : null;
    const match = (c.email && exByEmail.get(c.email)) || exByName.get(`${personKey(c.name)}|${cid ?? ''}`);
    if (match) {
      contactId.set(c.key, match.id);
      const patch: Record<string, string> = {};
      if (c.first_name && isEmptyVal(match.first_name)) patch.first_name = c.first_name;
      if (c.last_name && isEmptyVal(match.last_name)) patch.last_name = c.last_name;
      if (c.email && isEmptyVal(match.email)) patch.email = c.email;
      if (c.phone && isEmptyVal(match.phone)) patch.phone = c.phone;
      if (c.linkedin_url && isEmptyVal(match.linkedin_url)) patch.linkedin_url = c.linkedin_url;
      if (cid && isEmptyVal(match.company_id)) patch.company_id = cid;   // an existing or a just-created company
      Object.assign(patch, customPatch('contact', c.custom, match.custom_fields, existing.defs.contact, wanted));
      if (Object.keys(patch).length) plan.contacts.update.push({ table: 'contacts', id: match.id, name: match.name, patch }); else plan.contacts.unchanged++;
    } else {
      const id = newId();
      contactId.set(c.key, id);
      plan.contacts.create.push({ id, companyId: cid, rec: c });
      for (const name of Object.keys(c.custom)) if (!existing.defs.contact.has(name.toLowerCase())) wanted.add(`contact\u0000${name}`);
    }
  }

  // deals: the same title at the same company is "already there"
  const exDeal = new Set(existing.deals.map((d) => `${normalizeCompanyName(d.title)}|${d.company_id ?? ''}`));
  const seenDeal = new Set<string>();
  for (const d of parsed.deals) {
    const cid = d.companyKey ? companyId.get(d.companyKey) ?? null : null;
    const k = `${normalizeCompanyName(d.title)}|${cid ?? ''}`;
    if (exDeal.has(k) || seenDeal.has(k)) { plan.deals.skipped++; continue; }
    seenDeal.add(k);
    plan.deals.create.push({ id: newId(), companyId: cid, contactId: d.contactKey ? contactId.get(d.contactKey) ?? null : null, rec: d });
    for (const name of Object.keys(d.custom)) if (!existing.defs.deal.has(name.toLowerCase())) wanted.add(`deal\u0000${name}`);
  }

  // prospects: every company of the file that is not in the prospect book yet (by website, by name, or because a prospect already points at that CRM company)
  if (opts.prospects) {
    const known = new Set<string>(), names = new Set<string>(), linked = new Set<string>(), thisImport = new Set<string>();
    for (const d of existing.dossiers || []) {
      if (d.company_key) known.add(d.company_key);
      const nk = bookNormalizeName(d.entity_name); if (nk) known.add('n:' + nk);
      names.add(d.entity_name.toLowerCase());
      if (d.company_id) linked.add(d.company_id);
    }
    const byCompany = new Map<string, ContactRec[]>();
    for (const ct of parsed.contacts.values()) if (ct.companyKey) byCompany.set(ct.companyKey, [...(byCompany.get(ct.companyKey) || []), ct]);
    for (const c of parsed.companies.values()) {
      const id = companyId.get(c.key) ?? null;
      const keys = allKeys({ url: c.website_url, company_name: c.name }, c.name);
      if ((id && linked.has(id)) || names.has(c.name.toLowerCase()) || keys.some((k) => known.has(k))) { plan.prospects.alreadyThere++; continue; }
      if (keys.some((k) => thisImport.has(k))) { plan.prospects.sharedSite++; continue; }
      keys.forEach((k) => thisImport.add(k));
      plan.prospects.create.push({ id: newId(), entityName: c.name, companyId: id, rec: c, contacts: byCompany.get(c.key) || [] });
    }
  }

  plan.newCustomFields = [...wanted].map((w) => { const [entity, name] = w.split('\u0000'); return { entity: entity as Entity, name }; });
  return plan;
}

// ------------------------------------------------------------------ small helpers for the screens

export interface StageInfo { key: string; label: string; type: 'open' | 'won' | 'lost' }

/** Best pipeline stage for a raw value from a file, or null when none is clear. */
export function suggestStage(raw: string, stages: StageInfo[]): string | null {
  const v = raw.trim().toLowerCase();
  if (!v) return null;
  for (const s of stages) if (s.key.toLowerCase() === v || s.label.toLowerCase() === v) return s.key;
  const has = (re: RegExp) => re.test(v);
  const byType = (t: StageInfo['type']) => stages.find((s) => s.type === t)?.key ?? null;
  if (has(/\b(won|closed.?won|signed|converted|customer|success)/)) return byType('won');
  if (has(/\b(lost|closed.?lost|dead|rejected|declined|churn|disqualif)/)) return byType('lost');
  for (const s of stages) { const l = s.label.toLowerCase(); if (l.includes(v) || (v.length >= 4 && v.includes(s.key.toLowerCase()))) return s.key; }
  if (has(/\b(new|lead|prospect|cold|open|fresh|inbound)/)) return stages.find((s) => s.type === 'open')?.key ?? null;
  return null;
}

export function distinctValues(setups: TableSetup[], field: FieldId): { value: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const s of setups) {
    const idx = s.choices.findIndex((c) => c.field === field);
    if (idx < 0) continue;
    for (const r of s.table.rows) { const v = cleanText(r[idx]); if (v) counts.set(v, (counts.get(v) || 0) + 1); }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([value, count]) => ({ value, count }));
}

/** What a row means, guessed from what was mapped (the wizard uses suggestSetup, which also looks at the values). */
export function guessRowKind(choices: ColumnChoice[]): RowKind {
  const has = (p: string) => choices.some((c) => c.field.startsWith(p));
  if (has('deal.title')) return 'deal';
  if (has('contact.first_name') || has('contact.last_name')) return 'contact';
  if (has('company.name')) return 'company';
  if (has('contact.')) return 'contact';
  return 'company';
}
