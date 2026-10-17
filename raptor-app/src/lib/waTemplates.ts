// The starter WhatsApp library shown in the app, so a new person never faces an empty form.
//
// Five kinds, matching what each WhatsApp page can create:
//   replies    keyword replies (Triggers). Free-form, so they need no approval from Meta.
//   flows      conversation flows (AI Flows). Built into the flow builder's own node format, saved PAUSED.
//   prompts    instructions for the AI Reply step.
//   messages   message templates for Broadcasts and Sequences. Meta must APPROVE these first; Raptor shows the exact text to
//              submit in WhatsApp Manager, and the same name is then typed into the broadcast or sequence.
//   sequences  drip sequences made of those message templates.
//
// The same library is used by the desktop app (raptor-ui/src/pages/whatsapp/waTemplates.js, a copy kept in sync by hand).
// Words in [square brackets] are blanks the person must fill in. No statistics, customers or promises are invented here.
//
// Facts about how Raptor sends, which these templates are written around:
//  - A tapped button or list option arrives as its ID (the title in lower case, other characters turned into "_"), and
//    triggers match against that ID. So a menu button "Pricing" is picked up by a trigger whose keyword is "pricing".
//  - Messages inside flows cannot insert a person's name; a flow can ask for it and store it, but not repeat it back.
//  - A broadcast can fill ONE variable, {{1}}, with the contact's first name. Sequences cannot fill any variables.

// ───────────── shared helpers ─────────────

/** Same rule as the button/list ID in the flow builder and the triggers page: this is what a tapped option is matched on. */
export function slugify(title: string): string {
  return title.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);
}

// The blanks in a template, e.g. "[your business name]". Used to refuse activating something that still has one.
const PLACEHOLDER = /\[[A-Za-z][^\]\n]{1,80}\]/g;
export function findBlanks(text: string): string[] {
  return Array.from(new Set((text || '').match(PLACEHOLDER) || []));
}

// ───────────── keyword replies (Triggers) ─────────────

export interface WaReply {
  id: string;
  category: string;
  name: string;
  when: string;
  keyword: string;
  match_type: 'contains' | 'exact';
  reply_kind: 'text' | 'buttons' | 'list';
  text?: string;                                   // for 'text'
  body?: string;                                   // for 'buttons' and 'list'
  buttons?: string[];                              // titles, up to 3, up to 20 characters each
  button_label?: string;                           // for 'list': the label that opens the list
  rows?: { title: string; description?: string }[]; // for 'list': up to 10, title up to 24, description up to 72
}

export interface WaReplySet { id: string; category: string; name: string; when: string; replies: WaReply[] }

export const WA_REPLY_CATEGORIES = ['Welcome and menus', 'Sales', 'Support', 'Bookings and offers'];

const GREETING_BODY = 'Hi! Thanks for messaging [your business name]. How can we help you today?';
const greeting = (id: string, keyword: string): WaReply => ({
  id, category: 'Welcome and menus', name: `Welcome menu (${keyword})`, when: 'Answers a greeting with three buttons.',
  keyword, match_type: 'exact', reply_kind: 'buttons', body: GREETING_BODY, buttons: ['Pricing', 'Book a demo', 'Speak to us'],
});

