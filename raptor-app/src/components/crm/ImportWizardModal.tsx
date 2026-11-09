import { useEffect, useMemo, useRef, useState } from 'react';
import Modal, { fieldLabelStyle, primaryBtnStyle, ghostBtnStyle } from './Modal';
import ImportUndoPanel, { describeUndoReport } from './ImportUndoPanel';
import { readWorkbookFile } from '../../lib/import/xlsxRead';
import { analyseSheet } from '../../lib/import/sheetShape';
import type { SheetTable } from '../../lib/import/sheetShape';
import { FIELDS, FIELD_BY_ID, suggestSetup, retargetField } from '../../lib/import/columnGuess';
import type { ColumnSuggestion, FieldId } from '../../lib/import/columnGuess';
import { applyFileLinks, distinctValues, findSuggestions, parseTables, planImport, suggestStage } from '../../lib/import/plan';
import type { ColumnChoice, Existing, Links, RowKind, StageInfo, Suggestion, TableSetup } from '../../lib/import/plan';
import { inferDateOrder } from '../../lib/import/values';
import type { DateOrder } from '../../lib/import/values';
import { loadExisting, runImport } from '../../lib/import/run';
import { applySaved, buildSaved, findSaved, forgetAll, loadAll, saveAll, upsert } from '../../lib/import/savedMappings';
import type { KeyValueStore } from '../../lib/import/savedMappings';
import type { DbClient, RunProgress, RunResult } from '../../lib/import/run';

// The import wizard: file -> what is in it -> check -> import -> done (with Undo).
// Every decision the program makes is shown with its reason and can be changed; nothing is written until "Import",
// and what is written is one batch that can be undone from the Import history.

type Step = 'file' | 'map' | 'check' | 'running' | 'done';

interface Tab {
  id: string;
  fileName: string;
  table: SheetTable;
  selected: boolean;
  rowKind: RowKind;
  choices: ColumnChoice[];
  suggestions: ColumnSuggestion[];
  guessed: { rowKind: RowKind; choices: ColumnChoice[] };     // what the guesses said, to start over from
  savedNote: string | null;                                    // set when a remembered mapping was used
}

interface Props {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
  client?: DbClient;                                   // tests/harness only
  loadStages?: () => Promise<StageInfo[]>;             // tests/harness only
  store?: KeyValueStore | null;                        // where mappings are remembered (default: this browser's localStorage)
}

const KIND_LABEL: Record<RowKind, string> = { company: 'a company', contact: 'a person (contact)', deal: 'a deal' };
const small = { fontSize: '0.65rem', color: 'var(--dim)', lineHeight: 1.6 } as const;
const cell = { padding: '0.5rem 0.6rem', borderBottom: '1px solid var(--border)', fontSize: '0.65rem', verticalAlign: 'top' } as const;
const selectStyle = { width: '100%', padding: '0.45rem 0.5rem', background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--white)', fontFamily: 'var(--mono)', fontSize: '0.65rem', borderRadius: 4 } as const;
const CONF_COLOR = { high: 'var(--green)', medium: 'var(--dim)', low: 'var(--red)' } as const;
const GROUPS: { label: string; entity: 'company' | 'contact' | 'deal' | 'other' }[] = [
  { label: 'Company', entity: 'company' }, { label: 'Person (contact)', entity: 'contact' }, { label: 'Deal', entity: 'deal' }, { label: 'Other', entity: 'other' },
];

