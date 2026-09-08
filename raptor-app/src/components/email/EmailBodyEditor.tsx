import { useEffect, useState } from 'react';
import { fieldInputStyle } from '../crm/Modal';

/**
 * EmailBodyEditor — a block-based visual editor that produces an HTML
 * string, same as the <textarea> it replaces everywhere. Every existing
 * validation, submission, and rendering path in this app operates on
 * that string and needs ZERO changes — this component only changes how
 * the string gets authored.
 *
 * USAGE NOTE ON RESETTING: this component owns its block state
 * internally (not a fully-controlled input) — re-syncing blocks from a
 * changing `initialHtml` prop on every render would require parsing
 * arbitrary HTML back into blocks, which this deliberately doesn't do
 * (see the raw_html block below). To reset the editor after a form
 * submits, change the `resetKey` prop (e.g. bump a counter) — React
 * will remount the component fresh, which is the idiomatic way to reset
 * uncontrolled-ish component state rather than fighting the framework
 * with two-way sync logic.
 *
 * No HTML parser: pasting or switching from existing HTML wraps it as
 * one 'raw_html' block rather than trying to decompose it into
 * structured blocks — a real parser would be a much bigger, lossier
 * problem than this feature warrants. You can still build around a
 * raw_html block with normal blocks before/after it, or edit its
 * contents directly (it has its own textarea in the block list, same as
 * every other block type).
 */

let idCounter = 0;
function uid() {
  idCounter += 1;
  return `b${idCounter}_${Date.now()}`;
}

function escapeHtml(s: string): string {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/"/g, '&quot;');
}

const MERGE_FIELDS = [
  { tag: '{{first_name}}', label: 'First name' },
  { tag: '{{last_name}}', label: 'Last name' },
  { tag: '{{company}}', label: 'Company' },
];

const BLOCK_TYPES = [
  { type: 'text', label: '+ Text' },
  { type: 'heading', label: '+ Heading' },
  { type: 'button', label: '+ Button' },
  { type: 'image', label: '+ Image' },
  { type: 'divider', label: '+ Divider' },
  { type: 'spacer', label: '+ Spacer' },
  { type: 'raw_html', label: '+ Raw HTML' },
];

function defaultBlockFor(type: string): any {
  const id = uid();
  switch (type) {
    case 'text':
      return { id, type: 'text', content: '', align: 'left' };
    case 'heading':
      return { id, type: 'heading', content: '', align: 'left' };
    case 'button':
      return { id, type: 'button', label: 'Click here', url: '', align: 'left', color: '#7c3aed', textColor: '#ffffff' };
    case 'image':
      return { id, type: 'image', src: '', alt: '', link: '', width: '100%', align: 'left' };
    case 'divider':
      return { id, type: 'divider' };
    case 'spacer':
      return { id, type: 'spacer', height: '20' };
    case 'raw_html':
      return { id, type: 'raw_html', html: '' };
    default:
      return { id, type: 'text', content: '', align: 'left' };
  }
}

function defaultBlocks(): any[] {
  return [
    { id: uid(), type: 'text', content: 'Hi {{first_name}},', align: 'left' },
    { id: uid(), type: 'text', content: '', align: 'left' },
    { id: uid(), type: 'unsubscribe_footer', content: "You're receiving this because you subscribed." },
  ];
}

function blocksFromInitialHtml(initialHtml?: string): any[] {
  if (!initialHtml || !initialHtml.trim()) return defaultBlocks();
  // Wrap existing content as-is rather than parsing it — see module docstring.
  const hasUnsub = initialHtml.includes('{{unsubscribe_url}}');
  const blocks: any[] = [{ id: uid(), type: 'raw_html', html: initialHtml }];
  if (!hasUnsub) {
    blocks.push({ id: uid(), type: 'unsubscribe_footer', content: "You're receiving this because you subscribed." });
  }
  return blocks;
}