export const WA_REPLIES: WaReply[] = [
  greeting('reply-welcome-hi', 'hi'),
  greeting('reply-welcome-hello', 'hello'),
  {
    id: 'reply-welcome-list', category: 'Welcome and menus', name: 'Welcome list of topics',
    when: 'Answers a greeting with a list of up to ten topics to choose from.',
    keyword: 'menu', match_type: 'exact', reply_kind: 'list',
    body: 'Welcome to [your business name]. Pick a topic and we will take you straight there.', button_label: 'Choose a topic',
    rows: [
      { title: 'Pricing', description: 'What it costs' },
      { title: 'Book a demo', description: 'See it working' },
      { title: 'Opening hours', description: 'When we are available' },
      { title: 'Speak to us', description: 'Talk to a person' },
    ],
  },
  {
    id: 'reply-pricing', category: 'Sales', name: 'Pricing',
    when: 'Sent when someone asks about price, or taps the Pricing button.',
    keyword: 'pricing', match_type: 'contains', reply_kind: 'text',
    text: '[A short summary of your pricing, for example "Plans start at ... per month".] The exact price depends on what you need. Tell us a little about your requirement and we will send a clear quote.',
  },
  {
    id: 'reply-price-word', category: 'Sales', name: 'Pricing (when they type "price")',
    when: 'The same answer for people who type "price" or "cost" instead of tapping a button.',
    keyword: 'price', match_type: 'contains', reply_kind: 'text',
    text: '[A short summary of your pricing, for example "Plans start at ... per month".] The exact price depends on what you need. Tell us a little about your requirement and we will send a clear quote.',
  },
  {
    id: 'reply-demo', category: 'Sales', name: 'Book a demo (simple)',
    when: 'Asks for the details needed to book a demo. Use the "Book a demo" flow instead if you want it guided.',
    keyword: 'book_a_demo', match_type: 'exact', reply_kind: 'text',
    text: 'Happy to show you [your product or service]. Please send your name, your company, and a day and time that suit you, and we will confirm.',
  },
  {
    id: 'reply-brochure', category: 'Sales', name: 'Brochure or catalogue',
    when: 'Sent when someone asks for a brochure, catalogue or more information.',
    keyword: 'brochure', match_type: 'contains', reply_kind: 'text',
    text: 'Here is our brochure: [link to your brochure or catalogue]. If you tell us what you are looking for, we can point you to the right part.',
  },
  {
    id: 'reply-quote', category: 'Sales', name: 'Ask for a quote',
    when: 'Sent when someone asks for a quote.',
    keyword: 'quote', match_type: 'contains', reply_kind: 'text',
    text: 'We would be glad to prepare a quote. Please tell us: 1) what you need, 2) the quantity or size, 3) when you need it. We will reply with a quote as soon as we can.',
  },
  {
    id: 'reply-speak-to-us', category: 'Support', name: 'Speak to a person',
    when: 'Sent when someone taps "Speak to us" or asks for a person.',
    keyword: 'speak_to_us', match_type: 'exact', reply_kind: 'text',
    text: 'Thank you. A member of our team will reply here shortly. Our hours are [your opening hours].',
  },
  {
    id: 'reply-help-list', category: 'Support', name: 'Help topics list',
    when: 'Sent when someone types "help". If you also add the "Sort support requests" flow, that flow answers first.',
    keyword: 'help', match_type: 'exact', reply_kind: 'list',
    body: 'We are here to help. What do you need?', button_label: 'Choose a topic',
    rows: [
      { title: 'Order or delivery', description: 'Where is my order' },
      { title: 'Billing or payment', description: 'Invoices and payments' },
      { title: 'Technical problem', description: 'Something is not working' },
      { title: 'Something else', description: 'Anything else' },
    ],
  },
  {
    id: 'reply-hours', category: 'Support', name: 'Opening hours',
    when: 'Sent when someone asks when you are open.',
    keyword: 'hours', match_type: 'contains', reply_kind: 'text',
    text: 'We are open [days and hours, for example Monday to Saturday, 10 am to 7 pm]. Outside these hours, leave a message and we will reply when we are back.',
  },
  {
    id: 'reply-location', category: 'Support', name: 'Address and directions',
    when: 'Sent when someone asks where you are.',
    keyword: 'address', match_type: 'contains', reply_kind: 'text',
    text: 'You can find us at [your address]. Map: [map link]. Landmarks and parking: [short directions].',
  },
  {
    id: 'reply-refund', category: 'Support', name: 'Refunds and returns',
    when: 'Sent when someone asks about a refund or return.',
    keyword: 'refund', match_type: 'contains', reply_kind: 'text',
    text: 'Our refund and return policy: [explain your policy in a few short lines]. To start a request, please send your order number and the reason.',
  },
  {
    id: 'reply-book', category: 'Bookings and offers', name: 'Book an appointment',
    when: 'Asks for what is needed to book.',
    keyword: 'book', match_type: 'exact', reply_kind: 'text',
    text: 'We would be happy to book you in. Please send your name, the service you want, and two days and times that suit you. We will confirm one of them.',
  },
  {
    id: 'reply-cancel', category: 'Bookings and offers', name: 'Cancel or reschedule',
    when: 'Sent when someone wants to cancel or move a booking.',
    keyword: 'reschedule', match_type: 'contains', reply_kind: 'text',
    text: 'No problem. Please send the name the booking is under and the new day and time you would like, or tell us if you want to cancel. [Your cancellation terms, if any.]',
  },
  {
    id: 'reply-offer', category: 'Bookings and offers', name: 'Current offer',
    when: 'Sent when someone asks about offers or discounts.',
    keyword: 'offer', match_type: 'contains', reply_kind: 'text',
    text: 'Our current offer: [what it is and who it is for]. It is valid until [date]. Reply "yes" and we will tell you how to claim it.',
  },
];

export const WA_REPLY_SETS: WaReplySet[] = [
  {
    id: 'set-welcome', category: 'Welcome and menus', name: 'Welcome menu set (6 replies)',
    when: 'A greeting with Pricing, Book a demo and Speak to us buttons, and the answers behind each button. Created paused.',
    replies: [
      WA_REPLIES.find((r) => r.id === 'reply-welcome-hi')!,
      WA_REPLIES.find((r) => r.id === 'reply-welcome-hello')!,
      WA_REPLIES.find((r) => r.id === 'reply-pricing')!,
      WA_REPLIES.find((r) => r.id === 'reply-demo')!,
      WA_REPLIES.find((r) => r.id === 'reply-speak-to-us')!,
      WA_REPLIES.find((r) => r.id === 'reply-help-list')!,
    ],
  },
  {
    id: 'set-basics', category: 'Support', name: 'Business basics set (4 replies)',
    when: 'Opening hours, address, refunds and offers: the questions every business gets. Created paused.',
    replies: ['reply-hours', 'reply-location', 'reply-refund', 'reply-offer'].map((id) => WA_REPLIES.find((r) => r.id === id)!),
  },
];

/** Everything a person sees in a reply (used to find blanks and to build the stored row). */
export function replyText(r: WaReply): string {
  if (r.reply_kind === 'text') return r.text || '';
  return [r.body, ...(r.buttons || []), r.button_label, ...(r.rows || []).flatMap((x) => [x.title, x.description])].filter(Boolean).join(' ');
}

/** The row to insert into whatsapp_triggers (minus account_id). Buttons and rows get the same IDs the form would give them. */
export function replyRow(r: WaReply) {
  const base = { keyword: r.keyword, match_type: r.match_type, reply_kind: r.reply_kind };
  if (r.reply_kind === 'text') return { ...base, reply_text: r.text, reply_payload: null };
  if (r.reply_kind === 'buttons') {
    return { ...base, reply_text: r.body, reply_payload: { body: r.body, buttons: (r.buttons || []).map((title) => ({ id: slugify(title), title })) } };
  }
  return {
    ...base, reply_text: r.body,
    reply_payload: { body: r.body, button_label: r.button_label || 'View options', rows: (r.rows || []).map((x) => ({ id: slugify(x.title), title: x.title, description: x.description || '' })) },
  };
}

