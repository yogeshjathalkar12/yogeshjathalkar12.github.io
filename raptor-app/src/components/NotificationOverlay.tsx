import { useNavigate } from 'react-router-dom';
import { useNotifications } from '../hooks/NotificationsContext';

export function NotificationOverlay() {
  const { urgentQueue, markAsRead } = useNotifications();
  const navigate = useNavigate();

  if (urgentQueue.length === 0) return null;

  // Only ever show the oldest one — dismissing it reveals the next,
  // never stack multiple interruptions on top of each other.
  const current = urgentQueue[0];

  const handleAction = () => {
    markAsRead(current.id);
    if (current.action_url) navigate(current.action_url);
  };

  if (current.display_mode === 'banner') {
    return (
      <div
        style={{
          position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999,
          background: current.type === 'alert' ? 'var(--red)' : 'var(--grad)',
          color: '#fff', padding: '0.7rem 1.2rem', display: 'flex',
          alignItems: 'center', justifyContent: 'center', gap: '1rem', fontSize: '0.75rem',
        }}
      >
        <span><strong>{current.title}</strong>{current.body ? ` — ${current.body}` : ''}</span>
        {current.action_label && current.action_url && (
          <button
            onClick={handleAction}
            style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff', padding: '0.3rem 0.8rem', borderRadius: '4px', cursor: 'pointer', fontSize: '0.7rem' }}
          >
            {current.action_label}
          </button>
        )}
        <span onClick={() => markAsRead(current.id)} style={{ cursor: 'pointer', opacity: 0.8, fontSize: '0.9rem' }}>✕</span>
      </div>
    );
  }

  // display_mode === 'modal'
  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.7)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem',
      }}
    >
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px', padding: '2rem', maxWidth: 420, textAlign: 'center' }}>
        <h2 style={{ color: 'var(--white)', fontFamily: "'Bebas Neue', sans-serif", fontSize: '1.6rem', marginBottom: '0.8rem' }}>
          {current.title}
        </h2>
        {current.body && <p style={{ color: 'var(--dim)', fontSize: '0.75rem', lineHeight: 1.7, marginBottom: '1.6rem' }}>{current.body}</p>}
        <div style={{ display: 'flex', gap: '0.7rem', justifyContent: 'center' }}>
          <button
            onClick={() => markAsRead(current.id)}
            style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--dim)', padding: '0.6rem 1.2rem', borderRadius: '6px', cursor: 'pointer', fontSize: '0.7rem' }}
          >
            Dismiss
          </button>
          {current.action_label && current.action_url && (
            <button
              onClick={handleAction}
              style={{ background: 'var(--grad)', border: 'none', color: '#fff', padding: '0.6rem 1.2rem', borderRadius: '6px', cursor: 'pointer', fontSize: '0.7rem' }}
            >
              {current.action_label}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}