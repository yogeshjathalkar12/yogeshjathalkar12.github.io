import { fieldInputStyle, fieldLabelStyle, toolBtnStyle } from './Modal';
import { type Product, type QuoteDraft, type QuoteLine, CURRENCIES, MAX_LINES, blankLine, lineOf, money, totalsOf } from '../../lib/quotes';

// The fields of one quote: who it is for, its lines and the money they come to.

const pair: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', columnGap: 12 };
const cell: React.CSSProperties = { ...fieldInputStyle, marginBottom: 0 };

export interface Picks {
  contacts: { id: string; name: string; email?: string | null; company_id?: string | null }[];
  companies: { id: string; name: string; address?: string | null }[];
  deals: { id: string; title: string; contact_id?: string | null; company_id?: string | null }[];
}

export default function QuoteEditor({ draft, onChange, picks, products }: { draft: QuoteDraft; onChange: (d: QuoteDraft) => void; picks: Picks; products: Product[] }) {
  const set = (patch: Partial<QuoteDraft>) => onChange({ ...draft, ...patch });
  const setLine = (i: number, patch: Partial<QuoteLine>) => set({ lines: draft.lines.map((l, n) => (n === i ? { ...l, ...patch } : l)) });
  const totals = totalsOf(draft.lines);

  // choosing a person or a deal fills in who the quote is for, without overwriting what was typed
  function link(patch: Partial<QuoteDraft>) {
    const next = { ...draft, ...patch };
    const deal = picks.deals.find((d) => d.id === next.deal_id);
    if (patch.deal_id && deal) { next.contact_id = next.contact_id || deal.contact_id || ''; next.company_id = next.company_id || deal.company_id || ''; next.title = next.title || deal.title; }
    const contact = picks.contacts.find((c) => c.id === next.contact_id);
    if (contact) next.company_id = next.company_id || contact.company_id || '';
    const company = picks.companies.find((c) => c.id === next.company_id);
    if (!next.buyer_name.trim()) next.buyer_name = [contact?.name, company?.name].filter(Boolean).join(', ');
    if (!next.buyer_details.trim()) next.buyer_details = [company?.address, contact?.email].filter(Boolean).join('\n');
    onChange(next);
  }

  const select = (id: string, label: string, value: string, options: [string, string][], key: 'deal_id' | 'contact_id' | 'company_id') => (
    <div>
      <label style={fieldLabelStyle} htmlFor={id}>{label}</label>
      <select id={id} style={fieldInputStyle} value={value} onChange={(e) => link({ [key]: e.target.value })}>
        <option value="">None</option>
        {value && !options.some(([k]) => k === value) && <option value={value}>A record you cannot see</option>}
        {options.map(([k, text]) => <option key={k} value={k}>{text}</option>)}
      </select>
    </div>
  );

  return (
    <div>
      <label style={fieldLabelStyle} htmlFor="q-title">Title</label>
      <input id="q-title" style={fieldInputStyle} value={draft.title} maxLength={200} placeholder="e.g. Annual licence" onChange={(e) => set({ title: e.target.value })} />
      <div style={pair}>
        {select('q-deal', 'Deal', draft.deal_id, picks.deals.map((d) => [d.id, d.title]), 'deal_id')}
        {select('q-contact', 'Contact', draft.contact_id, picks.contacts.map((c) => [c.id, c.name]), 'contact_id')}
        {select('q-company', 'Company', draft.company_id, picks.companies.map((c) => [c.id, c.name]), 'company_id')}
      </div>
      <div style={pair}>
        <div><label style={fieldLabelStyle} htmlFor="q-buyer">Quote for (as printed)</label><input id="q-buyer" style={fieldInputStyle} value={draft.buyer_name} maxLength={160} onChange={(e) => set({ buyer_name: e.target.value })} /></div>
        <div><label style={fieldLabelStyle} htmlFor="q-buyerd">Their address and details</label><textarea id="q-buyerd" style={{ ...fieldInputStyle, minHeight: 44 }} value={draft.buyer_details} maxLength={600} onChange={(e) => set({ buyer_details: e.target.value })} /></div>
      </div>
      <div style={pair}>
        <div><label style={fieldLabelStyle} htmlFor="q-date">Date</label><input id="q-date" style={fieldInputStyle} type="date" value={draft.issue_date} onChange={(e) => set({ issue_date: e.target.value })} /></div>
        <div><label style={fieldLabelStyle} htmlFor="q-valid">Valid until (optional)</label><input id="q-valid" style={fieldInputStyle} type="date" value={draft.valid_until} onChange={(e) => set({ valid_until: e.target.value })} /></div>
        <div><label style={fieldLabelStyle} htmlFor="q-currency">Currency</label>
          <select id="q-currency" style={fieldInputStyle} value={draft.currency} onChange={(e) => set({ currency: e.target.value })}>{CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}</select></div>
      </div>

      <div style={fieldLabelStyle}>Lines</div>
      {draft.lines.map((line, i) => (
        <div key={i} style={{ border: '1px solid var(--border)', borderRadius: 4, padding: '0.6rem', marginBottom: 8 }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
            <input style={{ ...cell, flex: 1 }} aria-label={`Line ${i + 1} name`} placeholder="Item" value={line.name} maxLength={160} onChange={(e) => setLine(i, { name: e.target.value })} />
            <button type="button" style={toolBtnStyle} aria-label={`Remove line ${i + 1}`} disabled={draft.lines.length === 1} onClick={() => set({ lines: draft.lines.filter((_, n) => n !== i) })}>✕</button>
          </div>
          <input style={{ ...cell, marginBottom: 6 }} aria-label={`Line ${i + 1} description`} placeholder="Description (optional)" value={line.description} maxLength={1000} onChange={(e) => setLine(i, { description: e.target.value })} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(90px, 1fr))', gap: 8, alignItems: 'end' }}>
            {([['quantity', 'Quantity'], ['unit_price', 'Price'], ['discount_percent', 'Discount %'], ['tax_percent', 'Tax %']] as const).map(([key, label]) => (
              <label key={key} style={{ fontSize: '0.55rem', color: 'var(--dim)' }}>{label}
                <input style={cell} inputMode="decimal" aria-label={`Line ${i + 1} ${label}`} value={line[key]} onChange={(e) => setLine(i, { [key]: e.target.value })} />
              </label>
            ))}
            <div style={{ fontSize: '0.75rem', textAlign: 'right', paddingBottom: 8 }}>{money(totals.amounts[i], draft.currency)}</div>
          </div>
        </div>
      ))}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <button type="button" style={toolBtnStyle} disabled={draft.lines.length >= MAX_LINES} onClick={() => set({ lines: [...draft.lines, blankLine()] })}>+ Add a line</button>
        {products.some((p) => p.active) && (
          <select style={{ ...cell, width: 'auto' }} aria-label="Add a product" value="" disabled={draft.lines.length >= MAX_LINES}
            onChange={(e) => {
              const product = products.find((p) => p.id === e.target.value);
              if (!product) return;
              const only = draft.lines.length === 1 && !draft.lines[0].name.trim();      // an untouched first line is replaced
              set({ lines: [...(only ? [] : draft.lines), lineOf(product)] });
            }}>
            <option value="">Add a product…</option>
            {products.filter((p) => p.active).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        )}
      </div>
      <div style={{ textAlign: 'right', fontSize: '0.75rem', lineHeight: 1.9, marginBottom: 12 }} data-testid="quote-totals">
        <div>Subtotal {money(totals.subtotal, draft.currency)}</div>
        {totals.discount > 0 && <div>Discount −{money(totals.discount, draft.currency)}</div>}
        {totals.tax > 0 && <div>Tax {money(totals.tax, draft.currency)}</div>}
        <div style={{ fontSize: '1rem', color: 'var(--white)' }}>Total {money(totals.total, draft.currency)}</div>
      </div>
      <label style={fieldLabelStyle} htmlFor="q-notes">Note to the customer (optional)</label>
      <textarea id="q-notes" style={{ ...fieldInputStyle, minHeight: 56 }} value={draft.notes} maxLength={3000} onChange={(e) => set({ notes: e.target.value })} />
    </div>
  );
}
