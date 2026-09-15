import { useEffect, useRef, useState } from 'react';
import { connectCallSocket, endCall, type CallSocketMessage } from '../../lib/calls';

interface LiveCallPanelProps {
  accessToken: string;
  prospectCompany: string;
  contactPhone: string | null;
  contactEmail: string | null;
  onClose: () => void;
}

type Line = { kind: 'transcript' | 'suggestion' | 'system'; text: string };

export default function LiveCallPanel({
  accessToken,
  prospectCompany,
  contactPhone,
  contactEmail,
  onClose,
}: LiveCallPanelProps) {
  const [lines, setLines] = useState<Line[]>([
    { kind: 'system', text: `Listening for ${prospectCompany}. Dial via phone/WhatsApp/softphone — the mic is already on.` },
  ]);
  const [summary, setSummary] = useState<string | null>(null);
  const [ended, setEnded] = useState(false);
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const onMessage = (msg: CallSocketMessage) => {
      if (msg.type === 'call_transcript') {
        setLines((prev) => [...prev, { kind: 'transcript', text: msg.text }]);
      } else if (msg.type === 'call_suggestion') {
        setLines((prev) => [...prev, { kind: 'suggestion', text: msg.text }]);
      } else if (msg.type === 'call_ended') {
        setEnded(true);
      } else if (msg.type === 'call_summary') {
        setSummary(msg.text);
      }
    };
    cleanupRef.current = connectCallSocket(accessToken, onMessage);
    return () => cleanupRef.current?.();
  }, [accessToken]);

  const handleManualEnd = async () => {
    try {
      await endCall(accessToken);
    } catch (err) {
      // The call may already have auto-ended (45s silence) right as this
      // was clicked — that's fine, not worth surfacing as an error.
      console.warn('End call:', err);
    }
  };

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
      }}
    >
      <div
        style={{
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px',
          width: '480px', maxHeight: '80vh', display: 'flex', flexDirection: 'column',
        }}
      >
        <div style={{ padding: '1rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            {!ended && <span style={{ color: '#ff4444', fontSize: '0.6rem', marginRight: 8 }}>● LIVE</span>}
            <strong style={{ fontSize: '0.8rem' }}>{prospectCompany}</strong>
            <div style={{ fontSize: '0.6rem', color: 'var(--dim)', marginTop: 4 }}>
              {contactPhone || contactEmail || 'No contact details on file'}
            </div>
          </div>
          {!ended ? (
            <button onClick={handleManualEnd} style={{ fontSize: '0.6rem', padding: '0.4rem 0.8rem' }}>
              End Call
            </button>
          ) : (
            <button onClick={onClose} style={{ fontSize: '0.6rem', padding: '0.4rem 0.8rem' }}>
              Close
            </button>
          )}
        </div>

        <div style={{ padding: '1rem', overflowY: 'auto', flex: 1 }}>
          {lines.map((line, i) => (
            <div
              key={i}
              style={{
                fontSize: '0.7rem',
                marginBottom: '0.5rem',
                color: line.kind === 'suggestion' ? '#4caf50' : line.kind === 'system' ? 'var(--dim)' : 'var(--white)',
                background: line.kind === 'suggestion' ? '#0d2d0d' : 'transparent',
                padding: line.kind === 'suggestion' ? '0.5rem' : 0,
                borderRadius: line.kind === 'suggestion' ? '4px' : 0,
              }}
            >
              {line.text}
            </div>
          ))}
          {ended && (
            <div style={{ fontSize: '0.7rem', color: 'var(--dim)', marginTop: '1rem' }}>
              {summary ? summary : 'Call ended — generating summary…'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}