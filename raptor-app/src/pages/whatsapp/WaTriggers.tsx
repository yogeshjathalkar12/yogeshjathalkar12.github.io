import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { fieldInputStyle, primaryBtnStyle } from '../../components/crm/Modal';

type ReplyKind = 'text' | 'buttons' | 'list' | 'catalog' | 'product' | 'product_list';

interface ButtonRow { id: string; title: string; }
interface ListRow { id: string; title: string; description: string; }
interface ProductSection { title: string; product_retailer_ids: string; } // comma-separated in the UI, split on save

const MAX_BUTTONS = 3;
const MAX_LIST_ROWS = 10;
const MAX_SECTIONS = 10;

function slugify(title: string): string {
  return title.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || `opt_${Date.now()}`;
}

export default function WaTriggers() {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [accountId, setAccountId] = useState('');
  const [triggers, setTriggers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [keyword, setKeyword] = useState('');
  const [matchType, setMatchType] = useState<'contains' | 'exact'>('contains');
  const [replyKind, setReplyKind] = useState<ReplyKind>('text');

  const [replyText, setReplyText] = useState('');
  const [bodyText, setBodyText] = useState('');
  const [buttons, setButtons] = useState<ButtonRow[]>([{ id: '', title: '' }]);
  const [listButtonLabel, setListButtonLabel] = useState('View options');
  const [listRows, setListRows] = useState<ListRow[]>([{ id: '', title: '', description: '' }]);

  // Catalog-related fields
  const [thumbnailProductId, setThumbnailProductId] = useState('');
  const [singleProductId, setSingleProductId] = useState('');
  const [productSections, setProductSections] = useState<ProductSection[]>([{ title: '', product_retailer_ids: '' }]);

  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const currentAccount = accounts.find((a) => a.id === accountId);
  const catalogConnected = !!currentAccount?.catalog_id;

  useEffect(() => { fetchAccounts(); }, []);
  useEffect(() => { if (accountId) fetchTriggers(); }, [accountId]);

  async function fetchAccounts() {
    const { data } = await supabase.from('whatsapp_accounts').select('*');
    setAccounts(data || []);
    if (data && data.length > 0) setAccountId(data[0].id);
    setLoading(false);
  }

  async function fetchTriggers() {
    const { data } = await supabase.from('whatsapp_triggers').select('*').eq('account_id', accountId).order('created_at', { ascending: false });
    setTriggers(data || []);
  }

  function resetForm() {
    setKeyword(''); setReplyText(''); setBodyText('');
    setButtons([{ id: '', title: '' }]);
    setListButtonLabel('View options');
    setListRows([{ id: '', title: '', description: '' }]);
    setThumbnailProductId('');
    setSingleProductId('');
    setProductSections([{ title: '', product_retailer_ids: '' }]);
  }

  function updateButton(idx: number, title: string) {
    setButtons((prev) => prev.map((b, i) => (i === idx ? { id: slugify(title), title } : b)));
  }
  function addButton() { if (buttons.length < MAX_BUTTONS) setButtons((prev) => [...prev, { id: '', title: '' }]); }
  function removeButton(idx: number) { setButtons((prev) => prev.filter((_, i) => i !== idx)); }

  function updateListRow(idx: number, patch: Partial<ListRow>) {
    setListRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch, id: patch.title !== undefined ? slugify(patch.title) : r.id } : r)));
  }
  function addListRow() { if (listRows.length < MAX_LIST_ROWS) setListRows((prev) => [...prev, { id: '', title: '', description: '' }]); }
  function removeListRow(idx: number) { setListRows((prev) => prev.filter((_, i) => i !== idx)); }

  function updateSection(idx: number, patch: Partial<ProductSection>) {
    setProductSections((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  }
  function addSection() { if (productSections.length < MAX_SECTIONS) setProductSections((prev) => [...prev, { title: '', product_retailer_ids: '' }]); }
  function removeSection(idx: number) { setProductSections((prev) => prev.filter((_, i) => i !== idx)); }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!keyword.trim()) { setError('Keyword is required.'); return; }

    const row: any = { account_id: accountId, keyword: keyword.trim(), match_type: matchType, reply_kind: replyKind };

    if (replyKind === 'text') {
      if (!replyText.trim()) { setError('Reply text is required.'); return; }
      row.reply_text = replyText.trim();
      row.reply_payload = null;
    } else if (replyKind === 'buttons') {
      const validButtons = buttons.filter((b) => b.title.trim());
      if (!bodyText.trim() || validButtons.length === 0) { setError('Body text and at least one button are required.'); return; }
      row.reply_text = bodyText.trim(); // fallback preview text
      row.reply_payload = { body: bodyText.trim(), buttons: validButtons };
    } else if (replyKind === 'list') {
      const validRows = listRows.filter((r) => r.title.trim());
      if (!bodyText.trim() || validRows.length === 0) { setError('Body text and at least one list option are required.'); return; }
      row.reply_text = bodyText.trim();
      row.reply_payload = { body: bodyText.trim(), button_label: listButtonLabel.trim() || 'View options', rows: validRows };
    } else if (replyKind === 'catalog') {
      if (!bodyText.trim()) { setError('Body text is required.'); return; }
      row.reply_text = bodyText.trim();
      row.reply_payload = { body: bodyText.trim(), thumbnail_product_retailer_id: thumbnailProductId.trim() || undefined };
    } else if (replyKind === 'product') {
      if (!singleProductId.trim()) { setError('Product retailer ID is required.'); return; }
      row.reply_text = `[Product: ${singleProductId.trim()}]`;
      row.reply_payload = { product_retailer_id: singleProductId.trim() };
    } else {
      const validSections = productSections
        .filter((s) => s.title.trim() && s.product_retailer_ids.trim())
        .map((s) => ({ title: s.title.trim(), product_retailer_ids: s.product_retailer_ids.split(',').map((id) => id.trim()).filter(Boolean) }));
      if (!bodyText.trim() || validSections.length === 0) { setError('Body text and at least one section with product IDs are required.'); return; }
      row.reply_text = bodyText.trim();
      row.reply_payload = { body: bodyText.trim(), sections: validSections };
    }

    setCreating(true);
    setError(null);
    try {
      const { error: insertErr } = await supabase.from('whatsapp_triggers').insert(row);
      if (insertErr) throw insertErr;
      resetForm();
      fetchTriggers();
    } catch (err: any) {
      setError(err.message || 'Could not create trigger.');
    } finally {
      setCreating(false);
    }
  }

  async function toggleActive(id: string, current: boolean) {
    await supabase.from('whatsapp_triggers').update({ is_active: !current }).eq('id', id);
    fetchTriggers();
  }

  async function handleRemove(id: string) {
    await supabase.from('whatsapp_triggers').delete().eq('id', id);
    fetchTriggers();
  }

  function describeReply(t: any): string {
    if (t.reply_kind === 'buttons') {
      const titles = (t.reply_payload?.buttons || []).map((b: any) => b.title).join(' · ');
      return `[Buttons] ${t.reply_payload?.body || ''} → ${titles}`;
    }
    if (t.reply_kind === 'list') {
      const titles = (t.reply_payload?.rows || []).map((r: any) => r.title).join(' · ');
      return `[List] ${t.reply_payload?.body || ''} → ${titles}`;
    }
    if (t.reply_kind === 'catalog') {
      return `[Catalog] ${t.reply_payload?.body || ''}`;
    }
    if (t.reply_kind === 'product') {
      return `[Product] ${t.reply_payload?.product_retailer_id || ''}`;
    }
    if (t.reply_kind === 'product_list') {
      const count = (t.reply_payload?.sections || []).reduce((sum: number, s: any) => sum + (s.product_retailer_ids?.length || 0), 0);
      return `[Product List] ${t.reply_payload?.body || ''} → ${count} product(s)`;
    }
    return t.reply_text;
  }

  if (loading) return <div style={{ padding: '2rem', color: 'var(--dim)' }}>Loading…</div>;
  if (accounts.length === 0) {
    return <div style={{ padding: '2rem', color: 'var(--dim)', fontSize: '0.7rem' }}>Connect a WhatsApp number first.</div>;
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.4rem' }}>
        <select style={{ ...fieldInputStyle, marginBottom: 0, width: 240 }} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
          {accounts.map((a) => (<option key={a.id} value={a.id}>{a.label}</option>))}
        </select>
      </div>

      <div style={{ fontSize: '0.6rem', color: 'var(--dim)', marginBottom: '1.2rem', maxWidth: 620 }}>
        Fires only on an inbound message — free-form replies, buttons, and lists are only allowed within Meta's 24-hour session window, which an inbound message always satisfies. "STOP"/"unsubscribe" are handled automatically as opt-outs. Tapping a button or list option counts as an inbound message too, so its id can match another trigger's keyword — useful for building simple multi-step flows.
      </div>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px', padding: '1.4rem', marginBottom: '1.6rem', maxWidth: 560 }}>
        <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: '1.2rem', marginBottom: '1rem' }}>New Trigger</div>
        <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
          <input style={fieldInputStyle} placeholder="Keyword (e.g. pricing, or a button id like opt_pricing)" value={keyword} onChange={(e) => setKeyword(e.target.value)} />
          <select style={fieldInputStyle} value={matchType} onChange={(e) => setMatchType(e.target.value as 'contains' | 'exact')}>
            <option value="contains">Message contains this word</option>
            <option value="exact">Message is exactly this</option>
          </select>

          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {(['text', 'buttons', 'list', 'catalog', 'product', 'product_list'] as ReplyKind[]).map((kind) => (
              <button
                key={kind}
                type="button"
                onClick={() => setReplyKind(kind)}
                style={{
                  flex: '1 1 auto',
                  minWidth: 90,
                  background: replyKind === kind ? 'var(--grad)' : 'transparent',
                  color: replyKind === kind ? '#fff' : 'var(--dim)',
                  border: '1px solid var(--border)',
                  borderRadius: '4px',
                  padding: '0.5rem',
                  cursor: 'pointer',
                  fontFamily: 'var(--mono)',
                  fontSize: '0.6rem',
                  textTransform: 'uppercase',
                }}
              >
                {kind === 'text' ? 'Plain text' : kind === 'buttons' ? 'Buttons' : kind === 'list' ? 'List' : kind === 'catalog' ? 'Catalog' : kind === 'product' ? 'Product' : 'Product List'}
              </button>
            ))}
          </div>

          {['catalog', 'product', 'product_list'].includes(replyKind) && !catalogConnected && (
            <div style={{ fontSize: '0.6rem', color: 'var(--red)' }}>
              This account has no Commerce Catalog ID set — add one under WhatsApp → Connection before using catalog replies.
            </div>
          )}

          {replyKind === 'text' && (
            <textarea style={{ ...fieldInputStyle, minHeight: 100, resize: 'vertical' }} placeholder="Auto-reply text" value={replyText} onChange={(e) => setReplyText(e.target.value)} />
          )}

          {replyKind === 'buttons' && (
            <>
              <textarea style={{ ...fieldInputStyle, minHeight: 70, resize: 'vertical' }} placeholder="Message body shown above the buttons" value={bodyText} onChange={(e) => setBodyText(e.target.value)} />
              {buttons.map((b, idx) => (
                <div key={idx} style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.6rem', color: 'var(--dim)', width: 20 }}>{idx + 1}</span>
                  <input style={{ ...fieldInputStyle, marginBottom: 0, flex: 1 }} placeholder="Button label (e.g. Pricing)" maxLength={20} value={b.title} onChange={(e) => updateButton(idx, e.target.value)} />
                  {buttons.length > 1 && (
                    <button type="button" onClick={() => removeButton(idx)} style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--red)', borderRadius: '4px', fontSize: '0.6rem', padding: '0.3rem 0.5rem' }}>✕</button>
                  )}
                </div>
              ))}
              {buttons.length < MAX_BUTTONS && (
                <button type="button" onClick={addButton} style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--dim)', borderRadius: '4px', fontSize: '0.6rem', padding: '0.4rem', alignSelf: 'flex-start' }}>
                  + Add button (max {MAX_BUTTONS})
                </button>
              )}
            </>
          )}

          {replyKind === 'list' && (
            <>
              <textarea style={{ ...fieldInputStyle, minHeight: 70, resize: 'vertical' }} placeholder="Message body shown above the list" value={bodyText} onChange={(e) => setBodyText(e.target.value)} />
              <input style={fieldInputStyle} placeholder="List button label (e.g. View options)" maxLength={20} value={listButtonLabel} onChange={(e) => setListButtonLabel(e.target.value)} />
              {listRows.map((r, idx) => (
                <div key={idx} style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.6rem', color: 'var(--dim)', width: 20 }}>{idx + 1}</span>
                  <input style={{ ...fieldInputStyle, marginBottom: 0, flex: 1 }} placeholder="Option title" maxLength={24} value={r.title} onChange={(e) => updateListRow(idx, { title: e.target.value })} />
                  <input style={{ ...fieldInputStyle, marginBottom: 0, flex: 1 }} placeholder="Description (optional)" maxLength={72} value={r.description} onChange={(e) => updateListRow(idx, { description: e.target.value })} />
                  {listRows.length > 1 && (
                    <button type="button" onClick={() => removeListRow(idx)} style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--red)', borderRadius: '4px', fontSize: '0.6rem', padding: '0.3rem 0.5rem' }}>✕</button>
                  )}
                </div>
              ))}
              {listRows.length < MAX_LIST_ROWS && (
                <button type="button" onClick={addListRow} style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--dim)', borderRadius: '4px', fontSize: '0.6rem', padding: '0.4rem', alignSelf: 'flex-start' }}>
                  + Add option (max {MAX_LIST_ROWS})
                </button>
              )}
            </>
          )}

          {replyKind === 'catalog' && (
            <>
              <textarea style={{ ...fieldInputStyle, minHeight: 70, resize: 'vertical' }} placeholder="Message body shown above the catalog link" value={bodyText} onChange={(e) => setBodyText(e.target.value)} />
              <input style={fieldInputStyle} placeholder="Thumbnail product retailer ID (optional — shows as the preview image)" value={thumbnailProductId} onChange={(e) => setThumbnailProductId(e.target.value)} />
              <div style={{ fontSize: '0.55rem', color: 'var(--dim2)' }}>
                Sends your whole connected Commerce Catalog with a "View catalog" button. The customer browses everything in it.
              </div>
            </>
          )}

          {replyKind === 'product' && (
            <>
              <input style={fieldInputStyle} placeholder="Product retailer ID (SKU from your catalog)" value={singleProductId} onChange={(e) => setSingleProductId(e.target.value)} />
              <div style={{ fontSize: '0.55rem', color: 'var(--dim2)' }}>
                Sends a single product card — image, name, and price pulled live from your catalog. No body text field; Meta renders the product info itself.
              </div>
            </>
          )}

          {replyKind === 'product_list' && (
            <>
              <textarea style={{ ...fieldInputStyle, minHeight: 70, resize: 'vertical' }} placeholder="Message body shown above the products" value={bodyText} onChange={(e) => setBodyText(e.target.value)} />
              {productSections.map((s, idx) => (
                <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', border: '1px solid var(--border)', borderRadius: '4px', padding: '0.6rem' }}>
                  <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
                    <input style={{ ...fieldInputStyle, marginBottom: 0, flex: 1 }} placeholder="Section title (e.g. Best sellers)" value={s.title} onChange={(e) => updateSection(idx, { title: e.target.value })} />
                    {productSections.length > 1 && (
                      <button type="button" onClick={() => removeSection(idx)} style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--red)', borderRadius: '4px', fontSize: '0.6rem', padding: '0.3rem 0.5rem' }}>✕</button>
                    )}
                  </div>
                  <input style={{ ...fieldInputStyle, marginBottom: 0 }} placeholder="Product retailer IDs, comma-separated (e.g. SKU1, SKU2, SKU3)" value={s.product_retailer_ids} onChange={(e) => updateSection(idx, { product_retailer_ids: e.target.value })} />
                </div>
              ))}
              {productSections.length < MAX_SECTIONS && (
                <button type="button" onClick={addSection} style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--dim)', borderRadius: '4px', fontSize: '0.6rem', padding: '0.4rem', alignSelf: 'flex-start' }}>
                  + Add section (max {MAX_SECTIONS})
                </button>
              )}
            </>
          )}

          {error && <div style={{ color: 'var(--red)', fontSize: '0.65rem' }}>{error}</div>}
          <button type="submit" style={primaryBtnStyle} disabled={creating}>{creating ? 'Creating…' : 'Create Trigger'}</button>
        </form>
      </div>

      <div style={{ fontSize: '0.58rem', letterSpacing: '0.18em', color: 'var(--dim)', textTransform: 'uppercase', marginBottom: '0.8rem' }}>Triggers</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem', maxWidth: 620 }}>
        {triggers.length === 0 ? (
          <div style={{ color: 'var(--dim2)', fontSize: '0.65rem' }}>No triggers yet.</div>
        ) : (
          triggers.map((t) => (
            <div key={t.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px', padding: '1rem 1.2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--white)' }}>
                  "{t.keyword}" ({t.match_type})
                  {t.reply_kind !== 'text' && (
                    <span style={{ marginLeft: '0.5rem', fontSize: '0.55rem', color: 'var(--purple)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      {t.reply_kind}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: '0.6rem', color: 'var(--dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{describeReply(t)}</div>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
                <button onClick={() => toggleActive(t.id, t.is_active)} style={{ background: 'transparent', border: '1px solid var(--border)', color: t.is_active ? 'var(--accent)' : 'var(--dim)', padding: '0.4rem 0.8rem', borderRadius: '4px', cursor: 'pointer', fontSize: '0.6rem' }}>
                  {t.is_active ? 'Active' : 'Paused'}
                </button>
                <button onClick={() => handleRemove(t.id)} style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--red)', padding: '0.4rem 0.8rem', borderRadius: '4px', cursor: 'pointer', fontSize: '0.6rem' }}>
                  Remove
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}