// ───────────── conversation flows (AI Flows) ─────────────

type Next = string | undefined;
export type FlowSpec =
  | { id: string; kind: 'message'; text: string; next?: Next }
  | { id: string; kind: 'question'; text: string; variable_name: string; next?: Next }
  | { id: string; kind: 'buttons'; body: string; buttons: string[]; next: Record<string, string> }
  | { id: string; kind: 'list'; body: string; button_label: string; rows: { title: string; description?: string }[]; next: Record<string, string> }
  | { id: string; kind: 'ai_reply'; fallback_text: string; system_prompt?: string; next?: Next }
  | { id: string; kind: 'handoff'; note: string }
  | { id: string; kind: 'end' };

export interface WaFlowTemplate {
  id: string; category: string; name: string; when: string;
  entry_keyword: string; match_type: 'contains' | 'exact';
  nodes: FlowSpec[];          // the first node is where the flow begins
}

export const WA_FLOW_CATEGORIES = ['Sales', 'Support', 'AI assistant'];

export const WA_FLOWS: WaFlowTemplate[] = [
  {
    id: 'flow-qualify-lead', category: 'Sales', name: 'Qualify a new lead', entry_keyword: 'quote', match_type: 'contains',
    when: 'Asks a few questions, sorts people into exploring, wanting a quote or ready to buy, then hands the serious ones to you.',
    nodes: [
      { id: 'welcome', kind: 'message', text: 'Hi! Thanks for reaching out to [your business name]. A few quick questions will help us give you the right answer.', next: 'ask_name' },
      { id: 'ask_name', kind: 'question', text: 'What is your name?', variable_name: 'customer_name', next: 'ask_stage' },
      { id: 'ask_stage', kind: 'buttons', body: 'Thanks! Which best describes where you are?', buttons: ['Just exploring', 'Need a quote', 'Ready to buy'],
        next: { just_exploring: 'explore', need_a_quote: 'ask_requirement', ready_to_buy: 'ask_order' } },
      { id: 'explore', kind: 'message', text: 'No problem. A good place to start is [link to your website or brochure]. Message us any time you have questions.', next: 'finish' },
      { id: 'ask_requirement', kind: 'question', text: 'Tell us briefly what you need, for example the quantity, size or timeline.', variable_name: 'requirement', next: 'ask_time' },
      { id: 'ask_order', kind: 'question', text: 'Great! What would you like to order?', variable_name: 'order', next: 'ask_time' },
      { id: 'ask_time', kind: 'question', text: 'When is a good time for us to contact you?', variable_name: 'best_time', next: 'thanks' },
      { id: 'thanks', kind: 'message', text: 'Thank you! We have your details and a member of our team will contact you at that time.', next: 'handoff' },
      { id: 'handoff', kind: 'handoff', note: 'New lead from the WhatsApp qualification flow. The answers are in this conversation.' },
      { id: 'finish', kind: 'end' },
    ],
  },
  {
    id: 'flow-book-demo', category: 'Sales', name: 'Book a demo', entry_keyword: 'demo', match_type: 'contains',
    when: 'Collects name, company, preferred time and email, then hands over to you to confirm. Also starts when someone taps a "Book a demo" button.',
    nodes: [
      { id: 'welcome', kind: 'message', text: 'Great, let us set up a demo of [your product or service]. It takes about [how long, for example 20 minutes].', next: 'ask_name' },
      { id: 'ask_name', kind: 'question', text: 'What is your name?', variable_name: 'customer_name', next: 'ask_company' },
      { id: 'ask_company', kind: 'question', text: 'Which company are you with?', variable_name: 'company', next: 'ask_when' },
      { id: 'ask_when', kind: 'buttons', body: 'When suits you best?', buttons: ['Morning', 'Afternoon', 'Evening'],
        next: { morning: 'ask_email', afternoon: 'ask_email', evening: 'ask_email' } },
      { id: 'ask_email', kind: 'question', text: 'What email address should we send the invitation to?', variable_name: 'email', next: 'confirm' },
      { id: 'confirm', kind: 'message', text: 'Thank you! We will confirm the exact time by email shortly.', next: 'handoff' },
      { id: 'handoff', kind: 'handoff', note: 'Demo request. Name, company, preferred time and email are in this conversation.' },
    ],
  },
  {
    id: 'flow-support-triage', category: 'Support', name: 'Sort support requests', entry_keyword: 'help', match_type: 'contains',
    when: 'Asks what the problem is about, collects the details, then hands over to your team.',
    nodes: [
      { id: 'menu', kind: 'list', body: 'How can we help you today?', button_label: 'Choose a topic',
        rows: [{ title: 'Order or delivery' }, { title: 'Billing or payment' }, { title: 'Technical problem' }, { title: 'Something else' }],
        next: { order_or_delivery: 'ask_order', billing_or_payment: 'ask_billing', technical_problem: 'ask_tech', something_else: 'ask_other' } },
      { id: 'ask_order', kind: 'question', text: 'Please share your order number and tell us what happened.', variable_name: 'issue', next: 'thanks' },
      { id: 'ask_billing', kind: 'question', text: 'Please tell us what the problem is. For your safety, do not send card numbers or passwords.', variable_name: 'issue', next: 'thanks' },
      { id: 'ask_tech', kind: 'question', text: 'Please describe the problem and what you were doing when it happened.', variable_name: 'issue', next: 'thanks' },
      { id: 'ask_other', kind: 'question', text: 'Please tell us how we can help.', variable_name: 'issue', next: 'thanks' },
      { id: 'thanks', kind: 'message', text: 'Thank you. Our team has your message and will reply here as soon as possible. Our support hours are [your support hours].', next: 'handoff' },
      { id: 'handoff', kind: 'handoff', note: 'Support request. The topic and details are in this conversation.' },
    ],
  },
  {
    id: 'flow-feedback', category: 'Support', name: 'Collect feedback', entry_keyword: 'feedback', match_type: 'contains',
    when: 'Asks how it went. Happy people get a review link, unhappy people go straight to you.',
    nodes: [
      { id: 'ask', kind: 'buttons', body: 'How was your experience with [your business name]?', buttons: ['Great', 'It was okay', 'Not good'],
        next: { great: 'thanks_great', it_was_okay: 'ask_improve', not_good: 'ask_sorry' } },
      { id: 'thanks_great', kind: 'message', text: 'Wonderful, thank you! If you have a minute, a review helps others find us: [your review link].', next: 'finish' },
      { id: 'ask_improve', kind: 'question', text: 'Thank you for being honest. What could we do better?', variable_name: 'improvement', next: 'thanks_improve' },
      { id: 'thanks_improve', kind: 'message', text: 'Thanks for telling us. We will use it to improve.', next: 'finish' },
      { id: 'ask_sorry', kind: 'question', text: 'We are sorry to hear that. What went wrong?', variable_name: 'complaint', next: 'handoff' },
      { id: 'handoff', kind: 'handoff', note: 'Unhappy customer. Please follow up personally.' },
      { id: 'finish', kind: 'end' },
    ],
  },
  {
    id: 'flow-ai-assistant', category: 'AI assistant', name: 'AI answers, with a person as back-up', entry_keyword: 'ask', match_type: 'exact',
    when: 'The AI answers a question from what you tell it (see the AI instruction templates), then offers a person if it did not help.',
    nodes: [
      { id: 'intro', kind: 'message', text: 'Hi! Ask me anything about [your business name]. I will do my best, and I can connect you to a person at any time.', next: 'ask' },
      { id: 'ask', kind: 'question', text: 'What would you like to know?', variable_name: 'user_question', next: 'answer' },
      { id: 'answer', kind: 'ai_reply', fallback_text: 'Let me get someone from our team to help you with that.', next: 'check' },
      { id: 'check', kind: 'buttons', body: 'Did that answer your question?', buttons: ['Yes, thanks', 'Talk to a person'],
        next: { yes_thanks: 'bye', talk_to_a_person: 'handoff' } },
      { id: 'bye', kind: 'message', text: 'Glad to help! Message us any time.', next: 'finish' },
      { id: 'handoff', kind: 'handoff', note: 'The customer asked for a person after the AI answered.' },
      { id: 'finish', kind: 'end' },
    ],
  },
];

