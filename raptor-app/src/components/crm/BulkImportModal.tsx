import { useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import Modal, { fieldLabelStyle, fieldInputStyle, primaryBtnStyle, ghostBtnStyle } from './Modal';
import { parseCSV, rowsToObjects } from '../../lib/csvUtils';
import { type ImportFieldSchema, validateRow } from '../../lib/importSchema';

interface BulkImportModalProps {
  open: boolean;
  onClose: () => void;
  tableName: string;
  schema: ImportFieldSchema[];
  onImported: () => void;
  // Optional hook to transform a cleaned row before insert — e.g. resolve a
  // "Company Name" text column into a company_id via find-or-create, the same
  // way NewContactModal / NewDealModal already do it.
  beforeInsert?: (row: Record<string, any>) => Promise<Record<string, any>>;
}

type Step = 'upload' | 'map' | 'preview' | 'importing' | 'done';

export default function BulkImportModal({ open, onClose, tableName, schema, onImported, beforeInsert }: BulkImportModalProps) {
  const [step, setStep] = useState<Step>('upload');
  const [headers, setHeaders] = useState<string[]>([]);
  const [records, setRecords] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [validated, setValidated] = useState<{ cleaned: Record<string, any>; errors: string[] }[]>([]);
  const [result, setResult] = useState<{ succeeded: number; failed: { row: number; message: string }[] }>({ succeeded: 0, failed: [] });
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setStep('upload');
    setHeaders([]); setRecords([]); setMapping({}); setValidated([]);
    setResult({ succeeded: 0, failed: [] });
    setFileName(''); setError(null);
  }

  function handleClose() {
    reset();
    onClose();
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setError(null);
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = String(reader.result || '');
        const rows = parseCSV(text);
        const { headers: h, records: r } = rowsToObjects(rows);
        if (h.length === 0 || r.length === 0) {
          setError('Could not find any rows in that file — check it has a header row plus at least one data row.');
          return;
        }
        setHeaders(h);
        setRecords(r);

        // Auto-guess mapping by loose name match; user confirms/fixes it in the next step.
        const guessed: Record<string, string> = {};
        schema.forEach((field) => {
          const norm = (s: string) => s.toLowerCase().replace(/[\s_-]/g, '');
          const match =
            h.find((header) => norm(header) === norm(field.label)) ||
            h.find((header) => norm(header) === norm(field.key));
          if (match) guessed[field.key] = match;
        });
        setMapping(guessed);
        setStep('map');
      } catch (err) {
        console.error(err);
        setError("Could not read that file. Make sure it's a plain CSV export.");
      }
    };
    reader.readAsText(file);
  }

  function runValidation() {
    const missingRequired = schema.filter((f) => f.required && !mapping[f.key]);
    if (missingRequired.length > 0) {
      setError(`Map a column for: ${missingRequired.map((f) => f.label).join(', ')}`);
      return;
    }
    setError(null);
    const results = records.map((raw) => validateRow(raw, mapping, schema));
    setValidated(results);
    setStep('preview');
  }

  async function runImport() {
    setStep('importing');
    const validRows = validated
      .map((v, idx) => ({ ...v, idx }))
      .filter((v) => v.errors.length === 0);

    let succeeded = 0;
    const failed: { row: number; message: string }[] = [];

    // One insert at a time so a single bad row (RLS denial, FK violation, etc.)
    // doesn't sink the whole batch — fine for CRM-sized imports.
    for (const v of validRows) {
      try {
        const payload = beforeInsert ? await beforeInsert(v.cleaned) : v.cleaned;
        const { error: insertErr } = await supabase.from(tableName).insert(payload);
        if (insertErr) throw insertErr;
        succeeded++;
      } catch (err: any) {
        failed.push({ row: v.idx + 2, message: err.message || 'Insert failed' }); // +2 = header row + 1-index
      }
    }

    setResult({ succeeded, failed });
    setStep('done');
  }

  function finishAndRefresh() {
    onImported();
    handleClose();
  }

  const errorCount = validated.filter((v) => v.errors.length > 0).length;

  return (
    <Modal open={open} onClose={handleClose} title={`Bulk Import — ${tableName}`} width={640}>
      {step === 'upload' && (
        <div>
          <div style={{ fontSize: '0.65rem', color: 'var(--dim)', marginBottom: '1.2rem' }}>
            Upload a CSV file. The first row must be column headers. You'll map columns and
            preview every row's validation result before anything gets written.
          </div>
          <input type="file" accept=".csv,text/csv" onChange={handleFile} style={fieldInputStyle} />
          {fileName && <div style={{ fontSize: '0.6rem', color: 'var(--dim)' }}>Selected: {fileName}</div>}
          {error && <div style={{ color: 'var(--red)', fontSize: '0.65rem', marginTop: '0.8rem' }}>{error}</div>}
        </div>
      )}

      {step === 'map' && (
        <div>
          <div style={{ fontSize: '0.65rem', color: 'var(--dim)', marginBottom: '1.2rem' }}>
            Match each field to a column from your file ({records.length} rows detected).
          </div>
          {schema.map((field) => (
            <div key={field.key} style={{ marginBottom: '1rem' }}>
              <label style={fieldLabelStyle}>
                {field.label}{field.required && ' *'}
              </label>
              <select
                style={fieldInputStyle}
                value={mapping[field.key] || ''}
                onChange={(e) => setMapping((m) => ({ ...m, [field.key]: e.target.value }))}
              >
                <option value="">— Not mapped —</option>
                {headers.map((h) => (
                  <option key={h} value={h}>{h}</option>
                ))}
              </select>
            </div>
          ))}
          {error && <div style={{ color: 'var(--red)', fontSize: '0.65rem', marginBottom: '1rem' }}>{error}</div>}
          <div style={{ display: 'flex', gap: '0.7rem' }}>
            <button type="button" style={ghostBtnStyle} onClick={reset}>Back</button>
            <button type="button" style={primaryBtnStyle} onClick={runValidation}>Preview Import</button>
          </div>
        </div>
      )}

      {step === 'preview' && (
        <div>
          <div style={{ fontSize: '0.65rem', color: errorCount ? 'var(--red)' : 'var(--green)', marginBottom: '1rem' }}>
            {errorCount === 0
              ? `All ${validated.length} rows look good.`
              : `${errorCount} of ${validated.length} rows have errors and will be skipped. The rest will import.`}
          </div>
          <div style={{ maxHeight: 320, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: '4px' }}>
            {validated.map((v, i) => (
              <div key={i} style={{
                padding: '0.6rem 0.9rem', borderBottom: '1px solid var(--border)',
                fontSize: '0.65rem', color: v.errors.length ? 'var(--red)' : 'var(--dim)',
              }}>
                <strong>Row {i + 2}:</strong>{' '}
                {v.errors.length ? v.errors.join('; ') : Object.values(v.cleaned).filter(Boolean).join(' · ')}
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: '0.7rem', marginTop: '1.1rem' }}>
            <button type="button" style={ghostBtnStyle} onClick={() => setStep('map')}>Back</button>
            <button
              type="button"
              style={primaryBtnStyle}
              onClick={runImport}
              disabled={validated.every((v) => v.errors.length > 0)}
            >
              Import {validated.length - errorCount} Rows
            </button>
          </div>
        </div>
      )}

      {step === 'importing' && (
        <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--dim)', fontSize: '0.7rem' }}>
          Importing…
        </div>
      )}

      {step === 'done' && (
        <div>
          <div style={{ fontSize: '0.7rem', color: 'var(--green)', marginBottom: '0.8rem' }}>
            {result.succeeded} row{result.succeeded === 1 ? '' : 's'} imported successfully.
          </div>
          {result.failed.length > 0 && (
            <div style={{ marginBottom: '1rem' }}>
              <div style={{ fontSize: '0.65rem', color: 'var(--red)', marginBottom: '0.5rem' }}>
                {result.failed.length} row{result.failed.length === 1 ? '' : 's'} failed:
              </div>
              <div style={{ maxHeight: 200, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: '4px' }}>
                {result.failed.map((f, i) => (
                  <div key={i} style={{ padding: '0.5rem 0.8rem', fontSize: '0.6rem', color: 'var(--red)', borderBottom: '1px solid var(--border)' }}>
                    Row {f.row}: {f.message}
                  </div>
                ))}
              </div>
            </div>
          )}
          <button type="button" style={primaryBtnStyle} onClick={finishAndRefresh}>Done</button>
        </div>
      )}
    </Modal>
  );
}