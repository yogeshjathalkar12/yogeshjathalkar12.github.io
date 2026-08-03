// Shared formatting helpers used across all CRM pages.
// Keeping these in one place means every page renders money/time/names identically.

export function formatCurrency(value: number | string | null | undefined): string {
  const n = Number(value) || 0;
  return '$' + n.toLocaleString();
}

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

export const TRIGGER_LABELS: Record<string, (days: number) => string> = {
  contact_no_reply: (days) => `A hot/active contact goes ${days} day${days === 1 ? '' : 's'} without a reply`,
  deal_stalled: (days) => `A deal sits in the same stage for ${days} day${days === 1 ? '' : 's'}`,
  deal_won: () => `A deal is marked Won`,
};

export const ACTION_LABELS: Record<string, (a: any) => string> = {
  log_note: (a) => `log a note: "${a.action_message || ''}"`,
  create_reminder: (a) => `create a reminder: "${a.action_message || ''}"`,
  webhook: (a) => `call the webhook ${a.action_webhook_url || '(no URL set)'}`,
};

export function describeAutomation(a: any) {
  const triggerFn = TRIGGER_LABELS[a.trigger_type] || (() => a.trigger_type);
  const actionFn = ACTION_LABELS[a.action_type] || (() => a.action_type);
  return { when: triggerFn(a.trigger_days), then: actionFn(a) };
}