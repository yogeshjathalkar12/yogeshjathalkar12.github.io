import { useMemo, useState } from 'react';
import { primaryBtnStyle } from '../crm/Modal';

export interface PickerItem {
  id: string;
  category: string;
  name: string;
  when: string;
  badge?: string;                                 // a short tag next to the category, e.g. "set of 6" or "needs Meta approval"
  detail: string;                                 // what the template says, shown in the preview
  copy?: { label: string; text: string }[];       // things worth copying (a message to paste into WhatsApp Manager)
  mine?: boolean;                                 // a template the team saved: it can be deleted by people who may
}

const noteStyle = { fontSize: '0.74rem', color: 'var(--dim)', lineHeight: 1.6 } as const;
const chipStyle = (on: boolean) => ({
  padding: '0.3rem 0.7rem', borderRadius: 999, cursor: 'pointer', fontSize: '0.68rem',
  border: `1px solid ${on ? 'var(--purple, #7c3aed)' : 'var(--border)'}`, background: on ? 'rgba(124,58,237,0.15)' : 'transparent', color: 'var(--white)',
}) as const;
const ghostSmall = { padding: '0.4rem 0.8rem', background: 'transparent', color: 'var(--white)', border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer', fontSize: '0.68rem' } as const;

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;                                  // clipboard blocked: the text is still visible in the preview to select by hand
  }
}

interface Props {
  title?: string;
  intro: string;
  items: PickerItem[];
  categories: string[];
  actionLabel: string;
  onUse: (id: string) => void;
  /** Steps shown above the list (for example how to get a message template approved by Meta). */
  guide?: { title: string; steps: string[]; note?: string };
  disabledReason?: string;
  /** Given only to people who may delete: removes a saved template for everyone. */
  onDelete?: (id: string) => void;
}

// A browsable library of ready-made things so nobody starts from a blank form. The page decides what "use" means.
export default function WaTemplatePicker({ title = 'Start from a template', intro, items, categories, actionLabel, onUse, guide, disabledReason, onDelete }: Props) {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState('All');
  const [preview, setPreview] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const shown = useMemo(() => items.filter((i) => category === 'All' || i.category === category), [items, category]);

  async function doCopy(key: string, text: string) {
    if (await copyText(text)) {
      setCopied(key);
      setTimeout(() => setCopied((c) => (c === key ? null : c)), 1500);
    }
  }

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '0.9rem 1rem', background: 'var(--surface)', marginBottom: '1.2rem', maxWidth: 960 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.8rem', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <strong style={{ color: 'var(--white)' }}>{title}</strong>
          <div style={noteStyle}>{intro}</div>
        </div>
        <button type="button" style={{ ...primaryBtnStyle, flex: 'none' }} onClick={() => setOpen((o) => !o)}>{open ? 'Hide templates' : 'Browse templates'}</button>
      </div>

      {open && (
        <div style={{ marginTop: '1rem' }}>
          {guide && (
            <div style={{ border: '1px solid var(--border)', borderRadius: 6, padding: '0.7rem 0.9rem', marginBottom: '0.9rem' }}>
              <div style={{ fontSize: '0.74rem', color: 'var(--white)', marginBottom: '0.3rem' }}><strong>{guide.title}</strong></div>
              <ol style={{ ...noteStyle, margin: 0, paddingLeft: '1.1rem' }}>{guide.steps.map((s) => <li key={s}>{s}</li>)}</ol>
              {guide.note && <div style={{ ...noteStyle, marginTop: '0.4rem' }}>{guide.note}</div>}
            </div>
          )}
          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '0.9rem' }}>
            {['All', ...categories].map((c) => <button key={c} type="button" style={chipStyle(category === c)} onClick={() => setCategory(c)}>{c}</button>)}
          </div>
          {disabledReason && <div style={{ ...noteStyle, color: 'var(--red, #ef5350)', marginBottom: '0.6rem' }}>{disabledReason}</div>}
          {shown.length === 0 && <div style={noteStyle}>Nothing in this group yet.</div>}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 300px), 1fr))', gap: '0.7rem' }}>
            {shown.map((t) => {
              const isOpen = preview === t.id;
              return (
                <div key={t.id} style={{ border: '1px solid var(--border)', borderRadius: 6, padding: '0.8rem', background: 'var(--surface2, transparent)' }}>
                  <div style={{ fontSize: '0.6rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--purple, #7c3aed)' }}>{t.category}{t.badge ? ` · ${t.badge}` : ''}</div>
                  <strong style={{ color: 'var(--white)', fontSize: '0.85rem' }}>{t.name}</strong>
                  <div style={{ ...noteStyle, margin: '0.25rem 0 0.6rem' }}>{t.when}</div>
                  {isOpen && (
                    <div style={{ borderTop: '1px solid var(--border)', paddingTop: '0.6rem', marginBottom: '0.6rem', maxHeight: 320, overflowY: 'auto' }}>
                      <div style={{ ...noteStyle, whiteSpace: 'pre-wrap', color: 'var(--white)' }}>{t.detail}</div>
                      {t.copy && t.copy.length > 0 && (
                        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginTop: '0.6rem' }}>
                          {t.copy.map((c) => (
                            <button key={c.label} type="button" style={ghostSmall} onClick={() => doCopy(`${t.id}:${c.label}`, c.text)}>
                              {copied === `${t.id}:${c.label}` ? 'Copied' : c.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <button type="button" style={ghostSmall} onClick={() => setPreview(isOpen ? null : t.id)}>{isOpen ? 'Hide' : 'Preview'}</button>
                    <button type="button" style={{ ...primaryBtnStyle, flex: 'none', padding: '0.4rem 0.8rem' }} disabled={!!disabledReason}
                      onClick={() => { onUse(t.id); setOpen(false); setPreview(null); }}>
                      {actionLabel}
                    </button>
                    {t.mine && onDelete && (
                      <button type="button" style={{ ...ghostSmall, color: 'var(--red, #ef5350)' }}
                        onClick={() => { if (window.confirm(`Delete "${t.name}" for everyone in your organization?`)) onDelete(t.id); }}>Delete</button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
