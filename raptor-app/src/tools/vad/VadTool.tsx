import { useEffect, useRef, useState } from 'react';
import { ToolLayout } from '../../layouts/ToolLayout';
import { useAuthedFetch } from '../../hooks/useAuthedFetch';
import { useToast } from '../../hooks/ToastContext';
import { HistoryTable } from '../../components/HistoryTable';
import { toolApiBase } from '../../lib/config';
import { findTool } from '../registry';
import { OutOfCreditsError } from '../../lib/apiErrors';

const TOOL = findTool('vad')!;
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

// Measures how much of the recording is talking vs. quiet, entirely in the
// browser: the audio is decoded with the browser's own AudioContext and each
// 20ms slice is classed as "talking" or "quiet" by its loudness (RMS energy
// threshold). It produces NO new audio file - only these totals are saved.
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
    if (!currentFile) return showToast('Choose a call recording first', 'error');
    const label = callId.trim() || currentFile.name;

    setProcessing(true);
    setProgress(0);
    let vadResult: VadResult;
    try {
      vadResult = await stripSilence(currentFile, setProgress);
      setProgress(100);
    } catch {
      showToast('Couldn’t read that audio file. Try an .mp3, .wav or .m4a recording.', 'error');
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
      showToast('Done — your report is ready', 'success');
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
          <div className="arsenal-card-header"><span className="arsenal-card-title">Choose a call recording</span></div>
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
              <div className="arsenal-dropzone-text">Drop a call recording here (.mp3, .wav, .m4a) or click to choose one</div>
              <div className="arsenal-dropzone-sub">Analysed on your own computer — the recording is never uploaded</div>
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
              <label className="arsenal-label">Name for this call</label>
              <input className="arsenal-input" value={callId} onChange={(e) => setCallId(e.target.value)} placeholder="e.g. Call with Acme, 5 July" />
            </div>

            <button className="arsenal-btn" disabled={!currentFile || processing} onClick={runProcess}>
              {processing ? (<><span className="arsenal-spinner" /> Listening…</>) : 'Measure the silence →'}
            </button>
            <div className="arsenal-progress"><div className="arsenal-progress-fill" style={{ width: `${progress}%` }} /></div>
          </div>
        </div>

        <div className="arsenal-card">
          <div className="arsenal-card-header"><span className="arsenal-card-title">Your report</span></div>
          <div className="arsenal-card-body">
            {!result ? (
              <div className="arsenal-empty">
                <div className="arsenal-empty-icon">◌</div>
                <div className="arsenal-empty-text">Choose a call to see how much of it was talking.</div>
              </div>
            ) : (
              <div className="arsenal-stats">
                <div className="arsenal-stat">
                  <div className="arsenal-stat-label">Whole call</div>
                  <div className="arsenal-stat-value">{Math.round(result.original_duration_sec)}s</div>
                </div>
                <div className="arsenal-stat">
                  <div className="arsenal-stat-label">Talking time</div>
                  <div className="arsenal-stat-value accent">{Math.round(result.compressed_duration_sec)}s</div>
                </div>
                <div className="arsenal-stat">
                  <div className="arsenal-stat-label">Time spent quiet</div>
                  <div className="arsenal-stat-value accent">{result.silence_removed_pct}%</div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="arsenal-card" style={{ marginTop: '1.5rem' }}>
        <div className="arsenal-card-header"><span className="arsenal-card-title">Past reports</span></div>
        <div className="arsenal-card-body">
          <HistoryTable<Recording>
            rows={history}
            keyField={(r) => r.call_id + r.created_at}
            emptyText="No calls measured yet."
            columns={[
              { header: 'Call', render: (r) => <span style={{ color: 'var(--white)' }}>{r.call_id}</span> },
              { header: 'Whole call', render: (r) => `${Math.round(r.original_duration_sec)}s` },
              { header: 'Talking', render: (r) => `${Math.round(r.compressed_duration_sec)}s` },
              { header: 'Quiet', render: (r) => `${r.silence_removed_pct}%` },
              { header: 'When', render: (r) => new Date(r.created_at).toLocaleString('en-IN') },
            ]}
          />
        </div>
      </div>
    </ToolLayout>
  );
}