function nodeData(spec: FlowSpec): Record<string, unknown> {
  switch (spec.kind) {
    case 'message': return { kind: 'message', text: spec.text, label: spec.text, branches: [] };
    case 'question': return { kind: 'question', text: spec.text, variable_name: spec.variable_name, label: spec.text, branches: [] };
    case 'buttons': {
      const buttons = spec.buttons.map((title) => ({ id: slugify(title), title }));
      return { kind: 'buttons', body: spec.body, buttons, label: spec.body, branches: buttons.map((b) => b.id) };
    }
    case 'list': {
      const rows = spec.rows.map((r) => ({ id: slugify(r.title), title: r.title, description: r.description || '' }));
      return { kind: 'list', body: spec.body, button_label: spec.button_label, rows, label: spec.body, branches: rows.map((r) => r.id) };
    }
    case 'ai_reply': return { kind: 'ai_reply', system_prompt: spec.system_prompt || '', fallback_text: spec.fallback_text, label: spec.system_prompt ? 'AI-generated reply' : '', branches: [] };
    case 'handoff': return { kind: 'handoff', note: spec.note, label: spec.note || 'Hand off to agent', branches: [] };
    default: return { kind: 'end', label: 'End', branches: [] };
  }
}

/** Where each node's exits lead: [handle, target] pairs. A single exit uses the handle "default", like the builder does. */
export function flowExits(spec: FlowSpec): [string, string][] {
  if (spec.kind === 'buttons' || spec.kind === 'list') return Object.entries(spec.next).map(([key, to]) => [key, to]);   // a branch's handle is its button / row ID
  if ('next' in spec && spec.next) return [['default', spec.next]];
  return [];
}