function blockToHtml(b: any): string {
  switch (b.type) {
    case 'text':
      return `<div style="font-size:14px;line-height:1.6;color:#333333;text-align:${b.align};padding-bottom:16px;">${escapeHtml(b.content).replace(/\n/g, '<br/>')}</div>`;
    case 'heading':
      return `<div style="font-size:22px;font-weight:bold;color:#111111;text-align:${b.align};padding-bottom:16px;">${escapeHtml(b.content)}</div>`;
    case 'button': {
      const margin = b.align === 'center' ? '0 auto 16px auto' : b.align === 'right' ? '0 0 16px auto' : '0 0 16px 0';
      return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:${margin};"><tr><td style="border-radius:4px;background-color:${escapeAttr(b.color)};"><a href="${escapeAttr(b.url)}" style="display:inline-block;padding:12px 24px;color:${escapeAttr(b.textColor)};text-decoration:none;font-size:14px;font-weight:bold;font-family:Arial,sans-serif;">${escapeHtml(b.label)}</a></td></tr></table>`;
    }
    case 'image': {
      const img = `<img src="${escapeAttr(b.src)}" alt="${escapeAttr(b.alt)}" width="${escapeAttr(b.width || '100%')}" style="max-width:100%;height:auto;display:block;border:0;" />`;
      const wrapped = b.link ? `<a href="${escapeAttr(b.link)}">${img}</a>` : img;
      return `<div style="padding-bottom:16px;text-align:${b.align};">${wrapped}</div>`;
    }
    case 'divider':
      return `<div style="padding-bottom:16px;"><hr style="border:none;border-top:1px solid #e0e0e0;margin:0;" /></div>`;
    case 'spacer':
      return `<div style="height:${escapeAttr(b.height || '20')}px;line-height:${escapeAttr(b.height || '20')}px;font-size:1px;">&nbsp;</div>`;
    case 'unsubscribe_footer':
      return `<div style="padding-top:16px;font-size:12px;color:#888888;text-align:center;">${escapeHtml(b.content)} <a href="{{unsubscribe_url}}" style="color:#888888;">Unsubscribe</a>.</div>`;
    case 'raw_html':
      return b.html || '';
    default:
      return '';
  }
}

