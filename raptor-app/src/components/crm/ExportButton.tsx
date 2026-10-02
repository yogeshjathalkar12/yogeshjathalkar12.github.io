import { useState } from 'react';
import { toCSV, downloadCSV } from '../../lib/csvUtils';
import { useOrg } from '../../hooks/OrgContext';
import { isExportVerified, logAudit } from '../../lib/team';
import OtpGateModal from '../team/OtpGateModal';

interface ExportButtonProps {
  data: Record<string, any>[];
  columns: { key: string; label: string }[];
  filename: string;
  label?: string;
}

// Drop next to any "+ New X" button to export whatever's currently loaded on screen.
// Bulk export is owner-only: members never see this button, and the owner has
// to confirm an emailed code first (valid for 10 minutes). Every export is
// written to the audit log.
export default function ExportButton({ data, columns, filename, label = 'Export CSV' }: ExportButtonProps) {
  const { isOwner } = useOrg();
  const [askingOtp, setAskingOtp] = useState(false);

  if (!isOwner) return null;

  function runExport() {
    const csv = toCSV(data, columns);
    downloadCSV(filename, csv);
    logAudit('export', { filename, rows: data.length });
  }

  function handleClick() {
    if (isExportVerified()) runExport();
    else setAskingOtp(true);
  }

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
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
      <OtpGateModal open={askingOtp} onClose={() => setAskingOtp(false)} onVerified={runExport} />
    </>
  );
}