function downloadText(name: string, text: string) {
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
const csvCell = (v: any) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

function mandatory(tab: Tab): string | null {
  const has = (p: (f: FieldId) => boolean) => tab.choices.some((c) => p(c.field));
  if (tab.rowKind === 'company' && !has((f) => f === 'company.name')) return 'Choose which column holds the company name.';
  if (tab.rowKind === 'contact' && !has((f) => f === 'contact.name' || f === 'contact.first_name' || f === 'contact.last_name' || f === 'contact.email')) return 'Choose which column holds the person\'s name (or email).';
  if (tab.rowKind === 'deal' && !has((f) => f === 'deal.title')) return 'Choose which column holds the deal title.';
  return null;
}

function browserStore(): KeyValueStore | null { try { return window.localStorage; } catch { return null; } }

export default function ImportWizardModal({ open, onClose, onImported, client, loadStages, store }: Props) {
  const storage = store === undefined ? browserStore() : store;
  const [step, setStep] = useState<Step>('file');
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeTab, setActiveTab] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [emptyWords, setEmptyWords] = useState('');
  const [dateOrder, setDateOrder] = useState<DateOrder | ''>('');
  const [stages, setStages] = useState<StageInfo[]>([]);
  const [stageMap, setStageMap] = useState<Record<string, string>>({});
  const [defaultStage, setDefaultStage] = useState('');
  const [existing, setExisting] = useState<Existing | null>(null);
  const [loadingExisting, setLoadingExisting] = useState(false);
  const [decisions, setDecisions] = useState<Record<string, 'same' | 'separate'>>({});
  const [progress, setProgress] = useState<RunProgress | null>(null);
  const [result, setResult] = useState<RunResult | null>(null);
  const [undoing, setUndoing] = useState(false);
  const [undoNote, setUndoNote] = useState<string | null>(null);
  const [undone, setUndone] = useState(false);
  const [alsoProspects, setAlsoProspects] = useState(true);
  const [showLeftOut, setShowLeftOut] = useState(false);
  const stopRef = useRef(false);

  function reset() {
    setStep('file'); setTabs([]); setActiveTab(''); setError(null); setReading(false); setEmptyWords(''); setDateOrder(''); setStageMap({});
    setExisting(null); setDecisions({}); setProgress(null); setResult(null); setUndoing(false); setUndoNote(null); setUndone(false); setShowLeftOut(false); stopRef.current = false;
  }
  useEffect(() => { if (!open) reset(); }, [open]);

  useEffect(() => {
    if (!open) return;
    const load = loadStages || (async () => (await import('../../lib/pipelineStages')).loadPipelineStages());
    load().then((s) => { setStages(s); setDefaultStage((d) => d || s.find((x) => x.type === 'open')?.key || s[0]?.key || 'lead'); }).catch(() => undefined);
  }, [open, loadStages]);

  // ---------------------------------------------------------------- step 1: read the files
  async function onFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (!files.length) return;
    setReading(true); setError(null);
    try {
      const next: Tab[] = [];
      for (const f of files) {
        const sheets = await readWorkbookFile(f);
        sheets.forEach((s, i) => {
          const table = analyseSheet(s.name, s.hidden, s.rows);
          const { suggestions, rowKind } = suggestSetup(table);
          const guessedChoices: ColumnChoice[] = suggestions.map((x) => ({ field: x.guess.field, customName: x.header }));
          let choices = guessedChoices, kind = rowKind, savedNote: string | null = null;
          const found = table.verdict === 'list' ? findSaved(loadAll(storage), table.columns.map((c) => c.header)) : null;
          if (found) {
            const saved = applySaved(found, table.columns.map((c) => c.header));
            choices = guessedChoices.map((g, k) => saved[k] ?? g);
            kind = found.mapping.rowKind;
            savedNote = `${found.exact ? 'The same columns' : `${found.matched} of ${found.total} columns`} as a file you imported on ${new Date(found.mapping.savedAt).toLocaleDateString()}: that mapping is used. Change anything you like.`;
            setStageMap((m) => ({ ...found.mapping.stageMap, ...m }));
            setEmptyWords((w) => w || found.mapping.emptyWords || '');
          }
          next.push({
            id: `${f.name}#${i}`, fileName: f.name, table, selected: table.verdict === 'list' && !s.hidden, rowKind: kind,
            choices, suggestions, guessed: { rowKind, choices: guessedChoices }, savedNote,
          });
        });
      }
      if (!next.length) throw new Error('No sheets were found in that file.');
      setTabs((cur) => [...cur, ...next]);
      setActiveTab((a) => a || next.find((t) => t.selected)?.id || next[0].id);
    } catch (err: any) {
      setError(String(err?.message || err));
    } finally { setReading(false); }
  }

  const selected = tabs.filter((t) => t.selected);
  const updateTab = (id: string, fn: (t: Tab) => Tab) => setTabs((all) => all.map((t) => (t.id === id ? fn(t) : t)));

  // ---------------------------------------------------------------- step 2 derived: dates and stages
  const setups: TableSetup[] = useMemo(() => selected.map((t) => ({ table: t.table, choices: t.choices, rowKind: t.rowKind })), [tabs]); // eslint-disable-line react-hooks/exhaustive-deps
  const dateValues = useMemo(() => setups.flatMap((s) => { const i = s.choices.findIndex((c) => c.field === 'deal.meeting_at'); return i < 0 ? [] : s.table.rows.map((r) => r[i]).filter(Boolean); }), [setups]);
  const inferred: DateOrder = useMemo(() => inferDateOrder(dateValues), [dateValues]);
  const needsDateOrder = dateValues.length > 0 && inferred === 'ambiguous' && dateValues.some((v) => /^\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}/.test(v));
  const effectiveDateOrder: DateOrder = inferred !== 'ambiguous' ? inferred : (dateOrder || 'ambiguous');
  const stageValues = useMemo(() => distinctValues(setups, 'deal.stage').slice(0, 40), [setups]);
  useEffect(() => {
    if (!stages.length) return;
    setStageMap((cur) => {
      const next = { ...cur };
      for (const v of stageValues) { const k = v.value.toLowerCase(); if (!(k in next)) { const s = suggestStage(v.value, stages); if (s) next[k] = s; } }
      return next;
    });
  }, [stageValues, stages]);

  const options = useMemo(() => ({
    dateOrder: effectiveDateOrder,
    extraPlaceholders: new Set(emptyWords.split(',').map((w) => w.trim().toLowerCase()).filter(Boolean)),
    stageMap, stageKeys: new Set(stages.map((s) => s.key)), defaultStage: defaultStage || 'lead',
  }), [effectiveDateOrder, emptyWords, stageMap, stages, defaultStage]);

  const mapProblem = useMemo(() => {
    if (!selected.length) return 'Tick at least one sheet.';
    for (const t of selected) { const p = mandatory(t); if (p) return `${t.table.name}: ${p}`; }
    if (needsDateOrder && !dateOrder) return 'Choose how the meeting dates are written (day first or month first).';
    return null;
  }, [tabs, needsDateOrder, dateOrder]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------------------------------------------------------------- step 3: parse + plan
  async function toCheck() {
    setError(null); setLoadingExisting(true);
    try { setExisting(await loadExisting(client)); setDecisions({}); setAlsoProspects(selected.some((t) => t.rowKind === 'company')); setStep('check'); }
    catch (e: any) { setError(`Could not read your CRM to compare with: ${String(e?.message || e)}`); }
    finally { setLoadingExisting(false); }
  }
  const parsed = useMemo(() => (step === 'check' || step === 'running' ? parseTables(setups, options) : null), [step, setups, options]);
  const suggestions: Suggestion[] = useMemo(() => (parsed && existing ? findSuggestions(parsed, existing) : []), [parsed, existing]);
  const links: Links = useMemo(() => {
    const l: Links = {};
    for (const s of suggestions) if (decisions[s.id] === 'same') l[s.file.key] = s.other.kind === 'existing' ? { existingId: s.other.id } : { intoKey: s.other.key };
    return l;
  }, [suggestions, decisions]);
  const plan = useMemo(() => (parsed && existing ? planImport(Object.keys(links).length ? applyFileLinks(parsed, links) : parsed, existing, links, undefined, { prospects: alsoProspects }) : null), [parsed, existing, links, alsoProspects]);

  const total = plan ? plan.companies.create.length + plan.contacts.create.length + plan.deals.create.length + plan.prospects.create.length + plan.companies.update.length + plan.contacts.update.length : 0;

  async function start() {
    if (!plan || !existing) return;
    setStep('running'); setError(null); stopRef.current = false; setProgress({ phase: 'Starting', done: 0, total: 1 });
    try {
      const names = [...new Set(selected.map((t) => t.fileName))];
      const res = await runImport(plan, existing, { source: names.join(', ').slice(0, 180), fileName: names.join(', ').slice(0, 280), onProgress: setProgress, shouldStop: () => stopRef.current }, client);
      setResult(res); setStep('done'); onImported();
      if (res.created.companies + res.created.contacts + res.created.deals + res.updated.companies + res.updated.contacts > 0) {
        let list = loadAll(storage);
        for (const t of selected) list = upsert(list, buildSaved(t.table.columns.map((c) => c.header), t.choices, t.rowKind, stageMap, emptyWords, new Date().toISOString()));
        saveAll(storage, list);                                   // so the next file with these columns maps itself
      }
    } catch (e: any) {
      setError(String(e?.message || e)); setStep('check');
    }
  }

  function downloadAttention() {
    if (!plan) return;
    const lines = ['sheet,row,what happened,details', ...plan.outcomes.map((o) => [o.sheet, o.row, o.status === 'skipped' ? 'row left out' : 'value left out or adjusted', o.messages.join(' | ')].map(csvCell).join(','))];
    downloadText('import-rows-needing-attention.csv', lines.join('\n'));
  }

  // ---------------------------------------------------------------- render
  const tab = tabs.find((t) => t.id === activeTab) || selected[0];

  return (
    <Modal open={open} onClose={onClose} title={step === 'done' ? 'Import finished' : 'Import data'} width={920}>
      {step === 'file' && (
        <div>
          <div style={{ ...small, marginBottom: '1rem' }}>
            Choose Excel (.xlsx) or CSV files. One file can hold several sheets, and you can add several files: they are read together, and the same company appearing twice becomes one.
            Nothing is written until you press Import at the end, and the whole import can be undone afterwards from <strong>Import history</strong>.
          </div>
          <input type="file" multiple accept=".xlsx,.xlsm,.csv,.tsv,.txt,text/csv" onChange={onFiles} disabled={reading} style={{ marginBottom: '1rem', fontSize: '0.7rem', color: 'var(--white)' }} />
          {reading && <div style={small}>Reading…</div>}
          {error && <div style={{ color: 'var(--red)', fontSize: '0.7rem', marginBottom: '0.8rem' }}>{error}</div>}
          {tabs.length > 0 && (
            <div style={{ border: '1px solid var(--border)', borderRadius: 4, marginBottom: '1rem' }}>
              {tabs.map((t) => (
                <label key={t.id} style={{ display: 'flex', gap: '0.7rem', padding: '0.7rem 0.9rem', borderBottom: '1px solid var(--border)', cursor: 'pointer', alignItems: 'flex-start' }}>
                  <input type="checkbox" checked={t.selected} onChange={(e) => updateTab(t.id, (x) => ({ ...x, selected: e.target.checked }))} disabled={t.table.verdict === 'not_a_table'} style={{ marginTop: 3 }} />
                  <span style={{ flex: 1 }}>
                    <span style={{ fontSize: '0.75rem' }}>{t.table.name}</span> <span style={small}>({t.fileName})</span>
                    <div style={{ ...small, color: t.table.verdict === 'list' ? 'var(--green)' : 'var(--dim)' }}>
                      {t.table.verdict === 'list' ? `${t.table.rows.length} rows, ${t.table.columns.length} columns` : t.table.verdictWhy}{t.table.hidden ? ' · hidden sheet' : ''}{t.table.headerRow > 1 ? ` · headers found on row ${t.table.headerRow}` : ''}
                    </div>
                  </span>
                </label>
              ))}
            </div>
          )}
          {loadAll(storage).length > 0 && (
            <div style={{ ...small, marginBottom: '1rem' }}>
              Raptor remembers how you mapped files before, so a file with the same columns maps itself.{' '}
              <button type="button" onClick={() => { forgetAll(storage); setTabs((t) => [...t]); }} style={{ background: 'none', border: 'none', color: 'var(--dim)', textDecoration: 'underline', cursor: 'pointer', padding: 0, font: 'inherit' }}>Forget what it remembers</button>
            </div>
          )}
          <div style={{ display: 'flex', gap: '0.7rem' }}>
            <button type="button" style={ghostBtnStyle} onClick={onClose}>Cancel</button>
            <button type="button" style={primaryBtnStyle} disabled={!selected.length} onClick={() => { setError(null); setActiveTab(selected[0].id); setStep('map'); }}>Next: what is in these sheets</button>
          </div>
        </div>
      )}

      {step === 'map' && tab && (
        <div>
          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
            {selected.map((t) => (
              <button key={t.id} type="button" onClick={() => setActiveTab(t.id)} style={{ ...ghostBtnStyle, flex: 'none', padding: '0.45rem 0.8rem', borderColor: t.id === tab.id ? 'var(--white)' : 'var(--border)', color: t.id === tab.id ? 'var(--white)' : 'var(--dim)' }}>
                {t.table.name}{mandatory(t) ? ' ⚠' : ''}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '0.8rem', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.7rem' }}>Each row of <strong>{tab.table.name}</strong> is</span>
            <select style={{ ...selectStyle, width: 'auto' }} value={tab.rowKind} onChange={(e) => {
              const kind = e.target.value as RowKind;
              updateTab(tab.id, (x) => { const hasPerson = x.choices.some((c) => c.field === 'contact.name' || c.field === 'contact.first_name' || c.field === 'contact.last_name'); return { ...x, rowKind: kind, choices: x.choices.map((c, i) => ({ ...c, field: retargetField(kind, c.field, x.table.columns[i].header, hasPerson) })) }; });
            }}>
              {(Object.keys(KIND_LABEL) as RowKind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
            </select>
            <span style={small}>{tab.table.rows.length} rows{tab.table.skipped.length ? ` · ${tab.table.skipped.length} title/total line${tab.table.skipped.length === 1 ? '' : 's'} set aside` : ''}</span>
          </div>
          {tab.savedNote && (
            <div style={{ ...small, border: '1px solid var(--border)', borderRadius: 4, padding: '0.6rem 0.8rem', marginBottom: '0.8rem', display: 'flex', gap: '0.8rem', alignItems: 'center' }}>
              <span style={{ flex: 1 }}>{tab.savedNote}</span>
              <button type="button" style={{ ...ghostBtnStyle, flex: 'none', padding: '0.4rem 0.7rem' }} onClick={() => updateTab(tab.id, (x) => ({ ...x, rowKind: x.guessed.rowKind, choices: x.guessed.choices, savedNote: null }))}>Start over</button>
            </div>
          )}
          {mandatory(tab) && <div style={{ color: 'var(--red)', fontSize: '0.65rem', marginBottom: '0.6rem' }}>{mandatory(tab)}</div>}

          <div style={{ maxHeight: 360, overflow: 'auto', border: '1px solid var(--border)', borderRadius: 4, marginBottom: '1rem' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr style={{ textAlign: 'left', position: 'sticky', top: 0, background: 'var(--surface)' }}>
                {['Your column', 'Examples', 'Goes to'].map((h) => <th key={h} style={{ ...cell, ...fieldLabelStyle, display: 'table-cell', marginBottom: 0 }}>{h}</th>)}
              </tr></thead>
              <tbody>
                {tab.table.columns.map((col, i) => {
                  const s = tab.suggestions[i];
                  const ch = tab.choices[i];
                  return (
                    <tr key={col.index}>
                      <td style={{ ...cell, width: '24%' }}>
                        <div style={{ fontSize: '0.7rem' }}>{col.header}</div>
                        <div style={small}>{col.letter} · {col.filled} of {tab.table.rows.length} filled</div>
                      </td>
                      <td style={{ ...cell, width: '30%', color: 'var(--dim)' }}>
                        {s.profile.samples.length ? s.profile.samples.map((v, k) => <div key={k} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 220 }}>{v}</div>) : '—'}
                        {s.profile.placeholders.length > 0 && <div style={{ ...small, marginTop: 4 }}>treated as empty: “{s.profile.placeholders[0].value}” ×{s.profile.placeholders[0].count}</div>}
                      </td>
                      <td style={cell}>
                        <select style={selectStyle} value={ch.field} onChange={(e) => updateTab(tab.id, (x) => ({ ...x, choices: x.choices.map((c, k) => (k === i ? { ...c, field: e.target.value as FieldId } : c)) }))}>
                          {GROUPS.map((g) => (
                            <optgroup key={g.entity} label={g.label}>
                              {FIELDS.filter((f) => f.entity === g.entity).map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
                            </optgroup>
                          ))}
                        </select>
                        {ch.field === 'custom' && (
                          <div style={{ display: 'flex', gap: '0.4rem', marginTop: 6 }}>
                            <select style={{ ...selectStyle, width: '38%' }} value={ch.customEntity || tab.rowKind} onChange={(e) => updateTab(tab.id, (x) => ({ ...x, choices: x.choices.map((c, k) => (k === i ? { ...c, customEntity: e.target.value as RowKind } : c)) }))}>
                              <option value="company">on company</option><option value="contact">on person</option><option value="deal">on deal</option>
                            </select>
                            <input style={{ ...selectStyle, width: '62%' }} value={ch.customName ?? col.header} onChange={(e) => updateTab(tab.id, (x) => ({ ...x, choices: x.choices.map((c, k) => (k === i ? { ...c, customName: e.target.value } : c)) }))} />
                          </div>
                        )}
                        <div style={{ ...small, color: ch.field === s.guess.field ? CONF_COLOR[s.guess.confidence] : 'var(--dim)', marginTop: 4 }}>
                          {ch.field === s.guess.field ? s.guess.reason : `You chose ${FIELD_BY_ID.get(ch.field)?.label.toLowerCase()}.`}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <label style={fieldLabelStyle}>Other words in your files that mean “empty” (comma separated, optional)</label>
          <input value={emptyWords} onChange={(e) => setEmptyWords(e.target.value)} placeholder="e.g. see website, tbc" style={{ ...selectStyle, marginBottom: '1rem' }} />

          {needsDateOrder && (
            <div style={{ marginBottom: '1rem' }}>
              <label style={fieldLabelStyle}>Meeting dates like 03/04/2026 can be read two ways. Yours are</label>
              <select style={selectStyle} value={dateOrder} onChange={(e) => setDateOrder(e.target.value as DateOrder)}>
                <option value="">Choose…</option><option value="dmy">day first (31/12/2026)</option><option value="mdy">month first (12/31/2026)</option>
              </select>
            </div>
          )}

          {stageValues.length > 0 && stages.length > 0 && (
            <div style={{ marginBottom: '1rem' }}>
              <label style={fieldLabelStyle}>Match the stages in your file to your pipeline</label>
              {stageValues.map((v) => (
                <div key={v.value} style={{ display: 'flex', gap: '0.7rem', alignItems: 'center', marginBottom: 6 }}>
                  <div style={{ width: '35%', fontSize: '0.7rem' }}>{v.value} <span style={small}>×{v.count}</span></div>
                  <select style={{ ...selectStyle, width: '65%' }} value={stageMap[v.value.toLowerCase()] || ''} onChange={(e) => setStageMap((m) => ({ ...m, [v.value.toLowerCase()]: e.target.value }))}>
                    <option value="">Put in “{stages.find((s) => s.key === defaultStage)?.label || defaultStage}”</option>
                    {stages.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                  </select>
                </div>
              ))}
            </div>
          )}

          {error && <div style={{ color: 'var(--red)', fontSize: '0.7rem', marginBottom: '0.8rem' }}>{error}</div>}
          {mapProblem && <div style={{ color: 'var(--red)', fontSize: '0.65rem', marginBottom: '0.8rem' }}>{mapProblem}</div>}
          <div style={{ display: 'flex', gap: '0.7rem' }}>
            <button type="button" style={ghostBtnStyle} onClick={() => setStep('file')}>Back</button>
            <button type="button" style={primaryBtnStyle} disabled={!!mapProblem || loadingExisting} onClick={toCheck}>{loadingExisting ? 'Comparing with your CRM…' : 'Next: check what will happen'}</button>
          </div>
        </div>
      )}

      {step === 'check' && plan && parsed && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '0.7rem', marginBottom: '1rem' }}>
            {[
              { t: 'Companies', a: plan.companies.create.length, b: plan.companies.update.length, c: plan.companies.unchanged, bl: 'existing ones get empty fields filled', cl: 'already complete' },
              { t: 'Contacts', a: plan.contacts.create.length, b: plan.contacts.update.length, c: plan.contacts.unchanged, bl: 'existing ones get empty fields filled', cl: 'already complete' },
              { t: 'Deals', a: plan.deals.create.length, b: 0, c: plan.deals.skipped, bl: '', cl: 'skipped, already there' },
              ...(alsoProspects ? [{ t: 'Prospects', a: plan.prospects.create.length, b: 0, c: plan.prospects.alreadyThere + plan.prospects.sharedSite, bl: '', cl: 'skipped, already in your prospect book or sharing a website with another company in this file' }] : []),
            ].map((x) => (
              <div key={x.t} style={{ border: '1px solid var(--border)', borderRadius: 4, padding: '0.8rem 1rem' }}>
                <div style={fieldLabelStyle}>{x.t}</div>
                <div style={{ fontSize: '1.1rem' }}>{x.a} <span style={small}>new</span></div>
                {x.b > 0 && <div style={small}>{x.b} {x.bl}</div>}
                {x.c > 0 && <div style={small}>{x.c} {x.cl}</div>}
              </div>
            ))}
          </div>

          <div style={{ ...small, marginBottom: '1rem' }}>
            {plan.counts.rowsUsed} of {plan.counts.rowsRead} rows used.
            {plan.counts.mergedInFile > 0 && <> {plan.counts.mergedInFile} repeated rows (the same company or person again) were combined into one; the first value wins and every extra email or phone is kept.</>}
            {' '}Existing records are never overwritten: only empty fields are filled.
          </div>

          {plan.companies.create.length + plan.companies.update.length + plan.companies.unchanged > 0 && (
            <label style={{ ...small, display: 'flex', gap: '0.6rem', alignItems: 'flex-start', border: '1px solid var(--border)', borderRadius: 4, padding: '0.7rem 0.9rem', marginBottom: '1rem', cursor: 'pointer' }}>
              <input type="checkbox" checked={alsoProspects} onChange={(e) => setAlsoProspects(e.target.checked)} style={{ marginTop: 3 }} />
              <span><strong style={{ color: 'var(--white)' }}>Also add these companies to Prospects.</strong> Your team&apos;s desktop apps receive them on their next sync (within a few minutes) and fill in website, emails, phones and people from each company&apos;s own pages. A company that is already a prospect is left alone. Undo removes the prospects it added, unless someone has worked on them since.</span>
            </label>
          )}

          {plan.newCustomFields.length > 0 && (
            <div style={{ ...small, marginBottom: '1rem' }}>
              <strong style={{ color: 'var(--white)' }}>New custom fields that will be created:</strong> {plan.newCustomFields.map((f) => `${f.name} (${f.entity})`).join(', ')}.
              <span> They stay if you undo (they hold no data of their own); you can delete them in the CRM settings.</span>
            </div>
          )}

          {plan.outcomes.length > 0 && (
            <div style={{ marginBottom: '1rem' }}>
              <button type="button" onClick={() => setShowLeftOut((v) => !v)} style={{ ...ghostBtnStyle, flex: 'none', padding: '0.45rem 0.8rem' }}>
                {plan.counts.skipped} row{plan.counts.skipped === 1 ? '' : 's'} left out · {plan.counts.fixed} with a value left out or adjusted {showLeftOut ? '▲' : '▼'}
              </button>{' '}
              <button type="button" onClick={downloadAttention} style={{ ...ghostBtnStyle, flex: 'none', padding: '0.45rem 0.8rem' }}>Download list</button>
              {showLeftOut && (
                <div style={{ maxHeight: 200, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 4, marginTop: 8 }}>
                  {plan.outcomes.slice(0, 200).map((o, i) => (
                    <div key={i} style={{ padding: '0.45rem 0.8rem', borderBottom: '1px solid var(--border)', fontSize: '0.6rem', color: o.status === 'skipped' ? 'var(--red)' : 'var(--dim)' }}>
                      <strong>{o.sheet} row {o.row}</strong> — {o.status === 'skipped' ? 'left out: ' : ''}{o.messages.join(' · ')}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {suggestions.length > 0 && (
            <div style={{ marginBottom: '1rem' }}>
              <div style={{ fontSize: '0.7rem', marginBottom: '0.5rem' }}>Possibly the same company ({suggestions.length}). Nothing is merged unless you say so.</div>
              <div style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 4 }}>
                {suggestions.slice(0, 60).map((s) => (
                  <div key={s.id} style={{ padding: '0.55rem 0.8rem', borderBottom: '1px solid var(--border)', fontSize: '0.65rem', display: 'flex', gap: '0.8rem', alignItems: 'center' }}>
                    <div style={{ flex: 1 }}>
                      <strong>{s.file.name}</strong> and <strong>{s.other.name}</strong>{s.other.kind === 'existing' ? ' (already in your CRM)' : ''}
                      <div style={small}>{s.reason}</div>
                    </div>
                    <select style={{ ...selectStyle, width: 'auto' }} value={decisions[s.id] || 'separate'} onChange={(e) => setDecisions((d) => ({ ...d, [s.id]: e.target.value as 'same' | 'separate' }))}>
                      <option value="separate">Keep separate</option><option value="same">Same company</option>
                    </select>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ ...small, border: '1px solid var(--border)', borderRadius: 4, padding: '0.7rem 0.9rem', marginBottom: '1rem' }}>
            Importing never sends anything to anyone: imported deals are skipped by the automatic email, WhatsApp and SMS modes. Matching only sees the records you are allowed to see in the CRM.
          </div>
          {error && <div style={{ color: 'var(--red)', fontSize: '0.7rem', marginBottom: '0.8rem' }}>{error}</div>}
          <div style={{ display: 'flex', gap: '0.7rem' }}>
            <button type="button" style={ghostBtnStyle} onClick={() => setStep('map')}>Back</button>
            <button type="button" style={primaryBtnStyle} disabled={total === 0} onClick={start}>{total === 0 ? 'Nothing to import' : `Import ${plan.companies.create.length + plan.contacts.create.length + plan.deals.create.length + plan.prospects.create.length} new records`}</button>
          </div>
        </div>
      )}

      {step === 'running' && (
        <div style={{ padding: '1rem 0' }}>
          <div style={{ fontSize: '0.75rem', marginBottom: '0.8rem' }}>{progress?.phase || 'Working'}…</div>
          <div style={{ height: 6, background: 'var(--surface2)', borderRadius: 3, overflow: 'hidden', marginBottom: '0.8rem' }}>
            <div style={{ width: `${progress && progress.total ? Math.min(100, (progress.done / progress.total) * 100) : 0}%`, height: '100%', background: 'var(--grad)' }} />
          </div>
          <div style={{ ...small, marginBottom: '1rem' }}>{progress?.done ?? 0} of {progress?.total ?? 0}. Keep this window open. If you stop, what was already added stays and can be undone.</div>
          <button type="button" style={{ ...ghostBtnStyle, flex: 'none' }} onClick={() => { stopRef.current = true; }}>Stop</button>
        </div>
      )}

      {step === 'done' && result && (
        <div>
          {!undoing && (
            <>
              <div style={{ fontSize: '0.8rem', color: result.failed.length ? 'var(--white)' : 'var(--green)', marginBottom: '0.8rem' }}>
                {result.stopped ? 'Stopped. ' : ''}Added {result.created.companies} companies, {result.created.contacts} contacts, {result.created.deals} deals{result.created.prospects ? ` and ${result.created.prospects} prospects` : ''}.
                {(result.updated.companies + result.updated.contacts) > 0 && <> Filled {result.fieldsFilled} empty fields on {result.updated.companies + result.updated.contacts} existing records.</>}
              </div>
              {undoNote && <div style={{ ...small, color: 'var(--green)', marginBottom: '0.8rem' }}>{undoNote}</div>}
              {result.failed.length > 0 && (
                <div style={{ marginBottom: '1rem' }}>
                  <div style={{ fontSize: '0.65rem', color: 'var(--red)', marginBottom: 6 }}>{result.failed.length} problem{result.failed.length === 1 ? '' : 's'}:</div>
                  <div style={{ maxHeight: 160, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 4 }}>
                    {result.failed.slice(0, 100).map((f, i) => <div key={i} style={{ padding: '0.4rem 0.8rem', borderBottom: '1px solid var(--border)', fontSize: '0.6rem', color: 'var(--red)' }}>{f.table}{f.name ? ` “${f.name}”` : ''}: {f.message}</div>)}
                  </div>
                </div>
              )}
              {!undone && <div style={{ ...small, marginBottom: '1rem' }}>Not what you wanted? Undo removes this whole import (records you have since worked on stay). It is also under <strong>Import history</strong>.</div>}
              <div style={{ display: 'flex', gap: '0.7rem' }}>
                {!undone && <button type="button" style={ghostBtnStyle} onClick={() => setUndoing(true)}>Undo this import…</button>}
                <button type="button" style={primaryBtnStyle} onClick={onClose}>Done</button>
              </div>
            </>
          )}
          {undoing && <ImportUndoPanel batchId={result.batchId} client={client} onCancel={() => setUndoing(false)} onDone={(r) => { setUndoNote(describeUndoReport(r)); setUndoing(false); setUndone(true); onImported(); }} />}
        </div>
      )}
    </Modal>
  );
}
