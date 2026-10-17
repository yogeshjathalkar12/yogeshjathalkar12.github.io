// The starter email library shown in the app, so a new person never faces an empty form.
//
// A template is plain content: a subject and a list of blocks (paragraphs, a heading, a button) that load straight into
// the visual email editor, so everything stays editable. Words in [square brackets] are blanks the person must fill in;
// the forms warn while any are left. {{first_name}}, {{last_name}} and {{company}} are the merge fields the sending
// engine already fills in, and the unsubscribe footer is added by the editor.
//
// The same library is used by the desktop app (raptor-ui/src/pages/email/emailTemplates.js, a copy of this data kept in sync
// by hand). No statistics, customer names or promises are invented in here: everything specific is a blank to fill.

export type TemplateBlock =
  | { type: 'text'; content: string }
  | { type: 'heading'; content: string }
  | { type: 'button'; label: string; url: string };

export interface EmailTemplate {
  id: string;
  category: string;
  name: string;
  when: string;            // one line: when to use it
  subject: string;
  blocks: TemplateBlock[];
  // Only for templates meant to run automatically from an event (the Triggers page).
  trigger?: { name: string; event_key: string; delay_minutes: number };
  mine?: boolean;          // true for a template the team saved (see savedTemplates.ts)
}

export interface SequenceStep { delay_hours: number; subject: string; blocks: TemplateBlock[] }
export interface SequenceTemplate {
  id: string;
  category: string;
  name: string;
  when: string;
  steps: SequenceStep[];
  mine?: boolean;
}

const SIGN_OFF: TemplateBlock = { type: 'text', content: 'Best,\n[Your name]\n[Your role], [Your company]' };
const hello: TemplateBlock = { type: 'text', content: 'Hi {{first_name}},' };

export const EMAIL_CATEGORIES = ['Cold outreach', 'Follow-ups', 'Meetings', 'Customers', 'Offers and news', 'Automatic emails'];

