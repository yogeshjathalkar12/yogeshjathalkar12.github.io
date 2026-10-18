// Plain-words intelligence from the signals every channel collects. No AI and no guessing: each insight is a fixed rule over real
// numbers (a change, a share, a count), so it is always explainable and can be tested. Everything here is pure: signals in, sentences out.
//
// A signal is one stored observation (see db/migrations/2026-10-18_connections.sql): a metric with a value, a mention with text
// (a comment, a review, a headline), or an event (a payment, an alert). `occurred_at` says when it happened.

export interface Sig {
  connection_id: string; provider: string; kind: string; name: string;
  value: number | null; text_value: string | null; entity: any; occurred_at: string;
}
export interface Conn {
  id: string; provider: string; label: string; status: string; last_error: string | null; last_sync_at: string | null; config?: any;
}
export type Tone = 'good' | 'warn' | 'info';
export interface Insight { tone: Tone; text: string; tab?: string }
export interface Point { day: string; value: number | null }

const DAY = 86400000;
export const NOW = () => Date.now();

// ───────────── formatting ─────────────

export const fmtNum = (n: number, digits = 0): string => new Intl.NumberFormat('en-IN', { maximumFractionDigits: digits, minimumFractionDigits: 0 }).format(digits ? n : Math.round(n));

export function fmtMoney(n: number, currency = 'INR'): string {
  try {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: n % 1 === 0 ? 0 : 2 }).format(n);
  } catch {
    return `${currency} ${fmtNum(n, 2)}`;
  }
}

export const fmtPct = (n: number, digits = 0): string => `${n > 0 ? '+' : ''}${n.toFixed(digits)}%`;

export function fmtAgo(iso: string | null | undefined, now = NOW()): string {
  if (!iso) return 'never';
  const mins = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  if (mins < 1440) return `${Math.round(mins / 60)} h ago`;
  return `${Math.round(mins / 1440)} d ago`;
}

export const plural = (n: number, one: string, many = one + 's'): string => `${fmtNum(n)} ${n === 1 ? one : many}`;

// ───────────── reading signals ─────────────

export const time = (s: Sig): number => new Date(s.occurred_at).getTime();
export const named = (sigs: Sig[], name: string): Sig[] => sigs.filter((s) => s.name === name).sort((a, b) => time(b) - time(a));

/** The newest value of a metric, or undefined. */
export function latest(sigs: Sig[], name: string): number | undefined {
  const s = named(sigs, name).find((x) => x.value !== null && x.value !== undefined);
  return s ? (s.value as number) : undefined;
}

const dayKey = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

/** One point per day for the last `days` days, ending today. Days with nothing are null. agg: 'last' (a snapshot), 'sum' (events), 'max'. */
export function dailySeries(sigs: Sig[], name: string, days: number, agg: 'last' | 'sum' | 'max' = 'last', now = NOW()): Point[] {
  const buckets: Record<string, number[]> = {};
  const rows = named(sigs, name).filter((s) => s.value !== null && s.value !== undefined).sort((a, b) => time(a) - time(b));
  rows.forEach((s) => { (buckets[dayKey(time(s))] = buckets[dayKey(time(s))] || []).push(s.value as number); });
  const out: Point[] = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const key = dayKey(now - i * DAY);
    const v = buckets[key];
    out.push({ day: key, value: !v ? null : agg === 'sum' ? v.reduce((a, b) => a + b, 0) : agg === 'max' ? Math.max(...v) : v[v.length - 1] });
  }
  return out;
}

/** Count of events (not their values) per day, for activity charts. */
export function countSeries(sigs: Sig[], name: string, days: number, now = NOW()): Point[] {
  const counts: Record<string, number> = {};
  named(sigs, name).forEach((s) => { counts[dayKey(time(s))] = (counts[dayKey(time(s))] || 0) + 1; });
  const out: Point[] = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const key = dayKey(now - i * DAY);
    out.push({ day: key, value: counts[key] || 0 });
  }
  return out;
}

export function sumWithin(sigs: Sig[], name: string, fromMs: number, toMs: number): number {
  return named(sigs, name).filter((s) => time(s) >= fromMs && time(s) < toMs).reduce((a, s) => a + (s.value || 0), 0);
}
export function countWithin(sigs: Sig[], name: string, fromMs: number, toMs: number): number {
  return named(sigs, name).filter((s) => time(s) >= fromMs && time(s) < toMs).length;
}

