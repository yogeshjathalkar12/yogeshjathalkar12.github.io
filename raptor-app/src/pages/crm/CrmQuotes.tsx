import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { selectAll } from '../../lib/selectAll';
import { isNotInstalled } from '../../lib/dbMissing';
import { useOrg } from '../../hooks/OrgContext';
import { activeCurrencyCode } from '../../lib/currency';
import { TABLE_PAGE } from '../../lib/paging';
import Modal, { fieldInputStyle, fieldLabelStyle, ghostBtnStyle, primaryBtnStyle, toolBtnStyle, toolPrimaryStyle } from '../../components/crm/Modal';
import QuoteEditor, { type Picks } from '../../components/crm/QuoteEditor';
import ProductsModal from '../../components/crm/ProductsModal';
import { type Product, type Quote, type QuoteDraft, draftOfQuote, money, newQuote, quoteLink, quoteProblem, quoteRow, statusText, todayText } from '../../lib/quotes';
import { emailQuote } from '../../lib/quoteMail';

// CRM > Quotes (db/migrations/2026-11-29_f_quotes.sql): quotes made from the price list, shared by a private link.

const card: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, padding: '1rem 1.2rem' };
const small: React.CSSProperties = { fontSize: '0.65rem', color: 'var(--dim)', lineHeight: 1.6 };
const COLORS: Record<string, string> = { accepted: 'var(--green)', declined: 'var(--red)', sent: 'var(--amber)', draft: 'var(--dim)', cancelled: 'var(--dim2)' };

