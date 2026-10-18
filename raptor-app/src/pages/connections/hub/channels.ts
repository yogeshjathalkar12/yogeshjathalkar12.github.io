// The channels of the Connections section: one tab each, plus Home. `providers` are the connection types that belong to the tab.

export interface Channel { key: string; label: string; short: string; providers: string[]; blurb: string }

export const HOME = 'home';

export const CHANNELS: Channel[] = [
  { key: 'youtube', label: 'YouTube', short: 'YouTube', providers: ['youtube_public', 'youtube_account'], blurb: 'Your channel, your videos and what viewers say about them.' },
  { key: 'analytics', label: 'Google Analytics', short: 'Analytics', providers: ['ga4'], blurb: 'Who visits your website, what they read and where they come from.' },
  { key: 'reviews', label: 'Reviews', short: 'Reviews', providers: ['google_reviews'], blurb: 'Your Google star rating and what customers write about you.' },
  { key: 'payments', label: 'Payments & Webhooks', short: 'Payments', providers: ['razorpay', 'stripe', 'webhook'], blurb: 'Money coming in, from Razorpay, Stripe or any tool that can send a webhook.' },
  { key: 'alerts', label: 'Slack & Teams', short: 'Slack & Teams', providers: ['slack', 'teams'], blurb: 'Tell your team the moment something worth knowing happens.' },
  { key: 'telegram', label: 'Telegram', short: 'Telegram', providers: ['telegram'], blurb: 'Alerts in Telegram, and a bot people can message.' },
  { key: 'sms', label: 'SMS', short: 'SMS', providers: ['sms_twilio'], blurb: 'Send text messages from your own Twilio number.' },
  { key: 'news', label: 'News', short: 'News', providers: ['news_feed'], blurb: 'Headlines about your competitors, customers and topics.' },
];

export const channelOf = (provider: string): Channel | undefined => CHANNELS.find((c) => c.providers.includes(provider));
export const allProviders = (): string[] => CHANNELS.flatMap((c) => c.providers);