/** Percentage change from `before` to `now`, or null when it cannot be worked out (nothing before). */
export function change(nowValue: number | undefined, before: number | undefined): number | null {
  if (nowValue === undefined || before === undefined || before === 0) return null;
  return ((nowValue - before) / Math.abs(before)) * 100;
}

const nonNull = (points: Point[]): number[] => points.filter((p) => p.value !== null).map((p) => p.value as number);

// ───────────── buying interest ─────────────

export const BUYING = /\b(price|pricing|prices|cost|how much|quote|quotation|buy|purchase|demo|trial|interested|where can i|discount|order|contact me|call me|whatsapp me|available in)\b/i;
export const looksLikeBuying = (text: string | null | undefined): boolean => !!text && BUYING.test(text);

// ───────────── YouTube ─────────────

export interface VideoRow { id: string; title: string; views?: number; likes?: number; comments?: number }

/** The newest numbers of each recent video, best first. */
export function videoTable(sigs: Sig[]): VideoRow[] {
  const rows: Record<string, VideoRow> = {};
  const order: string[] = [];
  named(sigs, 'video_views').concat(named(sigs, 'video_likes'), named(sigs, 'video_comments')).sort((a, b) => time(b) - time(a)).forEach((s) => {
    const id = s.entity && s.entity.video_id;
    if (!id || s.value === null) return;
    if (!rows[id]) { rows[id] = { id, title: s.entity.title || id }; order.push(id); }
    const key = s.name === 'video_views' ? 'views' : s.name === 'video_likes' ? 'likes' : 'comments';
    if (rows[id][key] === undefined) rows[id][key] = s.value as number;
  });
  return order.map((id) => rows[id]).sort((a, b) => (b.views || 0) - (a.views || 0));
}

export interface CommentRow { id: string; connectionId: string; author: string; text: string; video: string; at: string; replied: boolean; buying: boolean }

/** Comments newest first, with whether each was answered from Raptor and whether it looks like buying interest. */
export function commentRows(sigs: Sig[]): CommentRow[] {
  const replied = new Set(named(sigs, 'reply_sent').map((s) => s.entity && s.entity.parent_id).filter(Boolean));
  return named(sigs, 'comment').filter((s) => !(s.entity && s.entity.mine)).map((s) => ({
    id: (s.entity && s.entity.comment_id) || '', connectionId: s.connection_id, author: (s.entity && s.entity.author) || 'Someone', text: s.text_value || '',
    video: (s.entity && s.entity.title) || '', at: s.occurred_at, replied: replied.has(s.entity && s.entity.comment_id), buying: looksLikeBuying(s.text_value),
  }));
}

export function youtubeInsights(sigs: Sig[], signedIn: boolean, now = NOW()): Insight[] {
  const out: Insight[] = [];
  const subs = nonNull(dailySeries(sigs, 'subscribers', 30, 'last', now));
  if (subs.length >= 2) {
    const d = subs[subs.length - 1] - subs[0];
    const span = dailySeries(sigs, 'subscribers', 30, 'last', now).filter((p) => p.value !== null);
    const days = Math.max(1, Math.round((new Date(span[span.length - 1].day).getTime() - new Date(span[0].day).getTime()) / DAY));
    out.push({ tone: d > 0 ? 'good' : d < 0 ? 'warn' : 'info', text: d === 0 ? `Your subscriber count has not changed in the last ${plural(days, 'day')}.` : `You ${d > 0 ? 'gained' : 'lost'} ${plural(Math.abs(d), 'subscriber')} in the last ${plural(days, 'day')}.` });
  }
  const top = videoTable(sigs)[0];
  if (top && top.views) out.push({ tone: 'info', text: `Your most-watched recent video is “${top.title}” with ${plural(top.views, 'view')}.` });
  const comments = commentRows(sigs);
  const buying = comments.filter((c) => c.buying && !c.replied);
  if (buying.length) out.push({ tone: 'warn', text: `${plural(buying.length, 'comment')} ${buying.length === 1 ? 'looks' : 'look'} like buying interest and ${buying.length === 1 ? 'has' : 'have'} no reply yet. Answer ${buying.length === 1 ? 'it' : 'them'} first.` });
  const waiting = comments.filter((c) => !c.replied).length;
  if (waiting && !buying.length) out.push({ tone: 'info', text: signedIn ? `${plural(waiting, 'comment')} ${waiting === 1 ? 'is' : 'are'} waiting for a reply.` : `${plural(waiting, 'recent comment')} to read. Sign in with Google to reply from Raptor.` });
  const rows = videoTable(sigs);
  const views = rows.reduce((a, r) => a + (r.views || 0), 0);
  const likes = rows.reduce((a, r) => a + (r.likes || 0), 0);
  if (views > 0 && likes > 0) out.push({ tone: 'info', text: `Across your recent videos, ${((likes / views) * 100).toFixed(1)}% of views turn into a like.` });
  const watch = latest(sigs, 'watch_minutes_28d');
  if (watch !== undefined) out.push({ tone: 'info', text: `Viewers watched ${fmtNum(watch / 60)} hours of your videos in the last 28 days.` });
  const gained = latest(sigs, 'subs_gained_28d');
  const lost = latest(sigs, 'subs_lost_28d');
  if (gained !== undefined && lost !== undefined) out.push({ tone: gained - lost >= 0 ? 'good' : 'warn', text: `In the last 28 days you gained ${fmtNum(gained)} and lost ${fmtNum(lost)} subscribers: ${gained - lost >= 0 ? '+' : ''}${fmtNum(gained - lost)} net.` });
  return out;
}

