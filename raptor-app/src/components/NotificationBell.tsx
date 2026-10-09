import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useNotifications, type AppNotification } from '../hooks/NotificationsContext';

const TYPE_COLOR: Record<AppNotification['type'], string> = {
  info: 'var(--purple)',
  success: 'var(--green)',
  warning: '#eab308',
  alert: 'var(--red)',
};

function relativeTime(dateString: string) {
  const hours = Math.abs(Date.now() - new Date(dateString).getTime()) / 36e5;
  if (hours < 1) return 'Just now';
  if (hours < 24) return `${Math.floor(hours)}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function NotificationBell() {
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  const handleClick = (n: AppNotification) => {
    if (!n.is_read) markAsRead(n.id);
    if (n.action_url) {
      setOpen(false);
      navigate(n.action_url);
    }
  };

  return (
    <div style={{ position: 'relative' }}>
      <div
        onClick={() => setOpen((v) => !v)}
        style={{ position: 'relative', cursor: 'pointer', color: 'var(--white)', padding: '0.3rem', display: 'flex' }}
        title="Notifications"
      >
        <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M12 2.2a1.6 1.6 0 0 0-1.6 1.6v.62C7.6 5.1 6 7.5 6 10.4v4.1l-1.7 2.2c-.5.65-.04 1.6.8 1.6h13.8c.84 0 1.3-.95.8-1.6L18 14.5v-4.1c0-2.9-1.6-5.3-4.4-5.98V3.8A1.6 1.6 0 0 0 12 2.2Z" />
          <path d="M9.6 19.6a2.4 2.4 0 0 0 4.8 0H9.6Z" />
        </svg>
        {unreadCount > 0 && (
          <span
            style={{
              position: 'absolute', top: -3, right: -5, background: '#e5303a', color: '#fff',
              borderRadius: '999px', fontSize: '0.62rem', fontWeight: 700, minWidth: 18, height: 18, display: 'flex',
              alignItems: 'center', justifyContent: 'center', padding: '0 4px', fontFamily: 'var(--mono)', lineHeight: 1,
              boxShadow: '0 0 0 2px var(--black)',
            }}
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </div>

      {open && (
        <div
          className="dash-user-dropdown open"
          style={{ minWidth: 340, maxWidth: 340, padding: 0, right: 0 }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.9rem 1rem', borderBottom: '1px solid var(--border)' }}>
            <span style={{ color: 'var(--white)', fontSize: '0.75rem', fontWeight: 600 }}>Notifications</span>
            {unreadCount > 0 && (
              <span
                onClick={markAllAsRead}
                style={{ color: 'var(--purple)', fontSize: '0.6rem', cursor: 'pointer' }}
              >
                Mark all read
              </span>
            )}
          </div>

          <div style={{ maxHeight: 360, overflowY: 'auto' }}>
            {notifications.length === 0 ? (
              <div style={{ padding: '2rem 1rem', textAlign: 'center', color: 'var(--dim)', fontSize: '0.65rem' }}>
                Nothing yet.
              </div>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  onClick={() => handleClick(n)}
                  style={{
                    padding: '0.8rem 1rem', borderBottom: '1px solid var(--border)', cursor: n.action_url ? 'pointer' : 'default',
                    background: n.is_read ? 'transparent' : 'rgba(168,85,247,0.05)', display: 'flex', gap: '0.6rem',
                  }}
                >
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: TYPE_COLOR[n.type], marginTop: 5, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: 'var(--white)', fontSize: '0.7rem', fontWeight: n.is_read ? 400 : 600 }}>{n.title}</div>
                    {n.body && <div style={{ color: 'var(--dim)', fontSize: '0.65rem', marginTop: '0.2rem', lineHeight: 1.5 }}>{n.body}</div>}
                    <div style={{ color: 'var(--dim2)', fontSize: '0.58rem', marginTop: '0.3rem' }}>{relativeTime(n.created_at)}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}