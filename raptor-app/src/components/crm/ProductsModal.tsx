import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import Modal, { fieldInputStyle, fieldLabelStyle, primaryBtnStyle, toolBtnStyle, toolPrimaryStyle, ghostBtnStyle } from './Modal';
import { type Product, money, units } from '../../lib/quotes';

// The price list quotes are made from.

const blank = { id: '', name: '', sku: '', description: '', unit_price: '0', tax_percent: '0', active: true };

export default function ProductsModal({ open, onClose, products, currency, canEdit, onChanged }: {
  open: boolean; onClose: () => void; products: Product[]; currency: string; canEdit: boolean; onChanged: () => void;
}) {
  const [editing, setEditing] = useState<typeof blank | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setEditing(null); setError(''); } }, [open]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    if (!editing.name.trim()) { setError('Give the product a name.'); return; }
    const price = units(editing.unit_price, 2), tax = units(editing.tax_percent || '0', 2);
    if (price === null) { setError('The price is a number, 0 or more.'); return; }
    if (tax === null || tax > 10000n) { setError('The tax is 0 to 100 percent.'); return; }
    setBusy(true); setError('');
    const row = { name: editing.name.trim(), sku: editing.sku.trim(), description: editing.description.trim(), unit_price: Number(price) / 100, tax_percent: Number(tax) / 100, active: editing.active };
    const { error: failed } = editing.id ? await supabase.from('products').update(row).eq('id', editing.id) : await supabase.from('products').insert(row);
    setBusy(false);
    if (failed) { setError(failed.message); return; }
    setEditing(null);
    onChanged();
  }

  async function remove(id: string) {
    if (!confirm('Delete this product? Quotes already made keep their lines.')) return;
    const { error: failed } = await supabase.from('products').delete().eq('id', id);
    if (failed) { setError(failed.message); return; }
    setEditing(null);
    onChanged();
  }

  const set = (patch: Partial<typeof blank>) => setEditing((p) => (p ? { ...p, ...patch } : p));

  return (
    <Modal open={open} onClose={onClose} title="Products" width={560}>
      {editing ? (
        <form onSubmit={save} noValidate>
          <label style={fieldLabelStyle} htmlFor="p-name">Name</label>
          <input id="p-name" style={fieldInputStyle} value={editing.name} maxLength={160} onChange={(e) => set({ name: e.target.value })} />
          <label style={fieldLabelStyle} htmlFor="p-sku">Code (optional)</label>
          <input id="p-sku" style={fieldInputStyle} value={editing.sku} maxLength={60} onChange={(e) => set({ sku: e.target.value })} />
          <label style={fieldLabelStyle} htmlFor="p-desc">Description (optional)</label>
          <textarea id="p-desc" style={{ ...fieldInputStyle, minHeight: 56 }} value={editing.description} maxLength={1000} onChange={(e) => set({ description: e.target.value })} />
          <label style={fieldLabelStyle} htmlFor="p-price">Price for one ({currency})</label>
          <input id="p-price" style={fieldInputStyle} inputMode="decimal" value={editing.unit_price} onChange={(e) => set({ unit_price: e.target.value })} />
          <label style={fieldLabelStyle} htmlFor="p-tax">Tax percent</label>
          <input id="p-tax" style={fieldInputStyle} inputMode="decimal" value={editing.tax_percent} onChange={(e) => set({ tax_percent: e.target.value })} />
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: '0.7rem', marginBottom: 12 }}><input type="checkbox" checked={editing.active} onChange={(e) => set({ active: e.target.checked })} /> Offered when making quotes</label>
          {error && <div role="alert" style={{ color: 'var(--red)', fontSize: '0.65rem', marginBottom: 10 }}>{error}</div>}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            {editing.id && <button type="button" style={{ ...ghostBtnStyle, color: 'var(--red)', marginRight: 'auto' }} onClick={() => remove(editing.id)}>Delete</button>}
            <button type="button" style={ghostBtnStyle} onClick={() => setEditing(null)}>Back</button>
            <button type="submit" style={{ ...primaryBtnStyle, width: 'auto' }} disabled={busy}>Save product</button>
          </div>
        </form>
      ) : (
        <div>
          {canEdit && <button type="button" style={{ ...toolPrimaryStyle, marginBottom: 12 }} onClick={() => { setError(''); setEditing({ ...blank }); }}>+ New product</button>}
          {!canEdit && <div style={{ fontSize: '0.65rem', color: 'var(--dim)', marginBottom: 10 }}>The price list is changed by people who manage the pipeline.</div>}
          {error && <div role="alert" style={{ color: 'var(--red)', fontSize: '0.65rem', marginBottom: 10 }}>{error}</div>}
          {products.length === 0 && <div style={{ fontSize: '0.7rem', color: 'var(--dim)' }}>No products yet. Quote lines can also be typed by hand.</div>}
          {products.map((p) => (
            <div key={p.id} style={{ display: 'flex', gap: 10, alignItems: 'center', borderTop: '1px solid var(--border)', padding: '0.6rem 0', fontSize: '0.7rem', opacity: p.active ? 1 : 0.5 }}>
              <div style={{ flex: 1, minWidth: 0 }}>{p.name}<div style={{ color: 'var(--dim)', fontSize: '0.6rem' }}>{p.sku ? `${p.sku} · ` : ''}{money(p.unit_price, currency)}{Number(p.tax_percent) ? ` + ${Number(p.tax_percent)}% tax` : ''}</div></div>
              {canEdit && <button type="button" style={toolBtnStyle} onClick={() => { setError(''); setEditing({ ...p, unit_price: String(p.unit_price), tax_percent: String(p.tax_percent) }); }}>Edit</button>}
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