// ───────────── Google Analytics ─────────────

export interface TopItem { label: string; value: number }
export function topItems(sigs: Sig[], name: string): TopItem[] {
  const s = named(sigs, name)[0];
  return (s && s.entity && Array.isArray(s.entity.items) ? s.entity.items : []) as TopItem[];
}

export function analyticsInsights(sigs: Sig[], now = NOW()): Insight[] {
  const out: Insight[] = [];
  const cur = latest(sigs, 'ga_sessions_28d');
  const prev = latest(sigs, 'ga_sessions_prev28d');
  const c = change(cur, prev);
  if (c !== null) out.push({ tone: c >= 5 ? 'good' : c <= -5 ? 'warn' : 'info', text: Math.abs(c) < 5 ? `Visits are steady: ${fmtNum(cur as number)} sessions in the last 28 days (${fmtPct(c, 1)} on the 28 days before).` : `Visits ${c > 0 ? 'grew' : 'fell'} ${Math.abs(c).toFixed(0)}%: ${fmtNum(cur as number)} sessions in the last 28 days against ${fmtNum(prev as number)} before.` });
  const e = change(latest(sigs, 'ga_engagement_rate_28d'), latest(sigs, 'ga_engagement_rate_prev28d'));
  const er = latest(sigs, 'ga_engagement_rate_28d');
  if (er !== undefined) out.push({ tone: e !== null && e <= -5 ? 'warn' : 'info', text: `${(er * 100).toFixed(0)}% of sessions were engaged (stayed, scrolled or took an action)${e !== null && Math.abs(e) >= 5 ? `, ${e > 0 ? 'up' : 'down'} ${Math.abs(e).toFixed(0)}% on before` : ''}.` });
  const keys = latest(sigs, 'ga_key_events_28d');
  if (keys !== undefined && cur) {
    out.push(keys === 0 ? { tone: 'warn', text: 'No key events were recorded in the last 28 days. Mark your sign-up or enquiry as a key event in Analytics so Raptor can show what converts.' }
      : { tone: 'good', text: `${fmtNum(keys)} key events from ${fmtNum(cur)} sessions: ${((keys / cur) * 100).toFixed(1)}% of visits convert.` });
  }
  const pages = topItems(sigs, 'ga_top_pages');
  const pageTotal = pages.reduce((a, p) => a + p.value, 0);
  if (pages.length && pageTotal > 0) out.push({ tone: 'info', text: `${pages[0].label} is your most-read page: ${((pages[0].value / pageTotal) * 100).toFixed(0)}% of views among your top pages.` });
  const sources = topItems(sigs, 'ga_top_sources');
  const sourceTotal = sources.reduce((a, p) => a + p.value, 0);
  if (sources.length && sourceTotal > 0) out.push({ tone: 'info', text: `Most visitors come from ${sources[0].label} (${((sources[0].value / sourceTotal) * 100).toFixed(0)}% of your top sources).` });
  const days = named(sigs, 'ga_sessions_day');
  if (days.length >= 14) {
    const names = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const totals: number[] = Array(7).fill(0), counts: number[] = Array(7).fill(0);
    days.forEach((s) => { const d = new Date(time(s)).getUTCDay(); totals[d] += s.value || 0; counts[d] += 1; });
    const avg = totals.map((t, i) => (counts[i] ? t / counts[i] : 0));
    out.push({ tone: 'info', text: `${names[avg.indexOf(Math.max(...avg))]} is your busiest day and ${names[avg.indexOf(Math.min(...avg.filter((_, i) => counts[i] > 0)))]} your quietest.` });
  }
  void now;
  return out;
}