/** A template -> the {nodes, edges} the flow builder saves, laid out top to bottom. */
export function buildFlowDefinition(t: WaFlowTemplate) {
  const byId = new Map(t.nodes.map((n) => [n.id, n]));
  const depth = new Map<string, number>();
  const queue: string[] = [t.nodes[0].id];
  depth.set(t.nodes[0].id, 1);
  while (queue.length) {
    const id = queue.shift()!;
    for (const [, to] of flowExits(byId.get(id)!)) {
      if (!depth.has(to)) { depth.set(to, depth.get(id)! + 1); queue.push(to); }
    }
  }
  const perLevel = new Map<number, string[]>();
  t.nodes.forEach((n) => { const d = depth.get(n.id) ?? 1; perLevel.set(d, [...(perLevel.get(d) || []), n.id]); });

  const nodes: any[] = [{ id: 'start_1', type: 'flowNode', position: { x: 400, y: 20 }, data: { kind: 'start', label: 'Start', branches: [] } }];
  t.nodes.forEach((n) => {
    const d = depth.get(n.id) ?? 1;
    const siblings = perLevel.get(d)!;
    nodes.push({ id: n.id, type: 'flowNode', position: { x: Math.round(400 + (siblings.indexOf(n.id) - (siblings.length - 1) / 2) * 260), y: 20 + d * 150 }, data: nodeData(n) });
  });
  const edges: any[] = [{ id: `e-start_1-default-${t.nodes[0].id}`, source: 'start_1', target: t.nodes[0].id, sourceHandle: 'default' }];
  t.nodes.forEach((n) => flowExits(n).forEach(([handle, to]) => edges.push({ id: `e-${n.id}-${handle}-${to}`, source: n.id, target: to, sourceHandle: handle })));
  return { nodes, edges };
}

/** All the words a person will see in a flow, to find blanks. */
export function flowText(t: WaFlowTemplate): string {
  return t.nodes.map((n) => {
    switch (n.kind) {
      case 'message': case 'question': return n.text;
      case 'buttons': return [n.body, ...n.buttons].join(' ');
      case 'list': return [n.body, n.button_label, ...n.rows.flatMap((r) => [r.title, r.description || ''])].join(' ');
      case 'ai_reply': return [n.fallback_text, n.system_prompt || ''].join(' ');
      case 'handoff': return n.note;
      default: return '';
    }
  }).join(' ');
}

/** Blanks inside a saved flow definition (used before activating one). */
export function definitionBlanks(definition: any): string[] {
  const parts: string[] = [];
  (definition?.nodes || []).forEach((n: any) => {
    const d = n.data || {};
    parts.push(d.text || '', d.body || '', d.button_label || '', d.note || '', d.fallback_text || '', d.system_prompt || '');
    (d.buttons || []).forEach((b: any) => parts.push(b.title || ''));
    (d.rows || []).forEach((r: any) => parts.push(r.title || '', r.description || ''));
  });
  return findBlanks(parts.join(' '));
}

// ───────────── AI instructions (AI Reply step) ─────────────

export interface WaPrompt { id: string; category: string; name: string; when: string; prompt: string }

export const WA_PROMPTS: WaPrompt[] = [
  {
    id: 'prompt-sales', category: 'AI assistant', name: 'Sales assistant', when: 'Answers product and price questions and collects the details of people who want to buy.',
    prompt: 'You answer questions for [your business name] on WhatsApp.\n\nAbout us: [one or two sentences on what you sell and who it is for].\nProducts and prices: [list your main products or plans and their prices].\nOpening hours: [your hours].\n\nRules:\n- Keep replies to one to three short sentences, in a friendly, plain tone.\n- Use only the facts above. If you are not sure, or the question is not covered, say you will get a team member to help.\n- Never promise discounts, delivery dates or anything that is not listed above.\n- If someone is ready to buy or asks for a quote, ask for their name and what they need.',
  },
  {
    id: 'prompt-support', category: 'AI assistant', name: 'Support assistant', when: 'Answers common questions and passes anything else to your team.',
    prompt: 'You help customers of [your business name] on WhatsApp.\n\nWhat we do: [one or two sentences].\nCommon questions and answers: [list your five most common questions with short answers].\nSupport hours: [your hours].\n\nRules:\n- Keep replies short and kind. One to three sentences.\n- Answer only from the information above. If it is not covered, say a team member will help and stop.\n- Never ask for card numbers, passwords or OTPs.\n- If the person is upset, apologise once and offer to connect them to a person.',
  },
  {
    id: 'prompt-booking', category: 'AI assistant', name: 'Booking assistant', when: 'Helps people choose a service and a time, without confirming anything itself.',
    prompt: 'You help people book with [your business name] on WhatsApp.\n\nServices: [list your services with a short description and the usual duration].\nAvailable days and hours: [your booking hours].\n\nRules:\n- Keep replies to one to three short sentences.\n- Help the person choose a service, then ask for their name and two days and times that suit them.\n- You cannot confirm a booking yourself. Say a team member will confirm it shortly.\n- If something is not covered above, say a team member will help.',
  },
];

// ───────────── message templates for Meta (Broadcasts and Sequences) ─────────────

export interface MetaButton { type: 'QUICK_REPLY' | 'URL'; text: string; url?: string }
export interface MetaTemplate {
  id: string;
  group: string;
  name: string;
  when: string;
  meta_name: string;              // the template name to type in Meta, and later in Raptor
  category: 'MARKETING' | 'UTILITY';
  language: 'en_US';
  body: string;                   // {{1}} is the contact's first name, used by broadcasts only
  footer?: string;
  buttons?: MetaButton[];
  uses_name: boolean;             // true: the body has {{1}}, and the broadcast must be told so
  sample_name?: string;           // the example value Meta asks for when the body has {{1}}
}

export const META_GROUPS = ['Offers and news', 'Follow-ups', 'Customers'];
const STOP = 'Reply STOP to unsubscribe';

