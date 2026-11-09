// lib/import/values.ts
// Turns one raw cell into a clean value, or says why it cannot. Pure functions, no network, no assumptions about a country:
// nothing here knows India, rupees or day-first dates; where the text is ambiguous the function says so instead of guessing.

// ------------------------------------------------------------------ empty and placeholder text

const PLACEHOLDER_EXACT = new Set([
  '', '-', '--', '---', '—', '–', '.', '..', '...', '?', '??', 'n/a', 'na', 'n.a.', 'n.a', 'nil', 'none', 'null', 'nan', 'undefined',
  'unknown', 'tbd', 'tba', 'not available', 'not applicable', 'not found', 'not provided', 'not listed', 'not specified',
  'not verified', 'unverified', 'missing', 'blank', 'empty', 'no data', 'no info', 'no information', '#n/a', '#value!', '#ref!',
  '#name?', '#div/0!', '#null!', '#num!',
]);
const PLACEHOLDER_PATTERNS: RegExp[] = [
  /^(address|email|e-mail|phone|mobile|contact|website|url|name|number|info|data)\s*(is\s*)?(not\s*(found|available|provided|listed|verified|public)|unavailable|missing|n\/a)\b/i,
  /^not\s+(found|available|provided|listed|verified|public)\b/i,
  /^no\s+(data|info|information|email|phone|address|website|contact)\b/i,
  /^(unable|could not|couldn't|cannot|can't)\s+(to\s+)?(find|verify|locate)\b/i,
  /^[-–—_=*.\s]+$/,
];

export function isPlaceholder(raw: string | null | undefined): boolean {
  if (raw === null || raw === undefined) return true;
  const s = String(raw).replace(/\s+/g, ' ').trim().toLowerCase();
  if (PLACEHOLDER_EXACT.has(s)) return true;
  return PLACEHOLDER_PATTERNS.some((re) => re.test(s));
}

/** Trimmed text, or '' when the cell holds nothing real (blank or a placeholder). Extra placeholders can be passed in. */
export function cleanText(raw: string | null | undefined, extraPlaceholders?: Set<string>): string {
  if (raw === null || raw === undefined) return '';
  const s = String(raw).replace(/ /g, ' ').replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim();
  if (isPlaceholder(s)) return '';
  if (extraPlaceholders && extraPlaceholders.has(s.toLowerCase())) return '';
  return s;
}

// ------------------------------------------------------------------ email