// ───────────── reviews ─────────────

export interface ReviewRow { author: string; stars: number; text: string; at: string; url?: string }
export function reviewRows(sigs: Sig[]): ReviewRow[] {
  return named(sigs, 'review').map((s) => ({ author: (s.entity && s.entity.author) || 'A customer', stars: Math.round(s.value || 0), text: s.text_value || '', at: s.occurred_at, url: s.entity && s.entity.maps_url }));
}

export function reviewInsights(sigs: Sig[], now = NOW()): Insight[] {
  const out: Insight[] = [];
  const rating = latest(sigs, 'rating');
  const series = dailySeries(sigs, 'rating', 60, 'last', now).filter((p) => p.value !== null);
  if (rating !== undefined) {
    const first = series.length >= 2 ? (series[0].value as number) : undefined;
    const d = first !== undefined ? rating - first : 0;
    out.push({ tone: rating >= 4.5 ? 'good' : rating < 4 ? 'warn' : 'info', text: `Your rating is ${rating.toFixed(1)} out of 5${first !== undefined && Math.abs(d) >= 0.05 ? `, ${d > 0 ? 'up' : 'down'} ${Math.abs(d).toFixed(1)} since Raptor started watching` : ''}.` });
    if (rating < 4) out.push({ tone: 'warn', text: 'A rating under 4.0 puts many customers off. Reply to the low reviews and ask happy customers to leave one.' });
  }
  const counts = dailySeries(sigs, 'review_count', 60, 'last', now).filter((p) => p.value !== null);
  if (counts.length >= 2) {
    const d = (counts[counts.length - 1].value as number) - (counts[0].value as number);
    if (d > 0) out.push({ tone: 'good', text: `You gained ${plural(d, 'new review')} since Raptor started watching.` });
  }
  const rows = reviewRows(sigs);
  const low = rows.filter((r) => r.stars <= 3 && new Date(r.at).getTime() > now - 60 * DAY);
  if (low.length) out.push({ tone: 'warn', text: `${plural(low.length, 'recent review')} ${low.length === 1 ? 'is' : 'are'} 3 stars or less. Read ${low.length === 1 ? 'it' : 'them'} and reply on Google.` });
  if (rows.length >= 3) {
    const avg = rows.slice(0, 5).reduce((a, r) => a + r.stars, 0) / Math.min(5, rows.length);
    if (rating !== undefined && Math.abs(avg - rating) >= 0.4) out.push({ tone: avg < rating ? 'warn' : 'good', text: `Your latest ${Math.min(5, rows.length)} reviews average ${avg.toFixed(1)}, ${avg < rating ? 'below' : 'above'} your overall ${rating.toFixed(1)}.` });
  }
  return out;
}

// ───────────── payments ─────────────

export interface Money { currency: string; total: number }

/** The money of a set of payment signals, grouped by currency, biggest first. */
export function byCurrency(sigs: Sig[]): Money[] {
  const t: Record<string, number> = {};
  sigs.forEach((s) => { const c = ((s.entity && s.entity.currency) || 'INR').toUpperCase(); t[c] = (t[c] || 0) + (s.value || 0); });
  return Object.entries(t).map(([currency, total]) => ({ currency, total })).sort((a, b) => b.total - a.total);
}

export function primaryCurrency(sigs: Sig[]): string {
  const counts: Record<string, number> = {};
  named(sigs, 'payment_received').forEach((s) => { const c = ((s.entity && s.entity.currency) || 'INR').toUpperCase(); counts[c] = (counts[c] || 0) + 1; });
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'INR';
}

