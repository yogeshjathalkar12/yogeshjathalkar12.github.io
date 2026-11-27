// Quotes (db/migrations/2026-11-29_f_quotes.sql). The database works the totals out; the figures here are the preview on screen and
// must come out the same, so they are worked in whole numbers, never in binary fractions.

export const QUOTE_PAGE = 'https://shoonyaorigins.com/ventures/raptor/quote.html';
export const CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'AED', 'SGD', 'AUD', 'CAD', 'NZD', 'CHF', 'JPY', 'CNY', 'SAR', 'ZAR', 'BRL', 'MXN'];
export const MAX_LINES = 100;

export interface QuoteLine { name: string; description: string; quantity: string; unit_price: string; discount_percent: string; tax_percent: string; product_id?: string | null }
export interface Product { id: string; name: string; sku: string; description: string; unit_price: number | string; tax_percent: number | string; active: boolean }
export type QuoteStatus = 'draft' | 'sent' | 'accepted' | 'declined' | 'cancelled';
export interface Quote {
  id: string; number: string; title: string; deal_id: string | null; contact_id: string | null; company_id: string | null;
  buyer_name: string; buyer_details: string; currency: string; issue_date: string; valid_until: string | null; items: any[]; notes: string;
  subtotal: number; discount_total: number; tax_total: number; total: number; status: QuoteStatus; token: string;
  viewed_at: string | null; answered_at: string | null; answered_by: string | null; answer_note: string | null; created_at: string;
}

export const blankLine = (): QuoteLine => ({ name: '', description: '', quantity: '1', unit_price: '0', discount_percent: '0', tax_percent: '0' });
export const lineOf = (p: Product): QuoteLine => ({
  name: p.name, description: p.description || '', quantity: '1', unit_price: String(p.unit_price), discount_percent: '0', tax_percent: String(p.tax_percent), product_id: p.id,
});

/** A typed number with at most `places` decimals, as a whole number of the smallest step (2.5 with 2 places = 250), rounded half up
 *  like the database. null when it is not a number of zero or more. */
export function units(text: string | number, places: number): bigint | null {
  const m = /^\s*(\d{0,15})(?:\.(\d*))?\s*$/.exec(String(text));
  if (!m || (!m[1] && !m[2])) return null;
  const decimals = (m[2] || '').padEnd(places + 1, '0');
  const kept = BigInt((m[1] || '0') + decimals.slice(0, places));
  return decimals[places] >= '5' ? kept + 1n : kept;
}

const halfUp = (value: bigint, divisor: bigint) => (value * 2n + divisor) / (divisor * 2n);

export interface Totals { amounts: number[]; subtotal: number; discount: number; tax: number; total: number }

/** The money of a quote in the same steps the database takes: each line rounded to cents, then added. A line with something that
 *  is not a number counts as nothing (the form says what is wrong). */
export function totalsOf(lines: Pick<QuoteLine, 'quantity' | 'unit_price' | 'discount_percent' | 'tax_percent'>[]): Totals {
  let sub = 0n, net = 0n, tax = 0n;
  const amounts = lines.map((line) => {
    const q = units(line.quantity, 3), p = units(line.unit_price, 2), d = units(line.discount_percent || '0', 2), t = units(line.tax_percent || '0', 2);
    if (q === null || p === null || d === null || t === null || d > 10000n) return 0;
    const gross = q * p;                                                     // in 1/100000
    const lineNet = halfUp(gross * (10000n - d), 10000n * 1000n);            // in cents
    sub += halfUp(gross, 1000n);
    net += lineNet;
    tax += halfUp(lineNet * t, 10000n);
    return Number(lineNet) / 100;
  });
  return { amounts, subtotal: Number(sub) / 100, discount: Number(sub - net) / 100, tax: Number(tax) / 100, total: Number(net + tax) / 100 };
}