const EMAIL_IN_TEXT = /[A-Za-z0-9._%+'-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)*\.[A-Za-z]{2,}/g;

export interface EmailResult { primary: string | null; others: string[]; problems: string[] }

/** Every address in a cell ("a@x.com; b@y.com / c@z.com", "Name <a@x.com>"). First is primary, the rest are kept. */
export function parseEmails(raw: string): EmailResult {
  const text = cleanText(raw);
  if (!text) return { primary: null, others: [], problems: [] };
  const found = (text.match(EMAIL_IN_TEXT) || []).map((e) => e.toLowerCase().replace(/^[.']+|[.']+$/g, ''));
  const seen = new Set<string>();
  const list = found.filter((e) => (seen.has(e) ? false : (seen.add(e), true)));
  const problems: string[] = [];
  if (!list.length) problems.push(`"${text.length > 40 ? text.slice(0, 40) + '…' : text}" is not an email address`);
  return { primary: list[0] ?? null, others: list.slice(1), problems };
}

// ------------------------------------------------------------------ phone

export interface PhoneItem { value: string; digits: number }
export interface PhoneResult { primary: string | null; others: string[]; problems: string[] }

/** One phone-looking piece: '+91 98765 43210', '020-2567 1234', '9876543210.0' ... Returns null with a reason when impossible. */
export function cleanOnePhone(piece: string): { value: string } | { problem: string } {
  let s = piece.trim();
  if (!s) return { problem: 'empty' };
  // Excel stores a number typed into a General cell as a double: "9876543210.0" is harmless, "-65794813.19" is garbage.
  if (/^-?\d+\.\d+$/.test(s)) {
    if (/^\d+\.0+$/.test(s)) s = s.replace(/\.0+$/, '');
    else return { problem: `"${piece.trim()}" is a calculated number, not a phone number (Excel changed it)` };
  }
  if (/^-\d+$/.test(s)) return { problem: `"${piece.trim()}" is negative, so it is not a phone number` };
  if (/^\d(\.\d+)?e[+-]?\d+$/i.test(s)) return { problem: `"${piece.trim()}" was turned into scientific notation by Excel, the real digits are lost` };
  // drop an extension and anything after it
  s = s.replace(/\s*(ext\.?|extn\.?|x)\s*\d+\s*$/i, '');
  // a phone is digits with separators, optionally led by + or 00, optionally with a (0) trunk digit
  if (/[A-Za-z]{3,}/.test(s)) return { problem: `"${piece.trim()}" contains words, not just a number` };
  const international = /^\s*\+/.test(s) || /^\s*00\d/.test(s);
  let digits = s.replace(/\(0\)/g, '').replace(/\D/g, '');
  if (/^\s*00\d/.test(s)) digits = digits.slice(2);
  const n = digits.length;
  if (n < 6) return { problem: `"${piece.trim()}" has too few digits for a phone number` };
  if (n > 15) return { problem: `"${piece.trim()}" has too many digits for a phone number` };
  let spaced = s.replace(/\s+/g, ' ').trim();
  if (international && !spaced.startsWith('+')) spaced = '+' + spaced.replace(/^00\s*/, '');
  return { value: spaced };
}

const PHONE_SPLIT = /\s*(?:[;\n|]|\s\/\s|\/(?=\s*\+?\d)|,(?=\s*\+?\(?\d)|\s+(?:or|and|&)\s+)\s*/i;

export function parsePhones(raw: string): PhoneResult {
  const text = cleanText(raw);
  if (!text) return { primary: null, others: [], problems: [] };
  // keep a lone number intact; only split when it is clearly several (a comma inside "12,345" is not a separator)
  const pieces = text.split(PHONE_SPLIT).map((p) => p.trim()).filter(Boolean);
  const good: string[] = [];
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const p of pieces) {
    const r = cleanOnePhone(p);
    if ('problem' in r) { problems.push(r.problem); continue; }
    const key = r.value.replace(/\D/g, '');
    if (seen.has(key)) continue;
    seen.add(key);
    good.push(r.value);
  }
  return { primary: good[0] ?? null, others: good.slice(1), problems };
}

// ------------------------------------------------------------------ web address

const MULTI_PART_SUFFIX = new Set(['co.in', 'co.uk', 'org.uk', 'ac.uk', 'gov.uk', 'com.au', 'net.au', 'org.au', 'co.nz', 'co.za', 'com.br', 'com.mx', 'com.sg', 'com.my', 'com.hk', 'com.cn', 'com.tr', 'co.jp', 'co.kr', 'co.id', 'com.pk', 'com.bd', 'com.np', 'com.lk', 'ac.in', 'org.in', 'net.in', 'gov.in', 'edu.in', 'firm.in', 'gen.in', 'ind.in', 'res.in', 'co.ae', 'com.sa', 'com.eg', 'com.ng', 'co.ke', 'com.ph', 'com.vn', 'com.ar', 'com.co', 'com.pe']);

export interface UrlResult { url: string | null; domain: string | null; problems: string[] }

/** One web address. Adds https:// to a bare domain, keeps path off for the stored value's domain. */
export function parseUrl(raw: string): UrlResult {
  const text = cleanText(raw);
  if (!text) return { url: null, domain: null, problems: [] };
  const first = text.split(/[\s,;]+/).find((p) => p) || '';
  let candidate = first.replace(/^[<(\["']+|[>)\]"'.]+$/g, '');
  if (!candidate || candidate.includes('@')) return { url: null, domain: null, problems: [`"${text.slice(0, 40)}" is not a web address`] };
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(candidate)) candidate = 'https://' + candidate.replace(/^\/+/, '');
  let host = '';
  try { host = new URL(candidate).hostname.toLowerCase(); } catch { host = ''; }
  // a real site name ends in letters (this also rejects "01/01/2026", which the URL parser reads as the IP 0.0.0.1)
  if (!host || !/^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/.test(host.replace(/^www\./, ''))) {
    return { url: null, domain: null, problems: [`"${text.slice(0, 40)}" is not a web address`] };
  }
  if (!/^https?:\/\//i.test(candidate)) return { url: null, domain: null, problems: [`"${text.slice(0, 40)}" is not a web page address`] };
  return { url: candidate, domain: registrableDomain(host), problems: [] };
}

export function registrableDomain(hostOrUrl: string): string | null {
  let host = hostOrUrl.trim().toLowerCase();
  if (!host) return null;
  if (/^[a-z][a-z0-9+.-]*:\/\//.test(host)) { try { host = new URL(host).hostname; } catch { return null; } }
  host = host.replace(/^www\d*\./, '').replace(/\.$/, '');
  const parts = host.split('.');
  if (parts.length < 2 || parts.some((p) => !p)) return null;
  const last2 = parts.slice(-2).join('.');
  if (parts.length >= 3 && MULTI_PART_SUFFIX.has(last2)) return parts.slice(-3).join('.');
  return last2;
}

// ------------------------------------------------------------------ names

export const LEGAL_SUFFIXES = new Set(['pvt', 'private', 'ltd', 'limited', 'llp', 'llc', 'lp', 'inc', 'incorporated', 'corp', 'corporation', 'co', 'company', 'gmbh', 'ag', 'sa', 'sarl', 'sas', 'bv', 'nv', 'plc', 'pte', 'pty', 'oy', 'ab', 'as', 'srl', 'spa', 'kk', 'ltda', 'opc', 'ou', 'aps', 'sdn', 'bhd', 'ug', 'kg', 'se', 'oyj', 'asa', 'cv', 'sl', 'nl', 'the']);

function stripDiacritics(s: string): string {
  return s.normalize('NFKD').replace(/[̀-ͯ]/g, '');
}

/** The key two spellings of one company share: case, punctuation, "Pvt. Ltd." / "Inc" / "&" do not matter. */
export function normalizeCompanyName(raw: string): string {
  let s = stripDiacritics(String(raw || '')).toLowerCase();
  s = s.replace(/\([^)]*\)/g, ' ').replace(/&/g, ' and ').replace(/\bdba\b.*$/, ' ');
  s = s.replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
  let tokens = s.split(' ').filter(Boolean);
  while (tokens.length > 1 && LEGAL_SUFFIXES.has(tokens[tokens.length - 1])) tokens.pop();
  while (tokens.length > 1 && tokens[0] === 'the') tokens.shift();
  tokens = tokens.filter((t, i) => !(t === 'and' && i === tokens.length - 1));
  const out = tokens.join(' ');
  return out || s;
}

const HONORIFICS = new Set(['mr', 'mrs', 'ms', 'miss', 'mx', 'dr', 'prof', 'professor', 'sir', 'madam', 'shri', 'shree', 'smt', 'sri', 'er', 'ca', 'cs', 'adv', 'capt', 'col', 'maj', 'rev']);

export interface PersonName { name: string; first: string; last: string; role: string | null; honorific: string | null }

/** "Mr. Anil Kumar (Head – HR)" -> name "Anil Kumar", role "Head – HR". One cell may hold several people. */
export function parsePeople(raw: string): { people: PersonName[]; problems: string[] } {
  const text = cleanText(raw);
  if (!text) return { people: [], problems: [] };
  const parts = text.split(/\s*(?:\n|;|\s\/\s|\s\|\s)\s*/).map((p) => p.trim()).filter(Boolean);
  const people: PersonName[] = [];
  for (const part of parts) {
    let s = part;
    let role: string | null = null;
    const paren = s.match(/\(([^)]*)\)/);
    if (paren) { role = paren[1].trim() || null; s = s.replace(paren[0], ' ').replace(/\s+/g, ' ').trim(); }
    const dash = s.match(/^(.*?)\s+[-–—]\s+(.+)$/);
    if (dash && !role && dash[1].split(' ').length >= 2 && dash[2].split(' ').length <= 6 && /[A-Za-z]/.test(dash[2]) && !/\d/.test(dash[2])) { s = dash[1]; role = dash[2].trim(); }
    let honorific: string | null = null;
    const words = s.split(' ').filter(Boolean);
    while (words.length > 1 && HONORIFICS.has(words[0].replace(/\.$/, '').toLowerCase())) honorific = words.shift()!.replace(/\.$/, '');
    s = words.join(' ').replace(/^[\s,.-]+|[\s,.-]+$/g, '');
    if (!s || isPlaceholder(s) || !/\p{L}/u.test(s) || HONORIFICS.has(s.replace(/\.$/, '').toLowerCase())) continue;
    const w = s.split(' ');
    people.push({ name: s, first: w.length > 1 ? w.slice(0, -1).join(' ') : w[0], last: w.length > 1 ? w[w.length - 1] : '', role, honorific });
  }
  return { people, problems: [] };
}

// ------------------------------------------------------------------ numbers and money

export interface NumberResult { value: number | null; problem: string | null }

/** "₹ 1,20,000", "$12.5k", "1.234,56", "(500)" ... Currency is not interpreted, only stripped. */
export function parseNumber(raw: string): NumberResult {
  let s = cleanText(raw);
  if (!s) return { value: null, problem: null };
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  s = s.replace(/[₨₹$€£¥]|\b(?:rs|inr|usd|eur|gbp|aed|sgd)\b\.?/gi, '').replace(/\s+/g, '').trim();
  if (s.startsWith('-')) { neg = !neg; s = s.slice(1); }
  let mult = 1;
  const suf = s.match(/([kmb])$/i);
  if (suf) { mult = { k: 1e3, m: 1e6, b: 1e9 }[suf[1].toLowerCase() as 'k' | 'm' | 'b']; s = s.slice(0, -1); }
  if (!/^[\d.,]+$/.test(s) || !/\d/.test(s)) return { value: null, problem: `"${raw.trim()}" is not a number` };
  const lastDot = s.lastIndexOf('.');
  const lastComma = s.lastIndexOf(',');
  let normalized = s;
  if (lastDot >= 0 && lastComma >= 0) {
    normalized = lastDot > lastComma ? s.replace(/,/g, '') : s.replace(/\./g, '').replace(',', '.');
  } else if (lastComma >= 0) {
    const after = s.length - lastComma - 1;
    const commas = (s.match(/,/g) || []).length;
    normalized = commas === 1 && after !== 3 && after > 0 && after <= 2 ? s.replace(',', '.') : s.replace(/,/g, '');
  } else if ((s.match(/\./g) || []).length > 1) {
    normalized = s.replace(/\./g, '');
  }
  const n = Number(normalized);
  if (!Number.isFinite(n)) return { value: null, problem: `"${raw.trim()}" is not a number` };
  return { value: (neg ? -n : n) * mult, problem: null };
}

// ------------------------------------------------------------------ dates

export type DateOrder = 'dmy' | 'mdy' | 'ambiguous';
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

function iso(y: number, m: number, d: number): string | null {
  if (y < 1900 || y > 2200 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return dt.toISOString().slice(0, 10);
}

/** Looks at every date in a column: if any has a part above 12 the order is known; if all are <= 12 it is ambiguous. */
export function inferDateOrder(values: string[]): DateOrder {
  let dmy = 0, mdy = 0;
  for (const v of values) {
    const m = String(v).trim().match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})/);
    if (!m) continue;
    const a = Number(m[1]), b = Number(m[2]);
    if (a > 12 && b <= 12) dmy++;
    else if (b > 12 && a <= 12) mdy++;
  }
  if (dmy && !mdy) return 'dmy';
  if (mdy && !dmy) return 'mdy';
  return 'ambiguous';
}

export interface DateResult { value: string | null; ambiguous: boolean; problem: string | null }

export function parseDate(raw: string, order: DateOrder = 'ambiguous'): DateResult {
  const s = cleanText(raw);
  if (!s) return { value: null, ambiguous: false, problem: null };
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T\s].*)?$/);
  if (m) { const v = iso(+m[1], +m[2], +m[3]); return v ? { value: v, ambiguous: false, problem: null } : { value: null, ambiguous: false, problem: `"${s}" is not a real date` }; }
  m = s.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2}|\d{4})(?:[T\s].*)?$/);
  if (m) {
    const a = +m[1], b = +m[2];
    let y = +m[3];
    if (m[3].length === 2) y += y < 70 ? 2000 : 1900;
    let d: number, mo: number, amb = false;
    if (a > 12) { d = a; mo = b; }
    else if (b > 12) { d = b; mo = a; }
    else if (order === 'dmy') { d = a; mo = b; }
    else if (order === 'mdy') { d = b; mo = a; }
    else { d = a; mo = b; amb = true; }
    const v = iso(y, mo, d);
    return v ? { value: v, ambiguous: amb, problem: null } : { value: null, ambiguous: false, problem: `"${s}" is not a real date` };
  }
  m = s.match(/^(\d{1,2})(?:st|nd|rd|th)?[\s\-/]+([A-Za-z]{3,9})\.?,?[\s\-/]+(\d{4})/);
  if (m) {
    const mi = MONTHS.indexOf(m[2].slice(0, 3).toLowerCase());
    const v = mi >= 0 ? iso(+m[3], mi + 1, +m[1]) : null;
    if (v) return { value: v, ambiguous: false, problem: null };
  }
  m = s.match(/^([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})/);
  if (m) {
    const mi = MONTHS.indexOf(m[1].slice(0, 3).toLowerCase());
    const v = mi >= 0 ? iso(+m[3], mi + 1, +m[2]) : null;
    if (v) return { value: v, ambiguous: false, problem: null };
  }
  return { value: null, ambiguous: false, problem: `"${s.length > 30 ? s.slice(0, 30) + '…' : s}" is not a date I can read` };
}

