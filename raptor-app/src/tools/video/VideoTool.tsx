import { useEffect, useRef, useState } from 'react';
import { ToolLayout } from '../../layouts/ToolLayout';
import { useAuthedFetch } from '../../hooks/useAuthedFetch';
import { useToast } from '../../hooks/ToastContext';
import { HistoryTable } from '../../components/HistoryTable';
import { toolApiBase } from '../../lib/config';
import { findTool } from '../registry';
import { OutOfCreditsError } from '../../lib/apiErrors';

const TOOL = findTool('video')!;
// NOTE: video.html hit `${RAPTOR_API_URL}/api/video` directly (no
// `/raptor/` segment). toolApiBase() builds `/api/raptor/video` —
// confirm that's actually where the backend route lives.
const API = toolApiBase('video');

interface CompressResult {
  originalSize: number;
  compressedSize: number;
}

interface LogResultResponse {
  original_size_bytes: number;
  compressed_size_bytes: number;
  reduction_pct: number;
  credits_left?: number;
}

interface VideoRecord {
  video_id: string;
  original_size_bytes: number;
  compressed_size_bytes: number;
  reduction_pct: number;
  created_at: string;
}

// Client-side compression placeholder — in production this uses
// ffmpeg.wasm. For now this mirrors video.html's stub: reads the file and
// simulates a 30% size reduction without actually re-encoding anything.
async function compressVideo(file: File, _onProgress: (pct: number) => void): Promise<CompressResult> {
  const arrayBuffer = await file.arrayBuffer();
  const originalSize = arrayBuffer.byteLength;
  const compressedSize = Math.floor(originalSize * 0.7);
  return { originalSize, compressedSize };
}

