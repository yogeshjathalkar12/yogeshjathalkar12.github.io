import { useEffect, useRef, useState } from 'react';

interface RowMenuAction {
  label: string;
  onClick: () => void;
  danger?: boolean;
}

interface RowMenuProps {
  actions: RowMenuAction[];
}

// Generic "⋯" row-actions dropdown. Drop this into any table/list row —
// pass the actions (e.g. Edit / Delete) and it handles open/close and
// outside-click dismissal. Meant to be reused across Contacts, Deals,
// Automations, Campaigns, etc.
export default function RowMenu({ actions }: RowMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div
      ref={ref}
      style={{ position: 'relative', display: 'inline-block' }}
      onClick={(e) => e.stopPropagation()} // don't trigger a parent row's onClick
    >
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Row actions"
        style={{
          background: 'transparent',
          border: '1px solid var(--border)',
          color: 'var(--dim)',
          width: 28,
          height: 28,
          borderRadius: '4px',
          cursor: 'pointer',
          fontSize: '0.9rem',
          lineHeight: 1,
        }}
      >
        ⋯
      </button>
      {open && (
        <div
          style={{
            position: 'absolute',
            top: '110%',
            right: 0,
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: '4px',
            minWidth: 130,
            zIndex: 10,
            overflow: 'hidden',
            boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
          }}
        >
          {actions.map((a, i) => (
            <button
              key={i}
              onClick={() => {
                setOpen(false);
                a.onClick();
              }}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: '0.6rem 0.9rem',
                background: 'transparent',
                border: 'none',
                borderBottom: i < actions.length - 1 ? '1px solid var(--border)' : 'none',
                cursor: 'pointer',
                fontFamily: 'var(--mono)',
                fontSize: '0.6rem',
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
                color: a.danger ? 'var(--red)' : 'var(--white)',
              }}
            >
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}