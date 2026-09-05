import { toCSV, downloadCSV } from '../../lib/csvUtils';

interface ExportButtonProps {
  data: Record<string, any>[];
  columns: { key: string; label: string }[];
  filename: string;
  label?: string;
}

// Drop next to any "+ New X" button to export whatever's currently loaded on screen.
export default function ExportButton({ data, columns, filename, label = 'Export CSV' }: ExportButtonProps) {
  function handleExport() {
    const csv = toCSV(data, columns);
    downloadCSV(filename, csv);
  }

  return (
    <button
      type="button"
      onClick={handleExport}
      disabled={data.length === 0}
      style={{
        background: 'transparent', color: 'var(--dim)', border: '1px solid var(--border)',
        padding: '0.6rem 1.1rem', borderRadius: '4px', cursor: data.length ? 'pointer' : 'not-allowed',
        fontFamily: 'var(--mono)', fontSize: '0.65rem', letterSpacing: '0.08em', textTransform: 'uppercase',
        opacity: data.length ? 1 : 0.5,
      }}
    >
      {label}
    </button>
  );
}