export default function CrmQuotes() {
  const { isOwner, isAdmin, can } = useOrg();
  const [params, setParams] = useSearchParams();
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [picks, setPicks] = useState<Picks>({ contacts: [], companies: [], deals: [] });
  const [state, setState] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading');
  const [message, setMessage] = useState('');
  const [editing, setEditing] = useState<{ quote: Quote | null; draft: QuoteDraft } | null>(null);
  const [showProducts, setShowProducts] = useState(false);
  const [settings, setSettings] = useState<{ business_name: string; details: string; terms: string; prefix: string; exists: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const [copied, setCopied] = useState('');
  const [limit, setLimit] = useState(TABLE_PAGE);

  const load = useCallback(async () => {
    const [q, p] = await Promise.all([
      selectAll<Quote>(() => supabase.from('quotes').select('*')),
      selectAll<Product>(() => supabase.from('products').select('*')),
    ]);
    const failed = q.error || p.error;
    if (failed) { setState(isNotInstalled(failed) ? 'missing' : 'error'); setMessage(failed.message); return; }
    setQuotes((q.data || []).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))));
    setProducts((p.data || []).sort((a, b) => a.name.localeCompare(b.name)));
    setState('ready');
  }, []);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (state !== 'ready') return;
    Promise.all([
      selectAll(() => supabase.from('contacts').select('id, name, email, company_id')),
      selectAll(() => supabase.from('companies').select('*')),
      selectAll(() => supabase.from('deals').select('id, title, contact_id, company_id')),
    ]).then(([contacts, companies, deals]) => {
      const byName = <T,>(rows: T[] | null, key: keyof T) => ([...(rows || [])] as T[]).sort((a, b) => String(a[key]).localeCompare(String(b[key])));
      setPicks({ contacts: byName(contacts.data as any[], 'name'), companies: byName(companies.data as any[], 'name'), deals: byName(deals.data as any[], 'title') });
    });
  }, [state]);

  // arriving from a notification (?open=) or from a deal (?deal=)
  useEffect(() => {
    if (state !== 'ready') return;
    const openId = params.get('open');
    const dealId = params.get('deal');
    if (!openId && !dealId) return;
    if (dealId && picks.deals.length === 0) return;
    const found = openId ? quotes.find((q) => q.id === openId) : null;
    if (found) setEditing({ quote: found, draft: draftOfQuote(found) });
    if (dealId) {
      const deal = picks.deals.find((d) => d.id === dealId);
      const contact = picks.contacts.find((c) => c.id === deal?.contact_id);
      const company = picks.companies.find((c) => c.id === deal?.company_id);
      setEditing({ quote: null, draft: { ...newQuote(activeCurrencyCode()), deal_id: dealId, title: deal?.title || '', contact_id: contact?.id || '', company_id: company?.id || '',
        buyer_name: [contact?.name, company?.name].filter(Boolean).join(', '), buyer_details: [company?.address, contact?.email].filter(Boolean).join('\n') } });
    }
    setParams({}, { replace: true });
  }, [state, params, quotes, picks, setParams]);

  const locked = editing?.quote && editing.quote.status !== 'draft' && editing.quote.status !== 'sent';

  async function save(status?: 'sent') {
    if (!editing) return;
    const wrong = quoteProblem(editing.draft);
    if (wrong) { setProblem(wrong); return; }
    setBusy(true); setProblem('');
    const row = quoteRow(editing.draft);
    let id = editing.quote?.id;
    if (id) {
      const { error } = await supabase.from('quotes').update({ ...row, ...(status ? { status } : {}) }).eq('id', id);
      if (error) { setProblem(error.message); setBusy(false); return; }
    } else {
      const { data, error } = await supabase.from('quotes').insert(row).select().single();
      if (error) { setProblem(error.message); setBusy(false); return; }
      id = (data as Quote).id;
      if (status) {
        const marked = await supabase.from('quotes').update({ status }).eq('id', id);
        if (marked.error) { setProblem(marked.error.message); setBusy(false); load(); setEditing({ quote: data as Quote, draft: editing.draft }); return; }
      }
    }
    setBusy(false);
    setEditing(null);
    load();
  }

  async function change(quote: Quote, status: string, ask: string) {
    if (!confirm(ask)) return;
    const { error } = await supabase.from('quotes').update({ status }).eq('id', quote.id);
    if (error) { setProblem(error.message); return; }
    setEditing(null);
    load();
  }

  async function remove(quote: Quote) {
    if (!confirm(`Delete draft ${quote.number}?`)) return;
    const { error } = await supabase.from('quotes').delete().eq('id', quote.id);
    if (error) { setProblem(error.message); return; }
    setEditing(null);
    load();
  }

  async function setDealValue(quote: Quote) {
    const own = activeCurrencyCode();
    const foreign = quote.currency !== own;
    // a quote in another currency becomes a deal in that currency, at the saved rate (2026-11-29_g_currencies.sql)
    const rate = foreign ? ((await supabase.from('currency_rates').select('rate').eq('code', quote.currency)).data as any)?.[0]?.rate : null;
    if (foreign && !rate) { setProblem(`Save an exchange rate for ${quote.currency} first (Pipeline → Currencies), so the value can be worked out in ${own}.`); return; }
    if (!quote.deal_id || !confirm(`Set the deal's value to ${money(quote.total, quote.currency)}${foreign ? `, at 1 ${quote.currency} = ${Number(rate)} ${own}` : ''}?`)) return;
    const row = foreign ? { currency: quote.currency, amount: quote.total, fx_rate: Number(rate) } : { value: quote.total };
    const { error } = await supabase.from('deals').update(row).eq('id', quote.deal_id);
    setProblem(error ? error.message : '');
    if (!error) alert('The deal value was updated.');
  }

  async function sendByEmail(quote: Quote) {
    if (!confirm(`Email quote ${quote.number} to its contact now? It is sent from Raptor's address, and replies come to you.`)) return;
    setProblem('');
    setBusy(true);
    try {
      const to = await emailQuote(quote.id);
      alert(`The quote was emailed to ${to}.`);
    } catch (e: any) {
      setProblem(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function copy(quote: Quote) {
    try { await navigator.clipboard.writeText(quoteLink(quote.token)); setCopied(quote.id); } catch { window.prompt('Copy this link:', quoteLink(quote.token)); }
  }

  async function openSettings() {
    setProblem('');
    const { data } = await supabase.from('quote_settings').select('*').limit(1);
    const row = (data as any)?.[0];
    setSettings({ business_name: row?.business_name || '', details: row?.details || '', terms: row?.terms || '', prefix: row?.prefix ?? 'Q-', exists: !!row });
  }

  async function saveSettings(e: React.FormEvent) {
    e.preventDefault();
    if (!settings) return;
    const row = { business_name: settings.business_name.trim(), details: settings.details.trim(), terms: settings.terms.trim(), prefix: settings.prefix.trim() };
    const { error } = settings.exists
      ? await supabase.from('quote_settings').update(row).not('owner_id', 'is', null)          // row-level security: only this organization's row
      : await supabase.from('quote_settings').insert(row);
    if (error) { setProblem(error.message); return; }
    setSettings(null);
  }

  if (state === 'loading') return <div style={small}>Loading quotes…</div>;
  if (state === 'missing') return <div style={card}><div style={small}>Quotes need a database update first: run <b>2026-11-29_f_quotes.sql</b> in Supabase.</div></div>;
  if (state === 'error') return <div style={card}><div style={{ ...small, color: 'var(--red)' }}>Could not load the quotes: {message}</div></div>;

  const q = editing?.quote;

  return (
    <div style={{ overflowY: 'auto', height: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', marginBottom: '1.2rem' }}>
        <div style={{ ...small, maxWidth: 560 }}>Make a quote, mark it sent, and send the customer its private link: they can read, print, accept or decline it. Raptor does not email it for you.</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignSelf: 'flex-start' }}>
          <button type="button" style={toolBtnStyle} onClick={() => setShowProducts(true)}>Products</button>
          {(isOwner || isAdmin) && <button type="button" style={toolBtnStyle} onClick={openSettings}>Your business details</button>}
          {can('create') && <button type="button" style={toolPrimaryStyle} onClick={() => { setProblem(''); setEditing({ quote: null, draft: newQuote(activeCurrencyCode()) }); }}>+ New quote</button>}
        </div>
      </div>
      {problem && !editing && !settings && <div role="alert" style={{ ...small, color: 'var(--red)', marginBottom: 10 }}>{problem}</div>}

      {quotes.length === 0 ? <div style={{ ...card, textAlign: 'center' }}><div style={small}>No quotes yet.</div></div> : (
        <div style={{ ...card, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.7rem' }}>
            <tbody>
              {quotes.slice(0, limit).map((row) => (
                <tr key={row.id} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '0.55rem 0.4rem', whiteSpace: 'nowrap', fontFamily: 'var(--mono)' }}>{row.number}</td>
                  <td style={{ padding: '0.55rem 0.4rem' }}>{row.title || 'Quote'}<div style={{ color: 'var(--dim)' }}>{row.buyer_name}</div></td>
                  <td style={{ padding: '0.55rem 0.4rem', textAlign: 'right', whiteSpace: 'nowrap' }}>{money(row.total, row.currency)}</td>
                  <td style={{ padding: '0.55rem 0.4rem', color: COLORS[row.status], whiteSpace: 'nowrap' }}>{statusText(row)}{row.answered_by && <div style={{ color: 'var(--dim)' }}>by {row.answered_by}</div>}</td>
                  <td style={{ padding: '0.55rem 0.4rem', textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {row.status !== 'draft' && row.status !== 'cancelled' && <button type="button" style={{ ...toolBtnStyle, marginRight: 6 }} onClick={() => copy(row)}>{copied === row.id ? 'Copied' : 'Copy link'}</button>}
                    {row.status === 'sent' && row.contact_id && <button type="button" style={{ ...toolBtnStyle, marginRight: 6 }} disabled={busy} onClick={() => sendByEmail(row)}>Email</button>}
                    <button type="button" style={toolBtnStyle} onClick={() => { setProblem(''); setEditing({ quote: row, draft: draftOfQuote(row) }); }}>Open</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {quotes.length > limit && <button type="button" style={{ ...toolBtnStyle, marginTop: 10 }} onClick={() => setLimit(limit + TABLE_PAGE)}>Show more ({quotes.length - limit} more)</button>}
        </div>
      )}

      <Modal open={!!editing} onClose={() => setEditing(null)} title={q ? `Quote ${q.number}` : 'New quote'} width={760}>
        {editing && (
          <div>
            {q && (
              <div style={{ ...small, marginBottom: 12 }}>
                <b style={{ color: COLORS[q.status] }}>{statusText(q)}</b>
                {q.answered_at && <> · {new Date(q.answered_at).toLocaleString()} by {q.answered_by}</>}
                {q.answer_note && <div>“{q.answer_note}”</div>}
                {q.status !== 'draft' && q.status !== 'cancelled' && <div><a style={{ color: 'var(--purple)' }} href={quoteLink(q.token)} target="_blank" rel="noopener noreferrer">Open the customer’s page</a></div>}
              </div>
            )}
            {locked ? (
              <div style={{ marginBottom: 14 }}>
                {q!.items.map((i: any, n: number) => <div key={n} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, borderTop: '1px solid var(--border)', padding: '0.4rem 0', fontSize: '0.7rem' }}><span>{i.name} × {i.quantity}</span><span>{money(i.amount, q!.currency)}</span></div>)}
                <div style={{ textAlign: 'right', marginTop: 8, fontSize: '0.9rem' }}>Total {money(q!.total, q!.currency)}</div>
                <div style={{ ...small, marginTop: 8 }}>An answered or cancelled quote cannot be changed. Copy it to make a new one.</div>
              </div>
            ) : (
              <>
                {q?.status === 'sent' && <div style={{ ...small, color: 'var(--amber)', marginBottom: 10 }}>The customer has the link: what you save here is what they see from now on.</div>}
                <QuoteEditor draft={editing.draft} onChange={(draft) => setEditing({ ...editing, draft })} picks={picks} products={products} />
              </>
            )}
            {problem && <div role="alert" style={{ ...small, color: 'var(--red)', marginBottom: 10 }}>{problem}</div>}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              {q?.status === 'draft' && can('delete') && <button type="button" style={{ ...ghostBtnStyle, color: 'var(--red)', marginRight: 'auto' }} onClick={() => remove(q)}>Delete</button>}
              {q && (q.status === 'sent' || q.status === 'accepted' || q.status === 'declined') && <button type="button" style={{ ...ghostBtnStyle, color: 'var(--red)', marginRight: 'auto' }} onClick={() => change(q, 'cancelled', `Cancel ${q.number}? Its link will only say it is cancelled.`)}>Cancel quote</button>}
              {q && can('create') && <button type="button" style={ghostBtnStyle} onClick={() => { setProblem(''); setEditing({ quote: null, draft: { ...editing.draft, issue_date: todayText(), valid_until: '' } }); }}>Copy as new</button>}
              {q?.deal_id && can('edit') && <button type="button" style={ghostBtnStyle} onClick={() => setDealValue(q)}>Use total as deal value</button>}
              {q?.status === 'sent' && can('edit') && <button type="button" style={ghostBtnStyle} onClick={() => change(q, 'accepted', `Mark ${q.number} as accepted? Use this when the customer told you directly.`)}>Mark accepted</button>}
              {!locked && (!q || can('edit')) && <button type="button" style={ghostBtnStyle} disabled={busy} onClick={() => save()}>{q?.status === 'sent' ? 'Save changes' : 'Save draft'}</button>}
              {!locked && q?.status !== 'sent' && (!q || can('edit')) && <button type="button" style={{ ...primaryBtnStyle, width: 'auto' }} disabled={busy} onClick={() => save('sent')}>Save and mark sent</button>}
            </div>
          </div>
        )}
      </Modal>

      <ProductsModal open={showProducts} onClose={() => setShowProducts(false)} products={products} currency={activeCurrencyCode()} canEdit={can('manage_pipeline')} onChanged={load} />

      <Modal open={!!settings} onClose={() => setSettings(null)} title="Your business details" width={520}>
        {settings && (
          <form onSubmit={saveSettings}>
            <label style={fieldLabelStyle} htmlFor="s-name">Business name</label>
            <input id="s-name" style={fieldInputStyle} value={settings.business_name} maxLength={160} onChange={(e) => setSettings({ ...settings, business_name: e.target.value })} />
            <label style={fieldLabelStyle} htmlFor="s-details">Address, tax number, how to pay (printed as typed)</label>
            <textarea id="s-details" style={{ ...fieldInputStyle, minHeight: 70 }} value={settings.details} maxLength={1000} onChange={(e) => setSettings({ ...settings, details: e.target.value })} />
            <label style={fieldLabelStyle} htmlFor="s-terms">Terms printed on every quote</label>
            <textarea id="s-terms" style={{ ...fieldInputStyle, minHeight: 70 }} value={settings.terms} maxLength={3000} onChange={(e) => setSettings({ ...settings, terms: e.target.value })} />
            <label style={fieldLabelStyle} htmlFor="s-prefix">Quote numbers start with</label>
            <input id="s-prefix" style={fieldInputStyle} value={settings.prefix} maxLength={12} onChange={(e) => setSettings({ ...settings, prefix: e.target.value })} />
            <div style={{ ...small, marginBottom: 10 }}>A quote keeps the details it had when it was marked sent.</div>
            {problem && <div role="alert" style={{ ...small, color: 'var(--red)', marginBottom: 10 }}>{problem}</div>}
            <button type="submit" style={primaryBtnStyle}>Save</button>
          </form>
        )}
      </Modal>
    </div>
  );
}
