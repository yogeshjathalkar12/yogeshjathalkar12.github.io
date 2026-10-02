import { useEffect, useRef, useState } from 'react';
import { fieldLabelStyle, ghostBtnStyle } from './Modal';
import { type Attachment, listAttachments, uploadAttachment, deleteAttachment, getSignedUrl } from '../../lib/attachments';
import type { CustomFieldEntity } from '../../lib/customFields';

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface AttachmentsSectionProps {
  entityType: CustomFieldEntity;
  entityId: string;
}

export default function AttachmentsSection({ entityType, entityId }: AttachmentsSectionProps) {
  const [files, setFiles] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = () => listAttachments(entityType, entityId).then(setFiles).catch((e) => console.error('Failed to load attachments:', e)).finally(() => setLoading(false));

  useEffect(() => { load(); }, [entityType, entityId]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      await uploadAttachment(entityType, entityId, file);
      await load();
    } catch (err: any) {
      setError(err.message || 'Could not upload that file.');
    } finally {
      setBusy(false);
    }
  };

  const handleDownload = async (att: Attachment) => {
    try {
      const url = await getSignedUrl(att.storage_path);
      window.open(url, '_blank');
    } catch (err: any) {
      setError(err.message || 'Could not open that file.');
    }
  };

  const handleDelete = async (att: Attachment) => {
    if (!confirm(`Delete "${att.file_name}"?`)) return;
    setBusy(true);
    setError(null);
    try {
      await deleteAttachment(att);
      await load();
    } catch (err: any) {
      setError(err.message || 'Could not delete that file.');
    } finally {
      setBusy(false);
    }
  };

  if (loading) return null;

  return (
    <div style={{ marginTop: '1.2rem', paddingTop: '0.8rem', borderTop: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <label style={{ ...fieldLabelStyle, marginBottom: 0 }}>Attachments</label>
        <button type="button" style={{ ...ghostBtnStyle, flex: 'none', fontSize: '0.5rem', padding: '0.2rem 0.6rem' }} onClick={() => fileRef.current?.click()} disabled={busy}>
          + Upload
        </button>
        <input type="file" ref={fileRef} onChange={handleUpload} style={{ display: 'none' }} />
      </div>
      {error && <div style={{ color: 'var(--red)', fontSize: '0.6rem', marginTop: '0.4rem' }}>{error}</div>}
      {files.length === 0 && <div style={{ fontSize: '0.6rem', color: 'var(--dim2)', marginTop: '0.4rem' }}>No files attached.</div>}
      {files.map((att) => (
        <div key={att.id} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.5rem 0', borderTop: '1px solid var(--border)' }}>
          <span style={{ fontSize: '0.68rem', flex: 1, cursor: 'pointer', color: 'var(--purple)' }} onClick={() => handleDownload(att)}>{att.file_name}</span>
          <span style={{ fontSize: '0.6rem', color: 'var(--dim)' }}>{formatSize(att.file_size)}</span>
          <button type="button" style={{ ...ghostBtnStyle, flex: 'none', fontSize: '0.5rem', padding: '0.2rem 0.5rem' }} onClick={() => handleDelete(att)} disabled={busy}>✕</button>
        </div>
      ))}
    </div>
  );
}