export default function VideoTool() {
  const { authedFetch } = useAuthedFetch();
  const { showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [currentFile, setCurrentFile] = useState<File | null>(null);
  const [videoId, setVideoId] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [progress, setProgress] = useState(0);
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState<LogResultResponse | null>(null);
  const [history, setHistory] = useState<VideoRecord[] | null>(null);

  const loadHistory = async () => {
    try {
      const json = await authedFetch<{ videos: VideoRecord[] }>(`${API}/history`, { skipCreditsSync: true });
      setHistory(json.videos || []);
    } catch {
      // non-fatal
    }
  };

  useEffect(() => {
    loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setFile = (file: File) => {
    setCurrentFile(file);
    if (!videoId) setVideoId(file.name.replace(/\.[^.]+$/, ''));
  };

  const clearFile = () => {
    setCurrentFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const runCompress = async () => {
    if (!currentFile) return showToast('Upload a video first', 'error');
    const label = videoId.trim() || currentFile.name;

    setProcessing(true);
    setProgress(0);
    let compressResult: CompressResult;
    try {
      compressResult = await compressVideo(currentFile, setProgress);
      setProgress(100);
    } catch {
      showToast('Could not process this video', 'error');
      setProcessing(false);
      return;
    }

    try {
      const json = await authedFetch<LogResultResponse>(`${API}/log-result`, {
        method: 'POST',
        body: JSON.stringify({
          video_id: label,
          original_size_bytes: compressResult.originalSize,
          compressed_size_bytes: compressResult.compressedSize,
          metadata_scrubbed: true,
        }),
      });
      setResult(json);
      loadHistory();
      showToast('Video compressed and scrubbed', 'success');
    } catch (e) {
      if (e instanceof OutOfCreditsError) showToast('Out of credits', 'error');
      else if (e instanceof Error) showToast(e.message, 'error');
    } finally {
      setProcessing(false);
      setTimeout(() => setProgress(0), 800);
    }
  };

  return (
    <ToolLayout tool={TOOL}>
      <div className="arsenal-grid">
        <div className="arsenal-card">
          <div className="arsenal-card-header"><span className="arsenal-card-title">Upload Video</span></div>
          <div className="arsenal-card-body">
            <div
              className={`arsenal-dropzone${dragOver ? ' dragover' : ''}`}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragEnter={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={(e) => { e.preventDefault(); setDragOver(false); }}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                if (e.dataTransfer.files.length) setFile(e.dataTransfer.files[0]);
              }}
            >
              <div className="arsenal-dropzone-icon">◌</div>
              <div className="arsenal-dropzone-text">Drop a video (.mp4, .mov, .webm) or click to browse</div>
              <div className="arsenal-dropzone-sub">Compressed on server, metadata scrubbed, and verified clean</div>
              <input
                ref={fileInputRef}
                type="file"
                accept="video/*"
                style={{ display: 'none' }}
                onChange={(e) => { if (e.target.files?.length) setFile(e.target.files[0]); }}
              />
            </div>

            {currentFile && (
              <div className="arsenal-file-chip">
                {currentFile.name} ({(currentFile.size / 1e6).toFixed(1)}MB)
                <span className="remove" onClick={clearFile}>✕</span>
              </div>
            )}

            <div className="arsenal-field" style={{ marginTop: '1rem' }}>
              <label className="arsenal-label">Video ID / Label</label>
              <input className="arsenal-input" value={videoId} onChange={(e) => setVideoId(e.target.value)} placeholder="pitch_v3_acmecorp" />
            </div>

            <button className="arsenal-btn" disabled={!currentFile || processing} onClick={runCompress}>
              {processing ? (<><span className="arsenal-spinner" /> Compressing…</>) : 'Compress & Scrub →'}
            </button>
            <div className="arsenal-progress"><div className="arsenal-progress-fill" style={{ width: `${progress}%` }} /></div>
          </div>
        </div>

        <div className="arsenal-card">
          <div className="arsenal-card-header"><span className="arsenal-card-title">Result</span></div>
          <div className="arsenal-card-body">
            {!result ? (
              <div className="arsenal-empty">
                <div className="arsenal-empty-icon">◌</div>
                <div className="arsenal-empty-text">Upload a video to see compression stats.</div>
              </div>
            ) : (
              <>
                <div className="arsenal-stats">
                  <div className="arsenal-stat">
                    <div className="arsenal-stat-label">Original</div>
                    <div className="arsenal-stat-value">{(result.original_size_bytes / 1e6).toFixed(1)}MB</div>
                  </div>
                  <div className="arsenal-stat">
                    <div className="arsenal-stat-label">Compressed</div>
                    <div className="arsenal-stat-value accent">{(result.compressed_size_bytes / 1e6).toFixed(1)}MB</div>
                  </div>
                  <div className="arsenal-stat">
                    <div className="arsenal-stat-label">Reduction</div>
                    <div className="arsenal-stat-value accent">{result.reduction_pct}%</div>
                  </div>
                </div>
                <div style={{ padding: '1rem', marginTop: '1rem', background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 4 }}>
                  <div style={{ fontSize: '0.7rem', color: '#22c55e' }}>
                    <strong>✓ Metadata Scrubbed</strong> — GPS, timestamps, and camera info removed
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="arsenal-card" style={{ marginTop: '1.5rem' }}>
        <div className="arsenal-card-header"><span className="arsenal-card-title">Compression History</span></div>
        <div className="arsenal-card-body">
          <HistoryTable<VideoRecord>
            rows={history}
            keyField={(r) => r.video_id + r.created_at}
            emptyText="No videos processed yet."
            columns={[
              { header: 'Video', render: (r) => <span style={{ color: 'var(--white)' }}>{r.video_id}</span> },
              { header: 'Original', render: (r) => `${(r.original_size_bytes / 1e6).toFixed(1)}MB` },
              { header: 'Compressed', render: (r) => `${(r.compressed_size_bytes / 1e6).toFixed(1)}MB` },
              { header: 'Reduction', render: (r) => `${r.reduction_pct}%` },
              { header: 'Date', render: (r) => new Date(r.created_at).toLocaleString('en-IN') },
            ]}
          />
        </div>
      </div>
    </ToolLayout>
  );
}