/** Revenue in the primary currency only (mixed currencies are never added together). */
export function revenueWithin(sigs: Sig[], fromMs: number, toMs: number, currency: string, name = 'payment_received'): number {
  return named(sigs, name).filter((s) => time(s) >= fromMs && time(s) < toMs && ((s.entity && s.entity.currency) || 'INR').toUpperCase() === currency).reduce((a, s) => a + (s.value || 0), 0);
}

export function revenueSeries(sigs: Sig[], days: number, currency: string, now = NOW()): Point[] {
  return dailySeries(named(sigs, 'payment_received').filter((s) => ((s.entity && s.entity.currency) || 'INR').toUpperCase() === currency), 'payment_received', days, 'sum', now).map((p) => ({ day: p.day, value: p.value === null ? 0 : p.value }));
}

export function paymentInsights(sigs: Sig[], now = NOW()): Insight[] {
  const out: Insight[] = [];
  const paid = named(sigs, 'payment_received');
  if (!paid.length) return [{ tone: 'info', text: 'No payment has arrived yet. Make a small test payment in your payment provider and it should appear here within seconds.' }];
  const cur = primaryCurrency(sigs);
  const startOfToday = new Date(now).setUTCHours(0, 0, 0, 0);
  const d7 = revenueWithin(sigs, now - 7 * DAY, now + DAY, cur);
  const p7 = revenueWithin(sigs, now - 14 * DAY, now - 7 * DAY, cur);
  const c = change(d7, p7);
  out.push({ tone: c === null ? 'info' : c >= 5 ? 'good' : c <= -5 ? 'warn' : 'info', text: c === null ? `You took ${fmtMoney(d7, cur)} in the last 7 days.` : `You took ${fmtMoney(d7, cur)} in the last 7 days, ${c >= 0 ? 'up' : 'down'} ${Math.abs(c).toFixed(0)}% on the 7 days before (${fmtMoney(p7, cur)}).` });
  const today = revenueWithin(sigs, startOfToday, now + DAY, cur);
  if (today > 0) out.push({ tone: 'good', text: `${fmtMoney(today, cur)} came in today.` });
  const month = paid.filter((s) => time(s) > now - 30 * DAY && ((s.entity && s.entity.currency) || 'INR').toUpperCase() === cur);
  if (month.length) out.push({ tone: 'info', text: `The average payment in the last 30 days is ${fmtMoney(month.reduce((a, s) => a + (s.value || 0), 0) / month.length, cur)} across ${plural(month.length, 'payment')}.` });
  const failed = countWithin(sigs, 'payment_failed', now - 30 * DAY, now + DAY);
  const ok = countWithin(sigs, 'payment_received', now - 30 * DAY, now + DAY);
  if (failed > 0 && failed / Math.max(1, failed + ok) >= 0.1) out.push({ tone: 'warn', text: `${plural(failed, 'payment')} failed in the last 30 days (${((failed / (failed + ok)) * 100).toFixed(0)}% of attempts). Check the reasons below and follow up with those customers.` });
  else if (failed > 0) out.push({ tone: 'info', text: `${plural(failed, 'payment')} failed in the last 30 days, a small share of attempts.` });
  const refunds = revenueWithin(sigs, now - 30 * DAY, now + DAY, cur, 'refund');
  if (refunds > 0) out.push({ tone: 'warn', text: `${fmtMoney(refunds, cur)} was refunded in the last 30 days.` });
  const byEmail: Record<string, number> = {};
  month.forEach((s) => { const e = s.entity && s.entity.email; if (e) byEmail[e] = (byEmail[e] || 0) + (s.value || 0); });
  const best = Object.entries(byEmail).sort((a, b) => b[1] - a[1])[0];
  if (best && Object.keys(byEmail).length > 1) out.push({ tone: 'info', text: `Your biggest customer this month is ${best[0]} with ${fmtMoney(best[1], cur)}.` });
  if (new Set(paid.map((s) => ((s.entity && s.entity.currency) || 'INR').toUpperCase())).size > 1) out.push({ tone: 'info', text: 'You receive more than one currency. Totals above use ' + cur + ' only; they are never added together.' });
  return out;
}

// ───────────── alerts, Telegram, SMS, news ─────────────