export const META_TEMPLATES: MetaTemplate[] = [
  {
    id: 'meta-special-offer', group: 'Offers and news', name: 'Special offer', when: 'Tell your contacts about an offer with a real end date.',
    meta_name: 'special_offer', category: 'MARKETING', language: 'en_US', uses_name: true, sample_name: 'Priya',
    body: 'Hi {{1}}, we have a special offer for you: [what the offer is]. It is available until [date]. Tap below to see the details, or reply to ask us anything.',
    footer: STOP, buttons: [{ type: 'URL', text: 'See the offer', url: '[link to the offer]' }],
  },
  {
    id: 'meta-new-launch', group: 'Offers and news', name: 'New product or feature', when: 'Announce something new and ask if they want to see it.',
    meta_name: 'new_launch_update', category: 'MARKETING', language: 'en_US', uses_name: true, sample_name: 'Priya',
    body: 'Hi {{1}}, we have just launched [what is new]. [One sentence on what it does for you.] Would you like to see how it works?',
    footer: STOP, buttons: [{ type: 'QUICK_REPLY', text: 'Yes, show me' }, { type: 'QUICK_REPLY', text: 'Not now' }],
  },
  {
    id: 'meta-event-invite', group: 'Offers and news', name: 'Event or webinar invitation', when: 'Invite contacts to a webinar, open day or meet-up.',
    meta_name: 'event_invitation', category: 'MARKETING', language: 'en_US', uses_name: true, sample_name: 'Priya',
    body: 'Hi {{1}}, you are invited to [event name] on [date and time]. [One sentence on what they will learn or see.] Would you like a seat?',
    footer: STOP, buttons: [{ type: 'QUICK_REPLY', text: 'Yes, save my seat' }, { type: 'QUICK_REPLY', text: 'Maybe later' }],
  },
  {
    id: 'meta-festival', group: 'Offers and news', name: 'Festival greeting', when: 'A warm seasonal message, with an optional offer.',
    meta_name: 'festival_greeting', category: 'MARKETING', language: 'en_US', uses_name: true, sample_name: 'Priya',
    body: 'Hi {{1}}, warm wishes from everyone at [your business name] on [festival or occasion]. [A short message, or a small offer if you have one.]',
    footer: STOP,
  },
  {
    id: 'meta-reengage', group: 'Follow-ups', name: 'Reconnect with a quiet contact', when: 'For people who stopped replying a while ago.',
    meta_name: 'reconnect_check_in', category: 'MARKETING', language: 'en_US', uses_name: true, sample_name: 'Priya',
    body: 'Hi {{1}}, it has been a while since we last spoke. [What has changed, or what you can offer now.] Should we pick up where we left off?',
    footer: STOP, buttons: [{ type: 'QUICK_REPLY', text: 'Yes, please' }, { type: 'QUICK_REPLY', text: 'Not right now' }],
  },
  {
    id: 'meta-quote-followup', group: 'Follow-ups', name: 'Follow up on a quote', when: 'A nudge after you sent a quote or proposal.',
    meta_name: 'quote_follow_up', category: 'MARKETING', language: 'en_US', uses_name: true, sample_name: 'Priya',
    body: 'Hi {{1}}, I wanted to check whether you had a chance to look at the quote we sent. I am happy to answer any questions or adjust it.',
    footer: STOP, buttons: [{ type: 'QUICK_REPLY', text: 'I have a question' }, { type: 'QUICK_REPLY', text: 'Let us go ahead' }],
  },
  {
    id: 'meta-thanks-contact', group: 'Customers', name: 'Thanks for getting in touch', when: 'Confirms you received their message.',
    meta_name: 'thanks_for_contacting', category: 'UTILITY', language: 'en_US', uses_name: true, sample_name: 'Priya',
    body: 'Hi {{1}}, thank you for getting in touch with [your business name]. We have received your message and a member of our team will reply shortly.',
  },
  {
    id: 'meta-feedback', group: 'Customers', name: 'Ask for feedback', when: 'A short check-in after a purchase or service.',
    meta_name: 'feedback_request', category: 'MARKETING', language: 'en_US', uses_name: true, sample_name: 'Priya',
    body: 'Hi {{1}}, thank you for choosing [your business name]. How was your experience? Your answer helps us improve.',
    footer: STOP, buttons: [{ type: 'QUICK_REPLY', text: 'Great' }, { type: 'QUICK_REPLY', text: 'It was okay' }, { type: 'QUICK_REPLY', text: 'Not good' }],
  },
  {
    id: 'meta-payment-reminder', group: 'Customers', name: 'Friendly payment reminder', when: 'A polite reminder about a payment that is due.',
    meta_name: 'payment_reminder', category: 'UTILITY', language: 'en_US', uses_name: true, sample_name: 'Priya',
    body: 'Hi {{1}}, this is a friendly reminder that a payment for [what it is for] is due. If you need a payment link or have a question, just reply and we will help.',
  },
  // — the messages that make up the sequences below: no variables, because sequences cannot fill any —
  {
    id: 'meta-enquiry-1', group: 'Follow-ups', name: 'Enquiry follow-up 1: offer a call', when: 'First message of "Follow up an enquiry".',
    meta_name: 'enquiry_followup_1', category: 'MARKETING', language: 'en_US', uses_name: false,
    body: 'Thank you for your interest in [your business name]. We would love to help with [what they asked about]. Do you have a few minutes for a quick chat this week?',
    footer: STOP, buttons: [{ type: 'QUICK_REPLY', text: 'Yes, call me' }, { type: 'QUICK_REPLY', text: 'Send me details' }],
  },
  {
    id: 'meta-enquiry-2', group: 'Follow-ups', name: 'Enquiry follow-up 2: ask what helps', when: 'Second message of "Follow up an enquiry".',
    meta_name: 'enquiry_followup_2', category: 'MARKETING', language: 'en_US', uses_name: false,
    body: 'Just checking in on your enquiry with [your business name]. If it helps, we can share pricing or some examples of our work. What would be most useful?',
    footer: STOP, buttons: [{ type: 'QUICK_REPLY', text: 'Pricing' }, { type: 'QUICK_REPLY', text: 'Examples' }, { type: 'QUICK_REPLY', text: 'Not now' }],
  },
  {
    id: 'meta-enquiry-3', group: 'Follow-ups', name: 'Enquiry follow-up 3: last note', when: 'Third message of "Follow up an enquiry".',
    meta_name: 'enquiry_followup_3', category: 'MARKETING', language: 'en_US', uses_name: false,
    body: 'This is our last note about your enquiry, so we do not clutter your chat. If you would still like to talk, just reply here and we will pick it up.',
    footer: STOP,
  },
  {
    id: 'meta-welcome-1', group: 'Customers', name: 'Welcome 1: thank you', when: 'First message of "Welcome a new customer".',
    meta_name: 'customer_welcome_1', category: 'UTILITY', language: 'en_US', uses_name: false,
    body: 'Welcome to [your business name], and thank you for choosing us. Here is how to reach us any time: reply to this chat or call [your phone number].',
  },
  {
    id: 'meta-welcome-2', group: 'Customers', name: 'Welcome 2: getting started', when: 'Second message of "Welcome a new customer".',
    meta_name: 'customer_welcome_2', category: 'UTILITY', language: 'en_US', uses_name: false,
    body: 'A quick tip to get started with [your product or service]: [the one most useful first step]. Need a hand? Just reply and we will help.',
  },
  {
    id: 'meta-welcome-3', group: 'Customers', name: 'Welcome 3: how is it going', when: 'Third message of "Welcome a new customer".',
    meta_name: 'customer_welcome_3', category: 'MARKETING', language: 'en_US', uses_name: false,
    body: 'You have had a few days with [your product or service]. How is it going so far? Tell us what is working and what is not, and we will help.',
    footer: STOP, buttons: [{ type: 'QUICK_REPLY', text: 'Going well' }, { type: 'QUICK_REPLY', text: 'I need help' }],
  },
  {
    id: 'meta-winback-1', group: 'Follow-ups', name: 'Win-back 1: checking in', when: 'First message of "Win back quiet contacts".',
    meta_name: 'winback_1', category: 'MARKETING', language: 'en_US', uses_name: false,
    body: 'It has been a while since we last spoke at [your business name]. Is [what they were interested in] still something you are looking at?',
    footer: STOP, buttons: [{ type: 'QUICK_REPLY', text: 'Yes, still interested' }, { type: 'QUICK_REPLY', text: 'Not right now' }],
  },
  {
    id: 'meta-winback-2', group: 'Follow-ups', name: 'Win-back 2: what is new', when: 'Second message of "Win back quiet contacts".',
    meta_name: 'winback_2', category: 'MARKETING', language: 'en_US', uses_name: false,
    body: 'Since we last spoke we have [one or two real updates]. We think [the most relevant one] could be useful for you. Would you like to hear more?',
    footer: STOP, buttons: [{ type: 'QUICK_REPLY', text: 'Tell me more' }, { type: 'QUICK_REPLY', text: 'No thanks' }],
  },
  {
    id: 'meta-winback-3', group: 'Follow-ups', name: 'Win-back 3: closing the loop', when: 'Third message of "Win back quiet contacts".',
    meta_name: 'winback_3', category: 'MARKETING', language: 'en_US', uses_name: false,
    body: 'We will stop messaging you now so we do not fill your chat. If things change, just reply here and we will be glad to help.',
    footer: STOP,
  },
];