// ------------------------------------------------------------------ similarity (for "did you mean the same company?")

function levenshtein(a: string, b: string, cap: number): number {
  if (Math.abs(a.length - b.length) > cap) return cap + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (cur[j] < rowMin) rowMin = cur[j];
    }
    if (rowMin > cap) return cap + 1;
    prev = cur;
  }
  return prev[b.length];
}

/** 0..1 closeness of two already-normalised names. Only used to SUGGEST; nothing is merged because of it. */
export function nameSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  // numbers and single letters identify (Plant 1 / Plant 2, Phase A / Phase B, Acme 3 / Acme 4): different, never "similar"
  const marks = (x: string) => x.split(' ').filter((t) => /^\d+$/.test(t) || /^[a-z]$/.test(t)).sort().join(',');
  if (marks(a) !== marks(b)) return 0;
  const shorter = Math.min(a.length, b.length);
  if (shorter < 4) return 0;
  const cap = Math.max(1, Math.floor(Math.max(a.length, b.length) * 0.25));
  const d = levenshtein(a, b, cap);
  let score = d > cap ? 0 : 1 - d / Math.max(a.length, b.length);
  // one name is the other plus extra words: "xpressbees corporate" vs "xpressbees"
  const ta = a.split(' '), tb = b.split(' ');
  const [small, big] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  if (small.length < big.length && small.length >= 1) {
    const head = big.slice(0, small.length).join(' ');
    const sm = small.join(' ');
    if (sm.length >= 5 && (head === sm || levenshtein(head, sm, 1) <= 1)) score = Math.max(score, head === sm ? 0.85 : 0.8);
  }
  return score;
}
