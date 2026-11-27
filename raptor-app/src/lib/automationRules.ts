// What a CRM automation rule can say: its "when", its "then" and its "only if". The same rules are applied by the server job that runs
// them (websites-api raptor/crm/automations_router.py), so a choice added here needs adding there too.

export type Target = 'contact' | 'deal' | 'task';

export const OLD_TRIGGERS = ['contact_no_reply', 'deal_stalled', 'deal_won'];
export const NEW_TRIGGERS = ['contact_created', 'deal_created', 'deal_in_stage', 'task_overdue'];
export const SCORE_TRIGGER = 'contact_score';          // needs 2026-11-29_c_score_trigger.sql
export const OLD_ACTIONS = ['log_note', 'create_reminder', 'webhook'];
export const NEW_ACTIONS = ['assign', 'set_status', 'add_tag', 'notify'];

export const TRIGGER_NAMES: Record<string, string> = {
  contact_no_reply: 'A hot or active contact goes quiet',
  deal_stalled: 'A deal sits in the same stage',
  deal_won: 'A deal is marked Won',
  contact_created: 'A contact is added',
  deal_created: 'A deal is added',
  deal_in_stage: 'A deal reaches a stage',
  task_overdue: 'A task is overdue',
  contact_score: 'A contact’s score reaches a number',
};

export const ACTION_NAMES: Record<string, string> = {
  log_note: 'Log a note',
  create_reminder: 'Create a task',
  webhook: 'Call a webhook',
  assign: 'Assign it to someone',
  set_status: 'Set the contact’s status',
  add_tag: 'Add a tag',
  notify: 'Send a notification',
};

export const STATUSES: [string, string][] = [['new', 'New'], ['cold', 'Cold'], ['active', 'Active'], ['hot', 'Hot']];
export const ACTIONS_WITH_MESSAGE = ['log_note', 'create_reminder', 'notify'];
export const ACTIONS_WITH_VALUE = ['assign', 'set_status', 'add_tag'];

export const targetOf = (trigger: string): Target =>
  (['contact_no_reply', 'contact_created', SCORE_TRIGGER].includes(trigger) ? 'contact' : trigger === 'task_overdue' ? 'task' : 'deal');
export const showsDays = (trigger: string): boolean => trigger !== 'deal_won' && trigger !== SCORE_TRIGGER;
export const leastDays = (trigger: string): number => (NEW_TRIGGERS.includes(trigger) ? 0 : 1);

export function actionsFor(trigger: string, installed: boolean): string[] {
  const all = installed ? [...OLD_ACTIONS, ...NEW_ACTIONS] : OLD_ACTIONS;
  // A task about an overdue task would itself fall overdue, without end; and tasks have no tags.
  return trigger === 'task_overdue' ? all.filter((a) => a !== 'create_reminder' && a !== 'add_tag') : all;
}

export const conditionsFor = (trigger: string): ('min_value' | 'status' | 'tag')[] => {
  const target = targetOf(trigger);
  return target === 'contact' ? ['status', 'tag'] : target === 'deal' ? ['min_value', 'tag'] : [];
};

export interface RuleDraft {
  trigger: string;
  days: string;
  stage: string;
  score: string;
  action: string;
  value: string;          // who to assign to, the status, or the tag
  message: string;
  webhook: string;
  minValue: string;
  status: string;
  tag: string;
  enabled: boolean;
}

export const emptyDraft = (): RuleDraft => ({
  trigger: 'contact_no_reply', days: '3', stage: '', score: '', action: 'log_note', value: '', message: '', webhook: '',
  minValue: '', status: '', tag: '', enabled: true,
});

export function draftOf(rule: any): RuleDraft {
  const c = rule?.conditions || {};
  return {
    trigger: rule.trigger_type || 'contact_no_reply',
    days: String(rule.trigger_days ?? 3),
    stage: rule.trigger_type === SCORE_TRIGGER ? '' : rule.trigger_value || '',
    score: rule.trigger_type === SCORE_TRIGGER ? rule.trigger_value || '' : '',
    action: rule.action_type || 'log_note',
    value: rule.action_value || '',
    message: rule.action_message || '',
    webhook: rule.action_webhook_url || '',
    minValue: c.min_value === undefined || c.min_value === null ? '' : String(c.min_value),
    status: c.status || '',
    tag: c.tag || '',
    enabled: rule.enabled !== false,
  };
}

/** The draft after the "when" was changed: a "then" that no longer fits is replaced, and the days make sense for the new choice. */
export function withTrigger(draft: RuleDraft, trigger: string, installed: boolean): RuleDraft {
  const fits = actionsFor(trigger, installed);
  const action = fits.includes(draft.action) ? draft.action : fits[0];
  const wasNew = NEW_TRIGGERS.includes(draft.trigger);
  const isNew = NEW_TRIGGERS.includes(trigger);
  const days = wasNew === isNew ? draft.days : isNew ? '0' : '3';
  return { ...draft, trigger, days, action, value: action === draft.action ? draft.value : '' };
}

