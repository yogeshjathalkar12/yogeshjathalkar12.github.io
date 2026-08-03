import type React from 'react';
import type { ReactNode } from 'react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  width?: number;
}

export default function Modal({ open, onClose, title, children, width = 440 }: ModalProps) {
  if (!open) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 3000,
        background: 'rgba(3,3,3,0.75)',
        backdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.5rem',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          maxWidth: width,
          width: '100%',
          padding: '2rem',
          maxHeight: '90vh',
          overflowY: 'auto',
          position: 'relative',
          borderRadius: '6px',
        }}
      >
        <button
          onClick={onClose}
          aria-label="Close"
          style={{
            position: 'absolute',
            top: '1.1rem',
            right: '1.1rem',
            background: 'none',
            border: 'none',
            color: 'var(--dim)',
            cursor: 'pointer',
            fontSize: '1rem',
            lineHeight: 1,
          }}
        >
          ✕
        </button>
        {title && (
          <div
            style={{
              fontFamily: 'Bebas Neue, sans-serif',
              fontSize: '1.5rem',
              letterSpacing: '0.03em',
              marginBottom: '1.4rem',
            }}
          >
            {title}
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

// Shared field styles so every form across the CRM looks the same.
export const fieldLabelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '0.55rem',
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  color: 'var(--dim)',
  marginBottom: '0.4rem',
};

export const fieldInputStyle: React.CSSProperties = {
  width: '100%',
  padding: '0.65rem 0.8rem',
  background: 'var(--surface2)',
  border: '1px solid var(--border)',
  color: 'var(--white)',
  fontFamily: 'var(--mono)',
  fontSize: '0.75rem',
  borderRadius: '4px',
  marginBottom: '1.1rem',
};

export const primaryBtnStyle: React.CSSProperties = {
  padding: '0.7rem 1rem',
  background: 'var(--grad)',
  color: '#fff',
  border: 'none',
  cursor: 'pointer',
  fontFamily: 'var(--mono)',
  fontSize: '0.65rem',
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  borderRadius: '4px',
  flex: 1,
};

export const ghostBtnStyle: React.CSSProperties = {
  padding: '0.7rem 1rem',
  background: 'transparent',
  color: 'var(--dim)',
  border: '1px solid var(--border)',
  cursor: 'pointer',
  fontFamily: 'var(--mono)',
  fontSize: '0.65rem',
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  borderRadius: '4px',
  flex: 1,
};