export interface WaSequenceTemplate { id: string; group: string; name: string; when: string; steps: { delay_hours: number; template_id: string }[] }

export const WA_SEQUENCES: WaSequenceTemplate[] = [
  {
    id: 'wseq-enquiry', group: 'Follow-ups', name: 'Follow up an enquiry (3 messages over 5 days)',
    when: 'For people who asked about you and went quiet.',
    steps: [{ delay_hours: 0, template_id: 'meta-enquiry-1' }, { delay_hours: 48, template_id: 'meta-enquiry-2' }, { delay_hours: 72, template_id: 'meta-enquiry-3' }],
  },
  {
    id: 'wseq-welcome', group: 'Customers', name: 'Welcome a new customer (3 messages over 6 days)',
    when: 'Onboard people who just became customers.',
    steps: [{ delay_hours: 0, template_id: 'meta-welcome-1' }, { delay_hours: 48, template_id: 'meta-welcome-2' }, { delay_hours: 96, template_id: 'meta-welcome-3' }],
  },
  {
    id: 'wseq-winback', group: 'Follow-ups', name: 'Win back quiet contacts (3 messages over 7 days)',
    when: 'For contacts who have not replied for a long time.',
    steps: [{ delay_hours: 0, template_id: 'meta-winback-1' }, { delay_hours: 72, template_id: 'meta-winback-2' }, { delay_hours: 96, template_id: 'meta-winback-3' }],
  },
];

export const metaById = (id: string): MetaTemplate => META_TEMPLATES.find((t) => t.id === id)!;

/** Everything shown in a message template, as the plain text to paste into WhatsApp Manager (or to read). */
export function metaTemplateText(t: MetaTemplate): string {
  const lines = [t.body];
  if (t.footer) lines.push('', `Footer: ${t.footer}`);
  if (t.buttons?.length) lines.push('', ...t.buttons.map((b) => (b.type === 'URL' ? `Button (website): ${b.text} → ${b.url}` : `Button (quick reply): ${b.text}`)));
  return lines.join('\n');
}