export function alertInsights(sigs: Sig[], now = NOW()): Insight[] {
  const week = named(sigs, 'alert_sent').filter((s) => time(s) > now - 7 * DAY);
  if (!week.length) return [{ tone: 'info', text: 'No alert has been sent in the last 7 days. Alerts go out when a payment arrives, a review comes in, someone shows buying interest or a connection stops working.' }];
  const kinds: Record<string, number> = {};
  week.forEach((s) => { const k = (s.entity && s.entity.event) || 'other'; kinds[k] = (kinds[k] || 0) + 1; });
  const top = Object.entries(kinds).sort((a, b) => b[1] - a[1])[0];
  return [{ tone: 'good', text: `${plural(week.length, 'alert')} sent in the last 7 days. The most common is “${EVENT_NAMES[top[0]] || top[0]}” (${top[1]}).` }];
}

export const EVENT_NAMES: Record<string, string> = {
  payment_received: 'a payment came in', payment_failed: 'a payment failed', new_review: 'a new review', low_review: 'a low review', rating_drop: 'the rating dropped',
  buying_comment: 'buying interest', new_message: 'a Telegram message', sync_error: 'a connection stopped working',
};

export function telegramInsights(sigs: Sig[], conns: Conn[], now = NOW()): Insight[] {
  const out: Insight[] = [];
  const linked = conns.some((c) => c.config && c.config.chat_id);
  if (conns.length && !linked) out.push({ tone: 'warn', text: 'Open your bot in Telegram and send it /start. Until you do, Raptor does not know where to send alerts.' });
  const msgs = named(sigs, 'telegram_message').filter((s) => time(s) > now - 7 * DAY);
  if (msgs.length) {
    const buying = msgs.filter((s) => looksLikeBuying(s.text_value)).length;
    out.push({ tone: buying ? 'warn' : 'info', text: `${plural(msgs.length, 'message')} reached your bot in the last 7 days${buying ? `, ${buying} of them showing buying interest` : ''}.` });
  } else if (linked) out.push({ tone: 'info', text: 'No one has messaged your bot in the last 7 days. Share the bot link where your customers are.' });
  return out;
}

export function smsInsights(sigs: Sig[], cap: number, now = NOW()): Insight[] {
  const sent = named(sigs, 'sms_sent');
  if (!sent.length) return [{ tone: 'info', text: 'No text message has been sent yet.' }];
  const today = sent.filter((s) => time(s) >= new Date(now).setUTCHours(0, 0, 0, 0)).length;
  const week = sent.filter((s) => time(s) > now - 7 * DAY).length;
  const out: Insight[] = [{ tone: 'info', text: `${plural(week, 'message')} sent in the last 7 days, ${today} today (the daily limit is ${cap}).` }];
  if (today >= cap * 0.8) out.push({ tone: 'warn', text: `You have used ${today} of today's ${cap} messages.` });
  return out;
}

export interface NewsRow { title: string; url: string; source: string; feed: string; at: string }
export function newsRows(sigs: Sig[]): NewsRow[] {
  return named(sigs, 'news').map((s) => ({ title: s.text_value || '', url: (s.entity && s.entity.url) || '', source: (s.entity && s.entity.source) || '', feed: (s.entity && s.entity.feed) || '', at: s.occurred_at }));
}

export function newsInsights(sigs: Sig[], now = NOW()): Insight[] {
  const rows = newsRows(sigs);
  if (!rows.length) return [{ tone: 'info', text: 'No headlines yet. New ones appear here as they are published.' }];
  const out: Insight[] = [];
  const week = rows.filter((r) => new Date(r.at).getTime() > now - 7 * DAY);
  out.push({ tone: 'info', text: `${plural(week.length, 'headline')} in the last 7 days across ${plural(new Set(rows.map((r) => r.feed)).size, 'feed')}.` });
  const today = rows.filter((r) => new Date(r.at).getTime() > now - DAY).length;
  const before = rows.filter((r) => { const t = new Date(r.at).getTime(); return t <= now - DAY && t > now - 8 * DAY; }).length / 7;
  if (today >= 3 && today > before * 2) out.push({ tone: 'warn', text: `Unusual attention: ${plural(today, 'headline')} in the last day, against about ${before.toFixed(1)} a day before. Open the feed and see what happened.` });
  const bySource: Record<string, number> = {};
  week.forEach((r) => { if (r.source) bySource[r.source] = (bySource[r.source] || 0) + 1; });
  const top = Object.entries(bySource).sort((a, b) => b[1] - a[1]).slice(0, 2);
  if (top.length) out.push({ tone: 'info', text: `Most coverage this week comes from ${top.map(([s, n]) => `${s} (${n})`).join(' and ')}.` });
  const byFeed: Record<string, number> = {};
  week.forEach((r) => { byFeed[r.feed] = (byFeed[r.feed] || 0) + 1; });
  const busiest = Object.entries(byFeed).sort((a, b) => b[1] - a[1])[0];
  if (busiest && Object.keys(byFeed).length > 1) out.push({ tone: 'info', text: `${busiest[0]} is the busiest topic this week with ${plural(busiest[1], 'headline')}.` });
  return out;
}