export function problemWith(draft: RuleDraft): string | null {
  if (showsDays(draft.trigger)) {
    const days = Number(draft.days);
    if (draft.days.trim() === '' || !Number.isInteger(days) || days < leastDays(draft.trigger) || days > 3650) {
      return `Days must be a whole number, ${leastDays(draft.trigger)} or more.`;
    }
  }
  if (draft.trigger === 'deal_in_stage' && !draft.stage) return 'Choose the stage.';
  if (draft.trigger === SCORE_TRIGGER && !/^-?\d{1,6}$/.test(draft.score.trim())) return 'Type the score as a whole number.';
  if (ACTIONS_WITH_MESSAGE.includes(draft.action) && !draft.message.trim()) return 'Add a message for this action.';
  if (draft.action === 'webhook' && !/^https?:\/\/\S+$/i.test(draft.webhook.trim())) return 'Add a webhook address starting with https://';
  if (draft.action === 'assign' && !draft.value) return 'Choose the person.';
  if (draft.action === 'set_status' && !STATUSES.some(([k]) => k === draft.value)) return 'Choose the status.';
  if (draft.action === 'add_tag' && !draft.value.trim()) return 'Type the tag.';
  if (conditionsFor(draft.trigger).includes('min_value') && draft.minValue.trim() !== '' && !(Number(draft.minValue) >= 0)) {
    return '“Worth at least” must be a number.';
  }
  return null;
}

/** The row to save. The newer columns are sent only when the database has them. */
export function ruleRow(draft: RuleDraft, installed: boolean): Record<string, unknown> {
  const row: Record<string, unknown> = {
    trigger_type: draft.trigger,
    trigger_days: showsDays(draft.trigger) ? Number(draft.days) || 0 : 0,
    action_type: draft.action,
    action_message: ACTIONS_WITH_MESSAGE.includes(draft.action) ? draft.message.trim() : null,
    action_webhook_url: draft.action === 'webhook' ? draft.webhook.trim() : null,
    enabled: draft.enabled,
  };
  if (!installed) return row;
  const conditions: Record<string, unknown> = {};
  const fits = conditionsFor(draft.trigger);
  if (fits.includes('min_value') && draft.minValue.trim() !== '') conditions.min_value = Number(draft.minValue);
  if (fits.includes('status') && draft.status) conditions.status = draft.status;
  if (fits.includes('tag') && draft.tag.trim()) conditions.tag = draft.tag.trim();
  row.trigger_value = draft.trigger === 'deal_in_stage' ? draft.stage : draft.trigger === SCORE_TRIGGER ? draft.score.trim() : null;
  row.action_value = ACTIONS_WITH_VALUE.includes(draft.action) ? draft.value.trim() : null;
  row.conditions = conditions;
  return row;
}

export interface RuleNames { stages?: Record<string, string>; people?: Record<string, string> }

const plural = (n: number) => `${n} day${n === 1 ? '' : 's'}`;

/** A rule in words: "When {when}, {then}." */
export function describeRule(rule: any, names: RuleNames = {}): { when: string; then: string } {
  const days = Number(rule.trigger_days) || 0;
  const stage = names.stages?.[rule.trigger_value] || 'a chosen stage';
  const whens: Record<string, string> = {
    contact_no_reply: `A hot/active contact goes ${plural(days)} without a reply`,
    deal_stalled: `A deal sits in the same stage for ${plural(days)}`,
    deal_won: 'A deal is marked Won',
    contact_created: days ? `A contact was added ${plural(days)} ago` : 'A contact is added',
    deal_created: days ? `A deal was added ${plural(days)} ago` : 'A deal is added',
    deal_in_stage: days ? `A deal has been in ${stage} for ${plural(days)}` : `A deal reaches ${stage}`,
    task_overdue: days ? `A task is ${plural(days)} overdue` : 'A task becomes overdue',
    contact_score: `A contact’s score reaches ${rule.trigger_value || '…'}`,
  };
  const c = rule.conditions || {};
  const only: string[] = [];
  const fits = conditionsFor(rule.trigger_type);
  if (fits.includes('min_value') && c.min_value !== undefined && c.min_value !== null && c.min_value !== '') only.push(`worth at least ${c.min_value}`);
  if (fits.includes('status') && c.status) only.push(`status ${STATUSES.find(([k]) => k === c.status)?.[1] || c.status}`);
  if (fits.includes('tag') && c.tag) only.push(`tagged “${c.tag}”`);
  const value = rule.action_value || '';
  const thens: Record<string, string> = {
    log_note: `log a note: "${rule.action_message || ''}"`,
    create_reminder: `create a task: "${rule.action_message || ''}"`,
    webhook: `call the webhook ${rule.action_webhook_url || '(no URL set)'}`,
    assign: `assign it to ${names.people?.[value] || 'a chosen person'}`,
    set_status: `set the contact’s status to ${STATUSES.find(([k]) => k === value)?.[1] || value}`,
    add_tag: `add the tag “${value}”`,
    notify: `send a notification: "${rule.action_message || ''}"`,
  };
  const when = whens[rule.trigger_type] || String(rule.trigger_type);
  return { when: only.length ? `${when} (only if ${only.join(' and ')})` : when, then: thens[rule.action_type] || String(rule.action_type) };
}