export function metaBlanks(t: MetaTemplate): string[] {
  return findBlanks([t.body, t.footer || '', ...(t.buttons || []).flatMap((b) => [b.text, b.url || ''])].join(' '));
}

/** The steps of a sequence template, with each step's message. */
export function sequenceSteps(t: WaSequenceTemplate) {
  return t.steps.map((s) => ({ delay_hours: s.delay_hours, template: metaById(s.template_id) }));
}

/** Blanks inside a stored keyword trigger (a database row): its reply text, buttons, list options and labels. */
export function triggerBlanks(row: any): string[] {
  const p = row?.reply_payload || {};
  return findBlanks([
    row?.reply_text || '', p.body || '', p.button_label || '',
    ...(p.buttons || []).map((b: any) => b.title || ''),
    ...(p.rows || []).flatMap((r: any) => [r.title || '', r.description || '']),
  ].join(' '));
}

/** The Meta approval steps, shown beside every message template. */
export const META_APPROVAL_STEPS = [
  'Open WhatsApp Manager (business.facebook.com, then WhatsApp Manager, then Message templates) and choose Create template.',
  'Choose the category shown on the template (Marketing or Utility) and the language English (US).',
  'Type the template name exactly as shown: lower-case letters, numbers and underscores only.',
  'Paste the message text. If it has {{1}}, add the example value shown. Add the footer and buttons exactly as listed.',
  'Submit it. Meta reviews it, usually within minutes to a day, and the status appears in WhatsApp Manager. If it is rejected, soften the wording and submit again.',
  'When it shows Approved, come back here and press Use this template: the name is filled in for you.',
];

// ───────────── what the pickers show ─────────────

const describeButtons = (r: WaReply) => (r.buttons ? r.buttons.map((b) => `[ ${b} ]`).join('  ') : '');

/** Preview text of a keyword reply: when it fires and what it says. */
export function replyDetail(r: WaReply): string {
  const when = `Replies when the message ${r.match_type === 'exact' ? 'is exactly' : 'contains'} "${r.keyword}".`;
  if (r.reply_kind === 'text') return `${when}\n\n${r.text}`;
  if (r.reply_kind === 'buttons') return `${when}\n\n${r.body}\n\n${describeButtons(r)}`;
  return `${when}\n\n${r.body}\n\nOpens with "${r.button_label}":\n${(r.rows || []).map((x) => `• ${x.title}${x.description ? ` (${x.description})` : ''}`).join('\n')}`;
}

export function replySetDetail(s: WaReplySet): string {
  return s.replies.map((r) => `— ${r.name} —\n${replyDetail(r)}`).join('\n\n');
}

/** Preview text of a flow: its steps in the order a person meets them. */
export function flowDetail(t: WaFlowTemplate): string {
  const lines = [`Starts when the message ${t.match_type === 'exact' ? 'is exactly' : 'contains'} "${t.entry_keyword}".`, ''];
  t.nodes.forEach((n) => {
    switch (n.kind) {
      case 'message': lines.push(`Message: ${n.text}`); break;
      case 'question': lines.push(`Asks: ${n.text}`); break;
      case 'buttons': lines.push(`Buttons: ${n.body}  ${n.buttons.map((b) => `[ ${b} ]`).join('  ')}`); break;
      case 'list': lines.push(`List: ${n.body}  (${n.rows.map((r) => r.title).join(', ')})`); break;
      case 'ai_reply': lines.push('AI reply: answers using your AI instructions'); break;
      case 'handoff': lines.push('Hands the conversation to your team'); break;
      default: lines.push('Ends'); break;
    }
  });
  return lines.join('\n');
}

const CATEGORY_LABEL = { MARKETING: 'Marketing', UTILITY: 'Utility' } as const;

/** Everything needed to submit one message template to Meta, in reading order. */
export function metaDetail(t: MetaTemplate): string {
  const head = [
    `Name: ${t.meta_name}`, `Category: ${CATEGORY_LABEL[t.category]}`, 'Language: English (US)',
    t.uses_name ? `Example for {{1}}: ${t.sample_name}   (a broadcast fills {{1}} with each contact's first name; tick "uses first name")` : 'No variables: this works in sequences too.',
    '',
  ];
  return [...head, 'Message:', metaTemplateText(t)].join('\n');
}

export function metaCopies(t: MetaTemplate): { label: string; text: string }[] {
  const out = [{ label: 'Copy name', text: t.meta_name }, { label: 'Copy message', text: t.body }];
  if (t.footer) out.push({ label: 'Copy footer', text: t.footer });
  return out;
}

export function sequenceDetail(t: WaSequenceTemplate): string {
  return sequenceSteps(t).map((s, i) => {
    const wait = i === 0 ? 'sent first' : `${s.delay_hours >= 24 ? `${Math.round(s.delay_hours / 24)} day(s)` : `${s.delay_hours} h`} after the previous`;
    return `Message ${i + 1} (${wait})\n${metaDetail(s.template)}`;
  }).join('\n\n');
}

export function sequenceCopies(t: WaSequenceTemplate): { label: string; text: string }[] {
  return sequenceSteps(t).flatMap((s, i) => [
    { label: `Copy name ${i + 1}`, text: s.template.meta_name },
    { label: `Copy message ${i + 1}`, text: s.template.body },
  ]);
}