// ───────────── Home: the overall picture ─────────────

export interface HubData { connections: Conn[]; signals: Record<string, Sig[]> }   // signals grouped by channel key

const connsOf = (data: HubData, providers: string[]) => data.connections.filter((c) => providers.includes(c.provider));

/** What needs a person's attention across every channel, most urgent first, then the headline facts, then what to connect next. */
export function overviewInsights(data: HubData, now = NOW()): Insight[] {
  const attention: Insight[] = [];
  const highlights: Insight[] = [];
  data.connections.forEach((c) => {
    if (c.status === 'error') attention.push({ tone: 'warn', text: `${c.label || c.provider} needs attention: ${c.last_error || 'it stopped working'}`, tab: tabForProvider(c.provider) });
    else if (c.status === 'paused') attention.push({ tone: 'info', text: `${c.label || c.provider} is paused.`, tab: tabForProvider(c.provider) });
  });
  const yt = data.signals.youtube || [];
  if (connsOf(data, ['youtube_public', 'youtube_account']).length) {
    const buying = commentRows(yt).filter((c) => c.buying && !c.replied).length;
    if (buying) attention.push({ tone: 'warn', text: `${plural(buying, 'YouTube comment')} ${buying === 1 ? 'shows' : 'show'} buying interest and ${buying === 1 ? 'has' : 'have'} no reply.`, tab: 'youtube' });
    const d = youtubeInsights(yt, false, now).find((i) => /subscriber/.test(i.text));
    if (d) highlights.push({ ...d, tab: 'youtube' });
  }
  const pay = data.signals.payments || [];
  if (connsOf(data, ['razorpay', 'stripe', 'webhook']).length) {
    const failed = countWithin(pay, 'payment_failed', now - 7 * DAY, now + DAY);
    if (failed) attention.push({ tone: 'warn', text: `${plural(failed, 'payment')} failed in the last 7 days.`, tab: 'payments' });
    const p = paymentInsights(pay, now)[0];
    if (p) highlights.push({ ...p, tab: 'payments' });
  }
  const rev = data.signals.reviews || [];
  if (connsOf(data, ['google_reviews']).length) {
    const low = reviewRows(rev).filter((r) => r.stars <= 3 && new Date(r.at).getTime() > now - 60 * DAY).length;
    if (low) attention.push({ tone: 'warn', text: `${plural(low, 'recent Google review')} ${low === 1 ? 'is' : 'are'} 3 stars or less.`, tab: 'reviews' });
    const r = reviewInsights(rev, now)[0];
    if (r) highlights.push({ ...r, tab: 'reviews' });
  }
  const ga = data.signals.analytics || [];
  if (connsOf(data, ['ga4']).length) {
    const g = analyticsInsights(ga, now)[0];
    if (g) highlights.push({ ...g, tab: 'analytics' });
    if (g && g.tone === 'warn') attention.push({ ...g, tab: 'analytics' });
  }
  const tg = connsOf(data, ['telegram']);
  if (tg.length && !tg.some((c) => c.config && c.config.chat_id)) attention.push({ tone: 'warn', text: 'Send /start to your Telegram bot so Raptor knows where to send alerts.', tab: 'telegram' });
  const news = data.signals.news || [];
  if (connsOf(data, ['news_feed']).length) {
    const spike = newsInsights(news, now).find((i) => i.tone === 'warn');
    if (spike) attention.push({ ...spike, tab: 'news' });
    else highlights.push({ ...(newsInsights(news, now)[0]), tab: 'news' });
  }
  const dataChannels = connsOf(data, ['youtube_public', 'youtube_account', 'ga4', 'google_reviews', 'razorpay', 'stripe', 'webhook']).length;
  const alertChannels = connsOf(data, ['slack', 'teams', 'telegram']).length;
  if (dataChannels && !alertChannels) attention.push({ tone: 'info', text: 'Connect Slack, Teams or Telegram to hear about payments, reviews and buying interest the moment they happen.', tab: 'alerts' });
  return [...attention, ...highlights];
}

