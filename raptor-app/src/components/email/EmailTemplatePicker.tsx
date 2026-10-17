import { useMemo, useState } from 'react';
import {
  EMAIL_CATEGORIES, EMAIL_TEMPLATES, SEQUENCE_TEMPLATES,
  type EmailTemplate, type SequenceTemplate, type TemplateBlock,
} from '../../lib/emailTemplates';
import { primaryBtnStyle } from '../crm/Modal';

const noteStyle = { fontSize: '0.74rem', color: 'var(--dim)', lineHeight: 1.6 } as const;
const chipStyle = (on: boolean) => ({
  padding: '0.3rem 0.7rem', borderRadius: 999, cursor: 'pointer', fontSize: '0.68rem',
  border: `1px solid ${on ? 'var(--purple, #7c3aed)' : 'var(--border)'}`, background: on ? 'rgba(124,58,237,0.15)' : 'transparent', color: 'var(--white)',
}) as const;
const ghostSmall = { padding: '0.4rem 0.8rem', background: 'transparent', color: 'var(--white)', border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer', fontSize: '0.68rem' } as const;

export function blocksAsText(blocks: TemplateBlock[]): string {
  return blocks.map((b) => (b.type === 'button' ? `[ Button: ${b.label} ]` : b.content)).join('\n\n');
}

interface Props {
  /** What the person can start: one email (fills the form), or a whole sequence (creates it with all its steps). */
  singles?: boolean;
  sequences?: boolean;
  /** Show this category first (e.g. 'Automatic emails' on the Triggers page). */
  firstCategory?: string;
  onUseSingle?: (template: EmailTemplate) => void;
  onUseSequence?: (template: SequenceTemplate) => void;
  /** Disable "Use" with a reason (e.g. no mailbox connected yet). */
  disabledReason?: string;
}

// A browsable library of ready-made emails so nobody starts from a blank form. Picking one fills the form or builds the
// sequence; everything stays editable, and the blanks in [square brackets] are flagged until they are filled in.
export default function EmailTemplatePicker({ singles = true, sequences = false, firstCategory, onUseSingle, onUseSequence, disabledReason }: Props) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'single' | 'sequence'>(singles ? 'single' : 'sequence');
  const [category, setCategory] = useState('All');
  const [preview, setPreview] = useState<string | null>(null);

  const categories = useMemo(() => {
    const list = [...EMAIL_CATEGORIES];
    if (firstCategory && list.includes(firstCategory)) list.unshift(...list.splice(list.indexOf(firstCategory), 1));
    return ['All', ...list];
  }, [firstCategory]);

  const items = useMemo(() => {
    const order = (c: string) => categories.indexOf(c);
    if (tab === 'single') {
      return EMAIL_TEMPLATES.filter((t) => category === 'All' || t.category === category).sort((a, b) => order(a.category) - order(b.category));
    }
    return SEQUENCE_TEMPLATES.filter((t) => category === 'All' || t.category === category).sort((a, b) => order(a.category) - order(b.category));
  }, [tab, category, categories]);

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '0.9rem 1rem', background: 'var(--surface)', marginBottom: '1.2rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.8rem', flexWrap: 'wrap' }}>
        <div>
          <strong style={{ color: 'var(--white)' }}>Start from a template</strong>
          <div style={noteStyle}>Ready-made emails you can use as they are or change. Fill in the parts in [square brackets] before you send.</div>
        </div>
        <button type="button" style={{ ...primaryBtnStyle, flex: 'none' }} onClick={() => setOpen((o) => !o)}>{open ? 'Hide templates' : 'Browse templates'}</button>
      </div>

      {open && (
        <div style={{ marginTop: '1rem' }}>
          {singles && sequences && (
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.7rem' }}>
              <button type="button" style={chipStyle(tab === 'single')} onClick={() => { setTab('single'); setPreview(null); }}>Single emails</button>
              <button type="button" style={chipStyle(tab === 'sequence')} onClick={() => { setTab('sequence'); setPreview(null); }}>Whole sequences</button>
            </div>
          )}
          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '0.9rem' }}>
            {categories.map((c) => <button key={c} type="button" style={chipStyle(category === c)} onClick={() => setCategory(c)}>{c}</button>)}
          </div>
          {disabledReason && <div style={{ ...noteStyle, color: 'var(--red, #ef5350)', marginBottom: '0.6rem' }}>{disabledReason}</div>}
          {items.length === 0 && <div style={noteStyle}>Nothing in this group yet.</div>}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 300px), 1fr))', gap: '0.7rem' }}>
            {items.map((t) => {
              const isOpen = preview === t.id;
              const isSingle = 'blocks' in t;
              return (
                <div key={t.id} style={{ border: '1px solid var(--border)', borderRadius: 6, padding: '0.8rem', background: 'var(--surface2, transparent)' }}>
                  <div style={{ fontSize: '0.6rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--purple, #7c3aed)' }}>{t.category}{isSingle && (t as EmailTemplate).trigger ? ' · automatic' : ''}{!isSingle ? ` · ${(t as SequenceTemplate).steps.length} emails` : ''}</div>
                  <strong style={{ color: 'var(--white)', fontSize: '0.85rem' }}>{t.name}</strong>
                  <div style={{ ...noteStyle, margin: '0.25rem 0 0.6rem' }}>{t.when}</div>
                  {isOpen && (
                    <div style={{ borderTop: '1px solid var(--border)', paddingTop: '0.6rem', marginBottom: '0.6rem', maxHeight: 320, overflowY: 'auto' }}>
                      {isSingle ? (
                        <>
                          <div style={{ fontSize: '0.74rem', color: 'var(--white)' }}><strong>Subject:</strong> {(t as EmailTemplate).subject}</div>
                          <div style={{ ...noteStyle, whiteSpace: 'pre-wrap', marginTop: '0.4rem' }}>{blocksAsText((t as EmailTemplate).blocks)}</div>
                        </>
                      ) : (
                        (t as SequenceTemplate).steps.map((s, i) => (
                          <div key={i} style={{ marginBottom: '0.7rem' }}>
                            <div style={{ fontSize: '0.7rem', color: 'var(--white)' }}><strong>Email {i + 1}</strong> · {i === 0 ? 'sent first' : `${s.delay_hours / 24 >= 1 ? `${Math.round(s.delay_hours / 24)} day(s)` : `${s.delay_hours} h`} later`}</div>
                            <div style={{ fontSize: '0.72rem', color: 'var(--white)' }}>Subject: {s.subject}</div>
                            <div style={{ ...noteStyle, whiteSpace: 'pre-wrap' }}>{blocksAsText(s.blocks)}</div>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <button type="button" style={ghostSmall} onClick={() => setPreview(isOpen ? null : t.id)}>{isOpen ? 'Hide' : 'Preview'}</button>
                    <button type="button" style={{ ...primaryBtnStyle, flex: 'none', padding: '0.4rem 0.8rem' }} disabled={!!disabledReason}
                      onClick={() => { if (isSingle) onUseSingle?.(t as EmailTemplate); else onUseSequence?.(t as SequenceTemplate); setOpen(false); setPreview(null); }}>
                      {isSingle ? 'Use this template' : 'Create this sequence'}
                    </button>
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
