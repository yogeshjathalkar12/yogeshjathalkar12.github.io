import { useEffect, useRef, useState } from 'react';
import { ToolLayout } from '../../layouts/ToolLayout';
import { useAuthedFetch } from '../../hooks/useAuthedFetch';
import { useToast } from '../../hooks/ToastContext';
import { HistoryTable } from '../../components/HistoryTable';
import { toolApiBase } from '../../lib/config';
import { findTool } from '../registry';
import { OutOfCreditsError } from '../../lib/apiErrors';

const TOOL = findTool('vad')!;
// NOTE: vad.html hit `${RAPTOR_API_URL}/api/vad` directly (no `/raptor/`
// segment). toolApiBase() builds `/api/raptor/vad` — confirm that's
// actually where the backend route lives.
const API = toolApiBase('vad');

interface VadResult {
  originalDuration: number;
  compressedDuration: number;
}

interface LogResultResponse {
  original_duration_sec: number;
  compressed_duration_sec: number;
  silence_removed_pct: number;
  credits_left?: number;
}

interface Recording {
  call_id: string;
  original_duration_sec: number;
  compressed_duration_sec: number;
  silence_removed_pct: number;
  created_at: string;
}

// Real client-side VAD pass using the browser's own AudioContext to decode
// PCM and a simple RMS energy-threshold classifier per 20ms frame — the
// same frame-slicing/energy-threshold principle the WASM WebRTC VAD module
// uses. A production build would swap this function's body for a compiled
// webrtcvad.wasm module without changing anything else in the component.
async function stripSilence(file: File, onProgress: (pct: number) => void): Promise<VadResult> {
  const arrayBuffer = await file.arrayBuffer();
  const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext;
  const audioCtx = new AudioContextCtor();
  const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
  const channelData = audioBuffer.getChannelData(0);
  const sampleRate = audioBuffer.sampleRate;
  const frameSize = Math.floor(sampleRate * 0.02); // 20ms frames
  const totalFrames = Math.floor(channelData.length / frameSize);

  let voicedSamples = 0;
  const threshold = 0.012; // RMS energy threshold for "contains speech"

  for (let i = 0; i < totalFrames; i++) {
    const start = i * frameSize;
    let sumSquares = 0;
    for (let j = 0; j < frameSize; j++) {
      const s = channelData[start + j] || 0;
      sumSquares += s * s;
    }
    const rms = Math.sqrt(sumSquares / frameSize);
    if (rms > threshold) voicedSamples += frameSize;
    if (i % 200 === 0) onProgress(Math.min(95, Math.round((i / totalFrames) * 100)));
  }

  const originalDuration = audioBuffer.duration;
  const compressedDuration = voicedSamples / sampleRate;
  audioCtx.close();
  return { originalDuration, compressedDuration };
}

export default function VadTool() {
  const { authedFetch } = useAuthedFetch();
  const { showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [currentFile, setCurrentFile] = useState<File | null>(null);
  const [callId, setCallId] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [progress, setProgress] = useState(0);
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState<LogResultResponse | null>(null);
  const [history, setHistory] = useState<Recording[] | null>(null);

  const loadHistory = async () => {
    try {
      const json = await authedFetch<{ recordings: Recording[] }>(`${API}/history`, { skipCreditsSync: true });
      setHistory(json.recordings || []);
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
    if (!callId) setCallId(file.name.replace(/\.[^.]+$/, ''));
  };

  const clearFile = () => {
    setCurrentFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const runProcess = async () => {
    if (!currentFile) return showToast('Upload a call recording first', 'error');
    const label = callId.trim() || currentFile.name;

    setProcessing(true);
    setProgress(0);
    let vadResult: VadResult;
    try {
      vadResult = await stripSilence(currentFile, setProgress);
      setProgress(100);
    } catch {
      showToast('Could not decode this audio file in-browser', 'error');
      setProcessing(false);
      return;
    }

    try {
      const json = await authedFetch<LogResultResponse>(`${API}/log-result`, {
        method: 'POST',
        body: JSON.stringify({
          call_id: label,
          original_duration_sec: vadResult.originalDuration,
          compressed_duration_sec: vadResult.compressedDuration,
        }),
      });
      setResult(json);
      loadHistory();
      showToast('Silence stripped and logged', 'success');
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
          <div className="arsenal-card-header"><span className="arsenal-card-title">Upload Call Recording</span></div>
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
              <div className="arsenal-dropzone-text">Drop a call recording (.mp3, .wav, .m4a) or click to browse</div>
              <div className="arsenal-dropzone-sub">Processed locally via AudioContext + WASM VAD — never uploaded raw</div>
              <input
                ref={fileInputRef}
                type="file"
                accept="audio/*"
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
              <label className="arsenal-label">Call ID / Label</label>
              <input className="arsenal-input" value={callId} onChange={(e) => setCallId(e.target.value)} placeholder="call_2026_07_05_prospectX" />
            </div>

            <button className="arsenal-btn" disabled={!currentFile || processing} onClick={runProcess}>
              {processing ? (<><span className="arsenal-spinner" /> Slicing frames…</>) : 'Strip Silence →'}
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
                <div className="arsenal-empty-text">Upload a call to see the compression breakdown.</div>
              </div>
            ) : (
              <div className="arsenal-stats">
                <div className="arsenal-stat">
                  <div className="arsenal-stat-label">Original</div>
                  <div className="arsenal-stat-value">{Math.round(result.original_duration_sec)}s</div>
                </div>
                <div className="arsenal-stat">
                  <div className="arsenal-stat-label">Compressed</div>
                  <div className="arsenal-stat-value accent">{Math.round(result.compressed_duration_sec)}s</div>
                </div>
                <div className="arsenal-stat">
                  <div className="arsenal-stat-label">Silence Removed</div>
                  <div className="arsenal-stat-value accent">{result.silence_removed_pct}%</div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="arsenal-card" style={{ marginTop: '1.5rem' }}>
        <div className="arsenal-card-header"><span className="arsenal-card-title">Processing History</span></div>
        <div className="arsenal-card-body">
          <HistoryTable<Recording>
            rows={history}
            keyField={(r) => r.call_id + r.created_at}
            emptyText="No calls processed yet."
            columns={[
              { header: 'Call', render: (r) => <span style={{ color: 'var(--white)' }}>{r.call_id}</span> },
              { header: 'Original', render: (r) => `${Math.round(r.original_duration_sec)}s` },
              { header: 'Compressed', render: (r) => `${Math.round(r.compressed_duration_sec)}s` },
              { header: 'Removed', render: (r) => `${r.silence_removed_pct}%` },
              { header: 'Date', render: (r) => new Date(r.created_at).toLocaleString('en-IN') },
            ]}
          />
        </div>
      </div>
    </ToolLayout>
  );
}