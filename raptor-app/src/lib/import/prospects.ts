// lib/import/prospects.ts
// "Companies go to BOTH places": besides the CRM company, an imported company becomes a PROSPECT (a row in prospect_dossiers) that every
// teammate's desktop app pulls on its next team sync and fills in by itself (website, emails, phones, people from the company's own pages).
//
// The prospect book has ONE record per company, found by the same key the desktop engine uses (raptor/prospects/book.py: canonical_key). That key is
// reimplemented here and checked against the Python original in tests/import_prospects.test.mjs, so a company imported here and the same company
// researched on a PC are the SAME record instead of two.

import type { CompanyRec, ContactRec } from './plan.ts';

const TWO_PART = new Set(['co.in', 'org.in', 'net.in', 'gov.in', 'ac.in', 'firm.in', 'gen.in', 'ind.in', 'co.uk', 'org.uk', 'ac.uk', 'gov.uk', 'com.au', 'net.au',
  'org.au', 'co.nz', 'co.za', 'com.br', 'com.sg', 'com.my', 'com.pk', 'com.bd', 'com.lk', 'com.np', 'co.jp', 'com.hk', 'com.cn', 'com.tr',
  'com.mx', 'com.ar', 'co.id', 'co.th', 'co.ke', 'co.ae', 'com.sa', 'com.eg', 'com.ng']);

const SUFFIXES = new Set(['pvt', 'private', 'ltd', 'limited', 'llp', 'llc', 'inc', 'incorporated', 'corp', 'corporation', 'co', 'company', 'gmbh', 'plc', 'sa', 'bv', 'ag', 'the']);

// Sites that host MANY companies or people: their address says nothing about which company it is.
const SHARED_HOSTS = new Set(['linkedin.com', 'facebook.com', 'instagram.com', 'twitter.com', 'x.com', 'youtube.com', 'github.com', 'medium.com', 'wordpress.com',
  'blogspot.com', 'wixsite.com', 'weebly.com', 'godaddysites.com', 'google.com', 'notion.site', 'linktr.ee', 'wa.me', 'whatsapp.com',
  'indiamart.com', 'justdial.com', 'tradeindia.com', 'exportersindia.com', 'alibaba.com', 'amazon.com', 'amazon.in', 'flipkart.com',
  'crunchbase.com', 'zaubacorp.com', 'tofler.in', 'wikipedia.org', 'bing.com', 'yahoo.com']);

export function bookDomain(urlOrHost: string): string {
  let text = (urlOrHost || '').trim().toLowerCase();
  if (!text) return '';
  if (!text.includes('://')) text = 'http://' + text;
  let host = '';
  try { host = new URL(text).hostname; } catch { return ''; }
  host = host.replace(/^\.+|\.+$/g, '');
  if (!host || !host.includes('.') || /^[\d.]+$/.test(host) || host.includes(':') || host.startsWith('[')) return '';
  const parts = host.split('.');
  if (parts.length >= 3 && TWO_PART.has(parts.slice(-2).join('.'))) return parts.slice(-3).join('.');
  return parts.slice(-2).join('.');
}

export function bookNormalizeName(name: string): string {
  const words = (name || '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  const kept = words.filter((w) => !SUFFIXES.has(w));
  return (kept.length ? kept : words).join(' ');
}

export interface DossierIdentity { url?: string; website?: string; company_name?: string; display_name?: string; target_type?: string }

export function canonicalKey(identity: DossierIdentity): string {
  const id = identity || {};
  const domain = id.target_type === 'person' ? '' : bookDomain(id.url || id.website || '');
  if (domain && !SHARED_HOSTS.has(domain)) return 'd:' + domain;
  const name = bookNormalizeName(id.display_name || id.company_name || '');
  return name ? 'n:' + name : '';
}

/** The keys the desktop files a company under: its canonical key and its plain name key. A company matches an existing prospect on ANY of them. */
export function allKeys(identity: DossierIdentity, entityName: string): string[] {
  const keys = [canonicalKey(identity)];
  for (const n of [entityName, identity.company_name, identity.display_name]) { const k = bookNormalizeName(n || ''); if (k) keys.push('n:' + k); }
  return [...new Set(keys.filter(Boolean))];
}

// ------------------------------------------------------------------ the prospect record

export interface ProspectRow {
  target_type: 'company';
  entity_name: string;
  company_key: string | null;
  company_id: string | null;
  icp_match_score: number;
  identity: Record<string, any>;
  intelligence: Record<string, any>;
  research: Record<string, any>;
  decision_makers: Record<string, any>[];
  assets: Record<string, any>;
  promoted_at: string | null;
}

const digits = (s: string) => s.replace(/\D/g, '');

/** What an imported company knows, in the shape the desktop's prospect card reads (every entry says it came from the import, and is marked "provided"). */
export function buildProspectRow(rec: CompanyRec, contacts: ContactRec[], companyId: string | null, fileLabel: string, nowIso: string): ProspectRow {
  const how = `from your import of ${fileLabel}`;
  const identity: Record<string, any> = { company_name: rec.name, target_type: 'company', url: rec.website_url || '', industry: rec.industry || '' };
  if (rec.description) identity.description = rec.description;
  const emails = [rec.email, ...rec.otherEmails].filter((e, i, a): e is string => !!e && a.indexOf(e) === i)
    .map((email) => ({ email, confidence: 'provided', how }));
  const phones = [rec.phone, ...rec.otherPhones].filter((p, i, a): p is string => !!p && a.findIndex((x) => digits(x || '') === digits(p)) === i)
    .map((number) => ({ number, e164: number.trim().startsWith('+') ? '+' + digits(number) : null, kind: 'phone', confidence: 'provided', how, ...(number.trim().startsWith('+') ? {} : { note: 'no country code in the file' }) }));
  const locations = rec.address || rec.city
    ? [{ kind: 'headquarters', address: rec.address || rec.city, ...(rec.city ? { city: rec.city } : {}), confidence: 'provided', how }]
    : [];
  const people = contacts.filter((c) => c.name).map((c) => ({ name: c.name, title: c.custom['Job title'] || '', confidence: 'provided', how, ...(c.email ? { email: c.email } : {}) }));
  return {
    target_type: 'company',
    entity_name: rec.name,
    company_key: canonicalKey(identity) || null,
    company_id: companyId,
    icp_match_score: 0,
    identity,
    intelligence: { icp_match_score: 0, buying_signals: [] },
    research: { details: { company: {}, emails, phones, locations } },
    decision_makers: people,
    assets: {},
    promoted_at: companyId ? nowIso : null,   // it IS in the CRM already, so the desktop must not "promote" it again and make a second company
  };
}