export const EMAIL_TEMPLATES: EmailTemplate[] = [
  // ───────────── Cold outreach ─────────────
  {
    id: 'cold-problem-led',
    category: 'Cold outreach',
    name: 'Problem-led introduction',
    when: 'A first email to someone who has the problem you solve.',
    subject: '{{company}} and [the problem you solve]',
    blocks: [
      hello,
      { type: 'text', content: 'Many [their role, e.g. sales heads] at companies like {{company}} tell us that [the problem, in their words] is eating into their week.' },
      { type: 'text', content: 'We help with this by [what you do, in one plain sentence]. [One specific, true result or example, if you have one.]' },
      { type: 'text', content: 'Is this something you are dealing with at {{company}}? If it is, I can send a short note on how it would work for you.' },
      SIGN_OFF,
    ],
  },
  {
    id: 'cold-short',
    category: 'Cold outreach',
    name: 'Short and direct',
    when: 'A very short first email for busy people.',
    subject: 'Quick question, {{first_name}}',
    blocks: [
      hello,
      { type: 'text', content: 'Who handles [the area you help with] at {{company}}?' },
      { type: 'text', content: 'We help companies [what you do, one short line]. If it is you, I would like to share how. If not, a pointer to the right person would be a big help.' },
      { type: 'text', content: 'Thank you,\n[Your name]\n[Your company]' },
    ],
  },
  {
    id: 'cold-observation',
    category: 'Cold outreach',
    name: 'Something I noticed',
    when: 'When you have looked at their company and can say one real thing about it.',
    subject: 'A thought on {{company}}',
    blocks: [
      hello,
      { type: 'text', content: 'I was looking at {{company}} and noticed [one real, specific thing about their company, e.g. a new product, hiring, a recent launch].' },
      { type: 'text', content: 'That usually means [why it matters to what you do]. We help with exactly this: [what you do, one sentence].' },
      { type: 'text', content: 'Would it be useful if I sent over [a short idea, example or checklist] for {{company}}? No call needed.' },
      SIGN_OFF,
    ],
  },
  {
    id: 'cold-referral-ask',
    category: 'Cold outreach',
    name: 'Ask for the right person',
    when: 'You are not sure who owns the decision at the company.',
    subject: 'Right person at {{company}}?',
    blocks: [
      hello,
      { type: 'text', content: 'I am trying to reach whoever is responsible for [the area, e.g. sales operations, hiring, procurement] at {{company}}.' },
      { type: 'text', content: 'We work with companies on [what you do, one sentence]. Could you point me to the right person, or forward this to them?' },
      { type: 'text', content: 'I appreciate your time.' },
      SIGN_OFF,
    ],
  },

  // ───────────── Follow-ups ─────────────
  {
    id: 'followup-gentle',
    category: 'Follow-ups',
    name: 'Gentle follow-up',
    when: 'A few days after a first email with no reply.',
    subject: 'Re: {{company}} and [the problem you solve]',
    blocks: [
      hello,
      { type: 'text', content: 'I wrote a few days ago about [the topic of your first email]. I know inboxes get busy, so I am bringing it back to the top.' },
      { type: 'text', content: 'If it is relevant, I would be glad to share more. If the timing is wrong, tell me and I will check back later.' },
      SIGN_OFF,
    ],
  },
  {
    id: 'followup-value',
    category: 'Follow-ups',
    name: 'Follow-up with something useful',
    when: 'A second or third touch where you give something instead of asking.',
    subject: 'Something that may help {{company}}',
    blocks: [
      hello,
      { type: 'text', content: 'In case it is useful: [a short guide, checklist, example or article you have], on [the topic]. It covers [what they will get from it].' },
      { type: 'button', label: '[Open the resource]', url: '' },
      { type: 'text', content: 'If you would like to talk it through for {{company}}, just reply and we can find a time.' },
      SIGN_OFF,
    ],
  },
  {
    id: 'followup-breakup',
    category: 'Follow-ups',
    name: 'Last note (closing the loop)',
    when: 'The final email of a sequence, to close politely.',
    subject: 'Should I close this, {{first_name}}?',
    blocks: [
      hello,
      { type: 'text', content: 'I have written a few times about [the topic] and have not heard back, so I will assume this is not a priority right now and stop here.' },
      { type: 'text', content: 'If that is wrong, or if someone else at {{company}} is a better person to talk to, tell me and I will pick it up. Otherwise I wish you all the best.' },
      SIGN_OFF,
    ],
  },
  {
    id: 'followup-reengage',
    category: 'Follow-ups',
    name: 'Reconnect after a quiet spell',
    when: 'Someone you spoke to a while ago who went quiet.',
    subject: 'Still on your radar, {{first_name}}?',
    blocks: [
      hello,
      { type: 'text', content: 'We spoke [when, e.g. a few months ago] about [what you discussed]. A lot may have changed since, so I wanted to check in.' },
      { type: 'text', content: 'Since then we have [one real update: a new feature, offer or result]. If [their original goal] is still on your list, I would be glad to pick up where we left off.' },
      { type: 'text', content: 'Is it worth a quick conversation?' },
      SIGN_OFF,
    ],
  },

  // ───────────── Meetings ─────────────
  {
    id: 'meeting-request',
    category: 'Meetings',
    name: 'Ask for a short call',
    when: 'You want 15 minutes after some interest or a reply.',
    subject: '15 minutes this week?',
    blocks: [
      hello,
      { type: 'text', content: 'Thank you for your interest. The quickest way to see if we can help {{company}} is a short call of about 15 minutes, where I will [what you will do on the call, e.g. ask a few questions and show how it would work for you].' },
      { type: 'text', content: 'Would [day and time option 1] or [day and time option 2] suit you? If not, send me a time that does.' },
      { type: 'button', label: '[Book a time]', url: '' },
      SIGN_OFF,
    ],
  },
  {
    id: 'meeting-confirm',
    category: 'Meetings',
    name: 'Confirm a meeting',
    when: 'Right after a time is agreed, to avoid no-shows.',
    subject: 'Confirmed: [day, date and time]',
    blocks: [
      hello,
      { type: 'text', content: 'This confirms our call on [day, date, time and time zone].' },
      { type: 'text', content: 'Join here: [meeting link or phone number]\nTo make the most of it, it would help to know [one question you want them to think about].' },
      { type: 'text', content: 'If anything changes, just reply to this email.' },
      SIGN_OFF,
    ],
  },
  {
    id: 'meeting-after-demo',
    category: 'Meetings',
    name: 'After a call or demo',
    when: 'Within a day of a call or demo, with next steps.',
    subject: 'Thank you, and next steps',
    blocks: [
      hello,
      { type: 'text', content: 'Thank you for your time today. A short recap of what we covered:' },
      { type: 'text', content: '• [What they told you they need]\n• [What you showed or suggested]\n• [Any open question]' },
      { type: 'text', content: 'The next step is [the specific next step, e.g. a proposal, a trial, a call with their team] by [date]. Does that work for you?' },
      SIGN_OFF,
    ],
  },
  {
    id: 'meeting-no-show',
    category: 'Meetings',
    name: 'Missed meeting, no blame',
    when: 'They did not turn up. Keeps the door open.',
    subject: 'We missed each other today',
    blocks: [
      hello,
      { type: 'text', content: 'We had a call planned for [time] and I think we missed each other. These things happen.' },
      { type: 'text', content: 'Would you like to pick another time? You can choose one here, or reply with what suits you.' },
      { type: 'button', label: '[Pick a new time]', url: '' },
      SIGN_OFF,
    ],
  },

  // ───────────── Customers ─────────────
  {
    id: 'customer-feedback',
    category: 'Customers',
    name: 'Ask for feedback',
    when: 'A few weeks after someone becomes a customer.',
    subject: 'How is [your product] working for you?',
    blocks: [
      hello,
      { type: 'text', content: 'You have been using [your product] for a little while now, and I would like to hear how it is going.' },
      { type: 'text', content: 'What is working well, and what would you change? A couple of lines is plenty, and I read every reply myself.' },
      SIGN_OFF,
    ],
  },
  {
    id: 'customer-review',
    category: 'Customers',
    name: 'Ask for a review or referral',
    when: 'After a happy moment with a customer.',
    subject: 'A small favour, {{first_name}}?',
    blocks: [
      hello,
      { type: 'text', content: 'I am glad things are going well with [your product]. If you have a minute, would you share your experience on [review site or platform]? It really helps other [type of customer] find us.' },
      { type: 'button', label: '[Leave a review]', url: '' },
      { type: 'text', content: 'And if you know someone who would benefit, an introduction means a lot too.' },
      SIGN_OFF,
    ],
  },

  // ───────────── Offers and news ─────────────
  {
    id: 'news-announcement',
    category: 'Offers and news',
    name: 'Product or company update',
    when: 'Tell your list about something new.',
    subject: 'New: [what is new]',
    blocks: [
      hello,
      { type: 'heading', content: '[What is new, in a few words]' },
      { type: 'text', content: '[Two or three sentences: what it is, who it is for, and why it matters.]' },
      { type: 'button', label: '[See what is new]', url: '' },
      SIGN_OFF,
    ],
  },
  {
    id: 'offer-limited',
    category: 'Offers and news',
    name: 'Offer with a deadline',
    when: 'A real offer that really ends on a date.',
    subject: '[Offer] for {{company}}, until [date]',
    blocks: [
      hello,
      { type: 'heading', content: '[The offer in a few words]' },
      { type: 'text', content: '[What they get, the price or discount, and who it is for.] This is available until [date].' },
      { type: 'button', label: '[Claim the offer]', url: '' },
      { type: 'text', content: 'Questions? Reply to this email and I will help.' },
      SIGN_OFF,
    ],
  },
  {
    id: 'event-invite',
    category: 'Offers and news',
    name: 'Invitation to an event or webinar',
    when: 'Invite people to a webinar, demo day or meet-up.',
    subject: 'You are invited: [event name], [date]',
    blocks: [
      hello,
      { type: 'text', content: 'We are hosting [event name] on [date and time], and it would be great to see you there.' },
      { type: 'text', content: 'You will learn:\n• [Takeaway 1]\n• [Takeaway 2]\n• [Takeaway 3]' },
      { type: 'button', label: '[Save my seat]', url: '' },
      SIGN_OFF,
    ],
  },

  // ───────────── Automatic emails (for triggers) ─────────────
  {
    id: 'auto-welcome',
    category: 'Automatic emails',
    name: 'Welcome a new sign-up',
    when: 'Sent automatically when someone signs up.',
    subject: 'Welcome to [your company], {{first_name}}',
    blocks: [
      hello,
      { type: 'text', content: 'Welcome, and thank you for signing up. Here is the best way to get started:' },
      { type: 'text', content: '1. [First step]\n2. [Second step]\n3. [Third step]' },
      { type: 'button', label: '[Get started]', url: '' },
      { type: 'text', content: 'Stuck anywhere? Reply to this email and a real person will help.' },
      SIGN_OFF,
    ],
    trigger: { name: 'Welcome new sign-ups', event_key: 'signup', delay_minutes: 0 },
  },
  {
    id: 'auto-purchase-thanks',
    category: 'Automatic emails',
    name: 'Thank you after a purchase',
    when: 'Sent automatically after someone buys.',
    subject: 'Thank you for your order, {{first_name}}',
    blocks: [
      hello,
      { type: 'text', content: 'Thank you for choosing [your company]. We have received your order and will [what happens next, e.g. ship it within X days / set you up shortly].' },
      { type: 'text', content: 'If you have any questions, reply to this email and we will help.' },
      SIGN_OFF,
    ],
    trigger: { name: 'Thank customers after a purchase', event_key: 'purchase', delay_minutes: 5 },
  },
  {
    id: 'auto-cart-reminder',
    category: 'Automatic emails',
    name: 'Reminder about a forgotten cart',
    when: 'Sent automatically when someone leaves without buying.',
    subject: 'You left something behind',
    blocks: [
      hello,
      { type: 'text', content: 'You left a few things in your cart. We have saved them for you in case you want to finish.' },
      { type: 'button', label: '[Return to my cart]', url: '' },
      { type: 'text', content: 'If something put you off, reply and tell us. We would like to fix it.' },
      SIGN_OFF,
    ],
    trigger: { name: 'Remind about forgotten carts', event_key: 'cart_abandoned', delay_minutes: 60 },
  },
];

