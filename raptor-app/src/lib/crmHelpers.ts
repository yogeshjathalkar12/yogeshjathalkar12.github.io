// Shared formatting helpers used across all CRM pages.
// Keeping these in one place means every page renders money/time/names identically.

// formatCurrency moved to lib/currency.ts (it's currency/locale-aware now,
// driven by the signed-in user's country setting - see
// hooks/CurrencyContext.tsx) - re-exported here so every existing
// `import { formatCurrency } from '../../lib/crmHelpers'` keeps working
// unchanged.
export { formatCurrency } from './currency';

export function relativeTime(dateString?: string | null): string {
  if (!dateString) return '—';
  const then = new Date(dateString).getTime();
  if (Number.isNaN(then)) return '—';
  const diffMs = Date.now() - then;
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

export function initials(name?: string | null): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export const TYPE_ICON: Record<string, string> = {
  email: '✉',
  call: '☎',
  meeting: '◈',
  note: '✎',
};