function blocksToHtml(blocks: any[]): string {
  const inner = blocks.map(blockToHtml).join('\n');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background:#ffffff;">
  <tr>
    <td style="padding:24px;font-family:Arial,Helvetica,sans-serif;">
${inner}
    </td>
  </tr>
</table>`;
}

const smallLabel: React.CSSProperties = { fontSize: '0.55rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--dim)' };
const smallInput: React.CSSProperties = { ...fieldInputStyle, marginBottom: '0.5rem', fontSize: '0.68rem', padding: '0.45rem 0.6rem' };
const mergeBtnStyle: React.CSSProperties = { background: 'transparent', border: '1px solid var(--border)', color: 'var(--dim)', padding: '0.2rem 0.5rem', borderRadius: '4px', cursor: 'pointer', fontSize: '0.55rem', fontFamily: 'var(--mono)' };

function MergeFieldRow({ onInsert }: { onInsert: (tag: string) => void }) {
  return (
    <div style={{ display: 'flex', gap: '0.3rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
      {MERGE_FIELDS.map((f) => (
        <button key={f.tag} type="button" style={mergeBtnStyle} onClick={() => onInsert(f.tag)}>
          {f.label}
        </button>
      ))}
    </div>
  );
}

function BlockFields({ block, onChange }: { block: any; onChange: (patch: any) => void }) {
  const alignSelect = (
    <select style={{ ...smallInput, width: 100, marginBottom: 0 }} value={block.align} onChange={(e) => onChange({ align: e.target.value })}>
      <option value="left">Left</option>
      <option value="center">Center</option>
      <option value="right">Right</option>
    </select>
  );

  switch (block.type) {
    case 'text':
      return (
        <div>
          <MergeFieldRow onInsert={(tag) => onChange({ content: (block.content || '') + tag })} />
          <textarea
            style={{ ...smallInput, minHeight: 70, resize: 'vertical' }}
            placeholder="Paragraph text…"
            value={block.content}
            onChange={(e) => onChange({ content: e.target.value })}
          />
          {alignSelect}
        </div>
      );
    case 'heading':
      return (
        <div>
          <MergeFieldRow onInsert={(tag) => onChange({ content: (block.content || '') + tag })} />
          <input style={smallInput} placeholder="Heading text" value={block.content} onChange={(e) => onChange({ content: e.target.value })} />
          {alignSelect}
        </div>
      );
    case 'button':
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
          <input style={smallInput} placeholder="Button label" value={block.label} onChange={(e) => onChange({ label: e.target.value })} />
          <input style={smallInput} placeholder="https://…" value={block.url} onChange={(e) => onChange({ url: e.target.value })} />
          <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
            <label style={{ ...smallLabel, display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              BG
              <input type="color" value={block.color} onChange={(e) => onChange({ color: e.target.value })} style={{ width: 28, height: 22, padding: 0, border: 'none', background: 'none' }} />
            </label>
            <label style={{ ...smallLabel, display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              Text
              <input type="color" value={block.textColor} onChange={(e) => onChange({ textColor: e.target.value })} style={{ width: 28, height: 22, padding: 0, border: 'none', background: 'none' }} />
            </label>
            {alignSelect}
          </div>
        </div>
      );
    case 'image':
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
          <input style={smallInput} placeholder="Image URL" value={block.src} onChange={(e) => onChange({ src: e.target.value })} />
          <input style={smallInput} placeholder="Alt text" value={block.alt} onChange={(e) => onChange({ alt: e.target.value })} />
          <input style={smallInput} placeholder="Link when clicked (optional)" value={block.link} onChange={(e) => onChange({ link: e.target.value })} />
          <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
            <label style={{ ...smallLabel, display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              Width
              <input style={{ ...smallInput, width: 70, marginBottom: 0 }} value={block.width} onChange={(e) => onChange({ width: e.target.value })} />
            </label>
            {alignSelect}
          </div>
        </div>
      );
    case 'spacer':
      return (
        <label style={{ ...smallLabel, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          Height
          <input type="number" min={4} style={{ ...smallInput, width: 70, marginBottom: 0 }} value={block.height} onChange={(e) => onChange({ height: e.target.value })} />
          px
        </label>
      );
    case 'unsubscribe_footer':
      return (
        <div>
          <input style={smallInput} placeholder="Footer text before the link" value={block.content} onChange={(e) => onChange({ content: e.target.value })} />
          <div style={{ fontSize: '0.55rem', color: 'var(--dim2)' }}>Always ends with an "Unsubscribe" link using {'{{unsubscribe_url}}'}.</div>
        </div>
      );
    case 'raw_html':
      return (
        <textarea
          style={{ ...smallInput, minHeight: 100, fontFamily: 'var(--mono)', resize: 'vertical' }}
          placeholder="Raw HTML…"
          value={block.html}
          onChange={(e) => onChange({ html: e.target.value })}
        />
      );
    case 'divider':
      return <div style={{ fontSize: '0.55rem', color: 'var(--dim2)' }}>A plain horizontal rule — nothing to configure.</div>;
    default:
      return null;
  }
}

const BLOCK_TYPE_LABELS: Record<string, string> = {
  text: 'Text', heading: 'Heading', button: 'Button', image: 'Image',
  divider: 'Divider', spacer: 'Spacer', unsubscribe_footer: 'Unsubscribe footer', raw_html: 'Raw HTML',
};

interface EmailBodyEditorProps {
  initialHtml?: string;
  onChange: (html: string) => void;
  requireUnsubscribe?: boolean;
}

export default function EmailBodyEditor({ initialHtml, onChange, requireUnsubscribe = true }: EmailBodyEditorProps) {
  const [mode, setMode] = useState<'visual' | 'html'>('visual');
  const [blocks, setBlocks] = useState<any[]>(() => blocksFromInitialHtml(initialHtml));
  const [htmlDraft, setHtmlDraft] = useState<string>(() => blocksToHtml(blocksFromInitialHtml(initialHtml)));

  useEffect(() => {
    // Sync the initial computed HTML (default blocks, or the wrapped
    // initialHtml) up to the parent immediately — onChange below only
    // fires from user edits, so without this the parent's own state
    // would stay whatever it was BEFORE this component mounted (often
    // empty) until the person actually touches a block. Submitting the
    // form untouched would then validate against stale/empty content
    // even though the preview already shows real content.
    onChange(blocksToHtml(blocks));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function emit(newBlocks: any[]) {
    setBlocks(newBlocks);
    const html = blocksToHtml(newBlocks);
    setHtmlDraft(html);
    onChange(html);
  }

  function updateBlock(index: number, patch: any) {
    emit(blocks.map((b, i) => (i === index ? { ...b, ...patch } : b)));
  }

  function addBlock(type: string) {
    emit([...blocks, defaultBlockFor(type)]);
  }

  function removeBlock(index: number) {
    emit(blocks.filter((_, i) => i !== index));
  }

  function moveBlock(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= blocks.length) return;
    const next = [...blocks];
    [next[index], next[target]] = [next[target], next[index]];
    emit(next);
  }

  function switchToHtmlMode() {
    setHtmlDraft(blocksToHtml(blocks));
    setMode('html');
  }

  function switchToVisualMode() {
    // Collapse whatever's in the HTML textarea into a single raw_html
    // block — same "wrap, don't parse" principle as initial seeding.
    const wrapped: any[] = [{ id: uid(), type: 'raw_html', html: htmlDraft }];
    if (!htmlDraft.includes('{{unsubscribe_url}}')) {
      wrapped.push({ id: uid(), type: 'unsubscribe_footer', content: "You're receiving this because you subscribed." });
    }
    setBlocks(wrapped);
    setMode('visual');
    onChange(blocksToHtml(wrapped));
  }

  function handleHtmlDraftChange(html: string) {
    setHtmlDraft(html);
    onChange(html);
  }

  const currentHtml = mode === 'html' ? htmlDraft : blocksToHtml(blocks);
  const missingUnsub = requireUnsubscribe && !currentHtml.includes('{{unsubscribe_url}}');

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: '6px', overflow: 'hidden' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0.7rem', background: 'var(--surface2)', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', gap: '0.4rem' }}>
          <button type="button" onClick={switchToVisualMode} style={{ ...mergeBtnStyle, background: mode === 'visual' ? 'var(--grad)' : 'transparent', color: mode === 'visual' ? '#fff' : 'var(--dim)' }}>
            Visual
          </button>
          <button type="button" onClick={switchToHtmlMode} style={{ ...mergeBtnStyle, background: mode === 'html' ? 'var(--grad)' : 'transparent', color: mode === 'html' ? '#fff' : 'var(--dim)' }}>
            HTML
          </button>
        </div>
        {missingUnsub && <span style={{ fontSize: '0.55rem', color: 'var(--red)' }}>Missing {'{{unsubscribe_url}}'}</span>}
      </div>

      {mode === 'html' ? (
        <textarea
          style={{ width: '100%', minHeight: 220, padding: '0.8rem', background: 'var(--surface)', border: 'none', color: 'var(--white)', fontFamily: 'var(--mono)', fontSize: '0.65rem', resize: 'vertical', boxSizing: 'border-box' }}
          value={htmlDraft}
          onChange={(e) => handleHtmlDraftChange(e.target.value)}
        />
      ) : (
        <div style={{ display: 'flex' }}>
          <div style={{ flex: 1, padding: '0.8rem', borderRight: '1px solid var(--border)', maxHeight: 460, overflowY: 'auto' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem', marginBottom: '0.8rem' }}>
              {BLOCK_TYPES.map((t) => (
                <button key={t.type} type="button" onClick={() => addBlock(t.type)} style={mergeBtnStyle}>
                  {t.label}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              {blocks.map((b, i) => (
                <div key={b.id} style={{ border: '1px solid var(--border)', borderRadius: '4px', padding: '0.6rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                    <span style={{ fontSize: '0.55rem', color: 'var(--purple)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      {BLOCK_TYPE_LABELS[b.type] || b.type}
                    </span>
                    <div style={{ display: 'flex', gap: '0.2rem' }}>
                      <button type="button" onClick={() => moveBlock(i, -1)} disabled={i === 0} style={{ ...mergeBtnStyle, opacity: i === 0 ? 0.3 : 1 }}>↑</button>
                      <button type="button" onClick={() => moveBlock(i, 1)} disabled={i === blocks.length - 1} style={{ ...mergeBtnStyle, opacity: i === blocks.length - 1 ? 0.3 : 1 }}>↓</button>
                      {b.type !== 'unsubscribe_footer' && (
                        <button type="button" onClick={() => removeBlock(i)} style={{ ...mergeBtnStyle, color: 'var(--red)' }}>✕</button>
                      )}
                    </div>
                  </div>
                  <BlockFields block={b} onChange={(patch) => updateBlock(i, patch)} />
                </div>
              ))}
            </div>
          </div>
          <div style={{ flex: 1, background: '#f4f4f5', minHeight: 300 }}>
            <iframe title="Email preview" srcDoc={currentHtml} style={{ width: '100%', height: '100%', minHeight: 460, border: 'none' }} />
          </div>
        </div>
      )}
    </div>
  );
}