export function lineProblem(line: QuoteLine): string | null {
  if (!line.name.trim()) return 'Every line needs a name.';
  const q = units(line.quantity, 3), p = units(line.unit_price, 2), d = units(line.discount_percent || '0', 2), t = units(line.tax_percent || '0', 2);
  if (q === null || q > 1_000_000_000_000n) return `“${line.name}”: the quantity is a number, 0 or more.`;
  if (p === null || p > 100_000_000_000_000n) return `“${line.name}”: the price is a number, 0 or more.`;
  if (d === null || d > 10000n) return `“${line.name}”: the discount is 0 to 100 percent.`;
  if (t === null || t > 10000n) return `“${line.name}”: the tax is 0 to 100 percent.`;
  return null;
}

export interface QuoteDraft {
  title: string; deal_id: string; contact_id: string; company_id: string; buyer_name: string; buyer_details: string; currency: string;
  issue_date: string; valid_until: string; notes: string; lines: QuoteLine[];
}

export const todayText = (now: Date = new Date()) => `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

export function newQuote(currency: string, now: Date = new Date()): QuoteDraft {
  const later = new Date(now.getTime() + 30 * 86_400_000);
  return { title: '', deal_id: '', contact_id: '', company_id: '', buyer_name: '', buyer_details: '', currency: CURRENCIES.includes(currency) ? currency : 'INR',
    issue_date: todayText(now), valid_until: todayText(later), notes: '', lines: [blankLine()] };
}

export const draftOfQuote = (q: Quote): QuoteDraft => ({
  title: q.title, deal_id: q.deal_id || '', contact_id: q.contact_id || '', company_id: q.company_id || '', buyer_name: q.buyer_name,
  buyer_details: q.buyer_details, currency: q.currency, issue_date: q.issue_date, valid_until: q.valid_until || '', notes: q.notes,
  lines: (q.items || []).map((i: any) => ({ name: i.name, description: i.description || '', quantity: String(i.quantity), unit_price: String(i.unit_price),
    discount_percent: String(i.discount_percent ?? 0), tax_percent: String(i.tax_percent ?? 0), product_id: i.product_id || null })),
});

export function quoteProblem(d: QuoteDraft): string | null {
  if (d.lines.length === 0) return 'Add at least one line.';
  if (d.lines.length > MAX_LINES) return `A quote holds up to ${MAX_LINES} lines.`;
  for (const line of d.lines) { const p = lineProblem(line); if (p) return p; }
  if (!d.issue_date) return 'Choose the date of the quote.';
  if (d.valid_until && d.valid_until < d.issue_date) return 'It cannot be valid until a day before its own date.';
  return null;
}

export const quoteRow = (d: QuoteDraft) => ({
  title: d.title.trim(), deal_id: d.deal_id || null, contact_id: d.contact_id || null, company_id: d.company_id || null,
  buyer_name: d.buyer_name.trim(), buyer_details: d.buyer_details.trim(), currency: d.currency, issue_date: d.issue_date,
  valid_until: d.valid_until || null, notes: d.notes.trim(),
  items: d.lines.map((l) => ({ name: l.name.trim(), description: l.description.trim(), quantity: l.quantity.trim() || '0', unit_price: l.unit_price.trim() || '0',
    discount_percent: l.discount_percent.trim() || '0', tax_percent: l.tax_percent.trim() || '0', product_id: l.product_id || null })),
});

export const quoteLink = (token: string) => `${QUOTE_PAGE}?q=${encodeURIComponent(token)}`;

export function money(value: number | string, currency: string): string {
  try { return new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : undefined, { style: 'currency', currency }).format(Number(value) || 0); } catch { return `${currency} ${(Number(value) || 0).toFixed(2)}`; }
}

/** What the list shows: a sent quote past its date reads as out of date. */
export function statusText(q: Pick<Quote, 'status' | 'valid_until' | 'viewed_at'>, now: Date = new Date()): string {
  if (q.status === 'sent') {
    if (q.valid_until && q.valid_until < todayText(now)) return 'Out of date';
    return q.viewed_at ? 'Seen, no answer yet' : 'Sent, not seen yet';
  }
  return { draft: 'Draft', accepted: 'Accepted', declined: 'Declined', cancelled: 'Cancelled' }[q.status];
}