export const SEQUENCE_TEMPLATES: SequenceTemplate[] = [
  {
    id: 'seq-cold-4',
    category: 'Cold outreach',
    name: 'Cold outreach, 4 emails over 2 weeks',
    when: 'The standard way to reach a new prospect without being pushy.',
    steps: [
      {
        delay_hours: 0,
        subject: '{{company}} and [the problem you solve]',
        blocks: [
          hello,
          { type: 'text', content: 'Many [their role] at companies like {{company}} tell us that [the problem, in their words] takes more time than it should.' },
          { type: 'text', content: 'We help by [what you do, in one plain sentence]. Would it be worth a short conversation?' },
          SIGN_OFF,
        ],
      },
      {
        delay_hours: 72,
        subject: 'Re: {{company}} and [the problem you solve]',
        blocks: [
          hello,
          { type: 'text', content: 'Following up on my note from a few days ago. In case it helps, here is how [a similar company or type of company] approaches this: [one real example, if you have one].' },
          { type: 'text', content: 'Happy to share how it could work for {{company}}.' },
          SIGN_OFF,
        ],
      },
      {
        delay_hours: 96,
        subject: 'Something that may help {{company}}',
        blocks: [
          hello,
          { type: 'text', content: 'Sharing something useful, no strings: [a guide, checklist or article] on [the topic].' },
          { type: 'button', label: '[Open the resource]', url: '' },
          { type: 'text', content: 'If you would like to talk it through, reply and we will find 15 minutes.' },
          SIGN_OFF,
        ],
      },
      {
        delay_hours: 168,
        subject: 'Should I close this, {{first_name}}?',
        blocks: [
          hello,
          { type: 'text', content: 'I have not heard back, so I will assume this is not a priority right now and stop writing.' },
          { type: 'text', content: 'If that is wrong, or someone else at {{company}} is the better person, tell me and I will pick it up. Otherwise, all the best.' },
          SIGN_OFF,
        ],
      },
    ],
  },
  {
    id: 'seq-after-demo',
    category: 'Meetings',
    name: 'After a demo, 4 emails over 10 days',
    when: 'Keep a warm lead moving after a call or demo.',
    steps: [
      {
        delay_hours: 0,
        subject: 'Thank you, and next steps',
        blocks: [
          hello,
          { type: 'text', content: 'Thank you for your time today. To recap: [what they need] and [what you showed or suggested].' },
          { type: 'text', content: 'The next step is [the specific next step] by [date].' },
          SIGN_OFF,
        ],
      },
      {
        delay_hours: 48,
        subject: 'The answer to your question about [topic]',
        blocks: [
          hello,
          { type: 'text', content: 'You asked about [their question]. [A clear, honest answer.] Let me know if you would like more detail.' },
          SIGN_OFF,
        ],
      },
      {
        delay_hours: 72,
        subject: 'How [a similar company] got started',
        blocks: [
          hello,
          { type: 'text', content: '[A short, true example of a customer like them: what they needed, what they did, what changed. Remove this email if you do not have one yet.]' },
          { type: 'text', content: 'I would be glad to plan something similar for {{company}}.' },
          SIGN_OFF,
        ],
      },
      {
        delay_hours: 120,
        subject: 'Where do things stand, {{first_name}}?',
        blocks: [
          hello,
          { type: 'text', content: 'I wanted to check where you are on [the decision]. Is there anything I can answer, or anyone else on your team who should see this?' },
          { type: 'text', content: 'If now is not the right time, tell me when to come back and I will.' },
          SIGN_OFF,
        ],
      },
    ],
  },
  {
    id: 'seq-reengage',
    category: 'Follow-ups',
    name: 'Win back quiet leads, 3 emails',
    when: 'For leads who went cold weeks or months ago.',
    steps: [
      {
        delay_hours: 0,
        subject: 'Still on your radar, {{first_name}}?',
        blocks: [
          hello,
          { type: 'text', content: 'We spoke about [what you discussed]. A lot may have changed, so I wanted to check in.' },
          { type: 'text', content: 'Is [their original goal] still on your list?' },
          SIGN_OFF,
        ],
      },
      {
        delay_hours: 120,
        subject: 'What is new at [your company]',
        blocks: [
          hello,
          { type: 'text', content: 'Since we last spoke we have [one or two real updates]. I think the most relevant for {{company}} is [which one and why].' },
          { type: 'button', label: '[See what is new]', url: '' },
          SIGN_OFF,
        ],
      },
      {
        delay_hours: 168,
        subject: 'Closing the loop',
        blocks: [
          hello,
          { type: 'text', content: 'I will stop here so I do not fill your inbox. If things change, just reply to this email and I will be glad to help.' },
          SIGN_OFF,
        ],
      },
    ],
  },
  {
    id: 'seq-welcome',
    category: 'Customers',
    name: 'Welcome and get started, 3 emails',
    when: 'Onboard new sign-ups or new customers.',
    steps: [
      {
        delay_hours: 0,
        subject: 'Welcome to [your company], {{first_name}}',
        blocks: [
          hello,
          { type: 'text', content: 'Welcome, and thank you for joining. The quickest way to see value: [the one first action].' },
          { type: 'button', label: '[Get started]', url: '' },
          SIGN_OFF,
        ],
      },
      {
        delay_hours: 48,
        subject: 'Three things to try first',
        blocks: [
          hello,
          { type: 'text', content: '1. [Tip one]\n2. [Tip two]\n3. [Tip three]' },
          { type: 'text', content: 'Reply with any question. A real person reads every message.' },
          SIGN_OFF,
        ],
      },
      {
        delay_hours: 120,
        subject: 'How is it going?',
        blocks: [
          hello,
          { type: 'text', content: 'You have had a few days with [your product]. What is working, and what is getting in your way? I would like to help.' },
          SIGN_OFF,
        ],
      },
    ],
  },
];

// The blanks in a template, e.g. "[Your name]". Used to warn before something is sent with a blank left in it.
const PLACEHOLDER = /\[[A-Za-z][^\]\n]{1,80}\]/g;
export function findPlaceholders(text: string): string[] {
  const plain = (text || '').replace(/<[^>]+>/g, ' ');
  return Array.from(new Set(plain.match(PLACEHOLDER) || []));
}