export function tabForProvider(provider: string): string {
  if (provider === 'youtube_public' || provider === 'youtube_account') return 'youtube';
  if (provider === 'ga4') return 'analytics';
  if (provider === 'google_reviews') return 'reviews';
  if (provider === 'razorpay' || provider === 'stripe' || provider === 'webhook') return 'payments';
  if (provider === 'slack' || provider === 'teams') return 'alerts';
  if (provider === 'telegram') return 'telegram';
  if (provider === 'sms_twilio') return 'sms';
  if (provider === 'news_feed') return 'news';
  return 'home';
}

export interface Activity { at: string; tab: string; label: string; text: string; tone: Tone }

/** The newest things that happened across every channel, for the Home feed. */
export function activityFeed(data: HubData, limit = 14): Activity[] {
  const out: Activity[] = [];
  const all: Record<string, Sig[]> = data.signals;
  (all.payments || []).forEach((s) => {
    if (s.name === 'payment_received') out.push({ at: s.occurred_at, tab: 'payments', label: 'Payment', text: `${fmtMoney(s.value || 0, (s.entity && s.entity.currency) || 'INR')}${s.entity && s.entity.email ? ` from ${s.entity.email}` : ''}`, tone: 'good' });
    else if (s.name === 'payment_failed') out.push({ at: s.occurred_at, tab: 'payments', label: 'Failed payment', text: fmtMoney(s.value || 0, (s.entity && s.entity.currency) || 'INR'), tone: 'warn' });
    else if (s.name === 'refund') out.push({ at: s.occurred_at, tab: 'payments', label: 'Refund', text: fmtMoney(s.value || 0, (s.entity && s.entity.currency) || 'INR'), tone: 'warn' });
    else if (s.name === 'webhook_event' || s.name === 'lead_created') out.push({ at: s.occurred_at, tab: 'payments', label: 'Webhook', text: (s.entity && s.entity.event) || 'event', tone: 'info' });
  });
  (all.reviews || []).filter((s) => s.name === 'review').forEach((s) => out.push({ at: s.occurred_at, tab: 'reviews', label: `${Math.round(s.value || 0)}★ review`, text: (s.text_value || '').slice(0, 120), tone: (s.value || 0) <= 3 ? 'warn' : 'good' }));
  (all.youtube || []).filter((s) => s.name === 'comment' && !(s.entity && s.entity.mine)).forEach((s) => out.push({ at: s.occurred_at, tab: 'youtube', label: looksLikeBuying(s.text_value) ? 'Buying interest' : 'Comment', text: `${(s.entity && s.entity.author) || 'Someone'}: ${(s.text_value || '').slice(0, 100)}`, tone: looksLikeBuying(s.text_value) ? 'warn' : 'info' }));
  (all.telegram || []).filter((s) => s.name === 'telegram_message').forEach((s) => out.push({ at: s.occurred_at, tab: 'telegram', label: 'Telegram', text: `${(s.entity && s.entity.from) || 'Someone'}: ${(s.text_value || '').slice(0, 100)}`, tone: 'info' }));
  (all.news || []).forEach((s) => out.push({ at: s.occurred_at, tab: 'news', label: 'News', text: (s.text_value || '').slice(0, 120), tone: 'info' }));
  ['alerts', 'telegram'].forEach((k) => (all[k] || []).filter((s) => s.name === 'alert_sent').forEach((s) => out.push({ at: s.occurred_at, tab: k, label: 'Alert sent', text: (s.text_value || '').slice(0, 100), tone: 'info' })));
  (all.sms || []).filter((s) => s.name === 'sms_sent').forEach((s) => out.push({ at: s.occurred_at, tab: 'sms', label: 'SMS sent', text: `to ${(s.entity && s.entity.to) || ''}`, tone: 'info' }));
  return out.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()).slice(0, limit);
}
