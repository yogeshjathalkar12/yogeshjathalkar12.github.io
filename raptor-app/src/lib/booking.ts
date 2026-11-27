// Meeting booking links (db/migrations/2026-11-28_l_booking.sql). The public page is ventures/raptor/book.html on the website.

export const BOOKING_PAGE = 'https://shoonyaorigins.com/ventures/raptor/book.html';

export const DAY_NAMES: [number, string][] = [[1, 'Mon'], [2, 'Tue'], [3, 'Wed'], [4, 'Thu'], [5, 'Fri'], [6, 'Sat'], [7, 'Sun']];

export interface BookingPage {
  id: string;
  token: string;
  host_id: string;
  name: string;
  title: string;
  intro: string;
  location: string;
  minutes: number;
  buffer_minutes: number;
  days: number[];
  start_time: string;
  end_time: string;
  timezone: string;
  notice_hours: number;
  days_ahead: number;
  ask_phone: boolean;
  ask_message: boolean;
  enabled: boolean;
}

export interface Booking {
  id: string;
  page_id: string | null;
  host_id: string;
  contact_id: string | null;
  title: string;
  name: string;
  email: string;
  phone: string | null;
  message: string | null;
  starts_at: string;
  ends_at: string;
  status: 'booked' | 'cancelled';
  cancelled_by: 'visitor' | 'team' | null;
}

// The numbers are kept as text while the person types.
export interface BookingDraft {
  host_id: string;
  name: string;
  title: string;
  intro: string;
  location: string;
  minutes: string;
  buffer_minutes: string;
  days: number[];
  start_time: string;
  end_time: string;
  timezone: string;
  notice_hours: string;
  days_ahead: string;
  ask_phone: boolean;
  ask_message: boolean;
  enabled: boolean;
}

export const newDraft = (hostId: string, timezone: string): BookingDraft => ({
  host_id: hostId, name: 'Intro call', title: 'Book a meeting', intro: '', location: '', minutes: '30', buffer_minutes: '0',
  days: [1, 2, 3, 4, 5], start_time: '10:00', end_time: '17:00', timezone, notice_hours: '12', days_ahead: '14',
  ask_phone: false, ask_message: true, enabled: true,
});

export const draftOfPage = (page: BookingPage): BookingDraft => ({
  host_id: page.host_id, name: page.name, title: page.title, intro: page.intro, location: page.location,
  minutes: String(page.minutes), buffer_minutes: String(page.buffer_minutes), days: [...page.days],
  start_time: page.start_time.slice(0, 5), end_time: page.end_time.slice(0, 5), timezone: page.timezone,
  notice_hours: String(page.notice_hours), days_ahead: String(page.days_ahead),
  ask_phone: page.ask_phone, ask_message: page.ask_message, enabled: page.enabled,
});

const minutesOfDay = (time: string) => { const [h, m] = time.split(':').map(Number); return h * 60 + m; };
const whole = (text: string, least: number, most: number) => /^\d+$/.test(text.trim()) && Number(text) >= least && Number(text) <= most;

/** What is wrong with a booking page before saving it, in plain words; null when it can be saved. */
export function bookingProblem(d: BookingDraft): string | null {
  if (!d.name.trim() || d.name.trim().length > 80) return 'Give the page a name of 1 to 80 characters (only your team sees it).';
  if (d.title.length > 120) return 'The heading can be 120 characters at most.';
  if (d.intro.length > 500) return 'The introduction can be 500 characters at most.';
  if (d.location.length > 300) return 'Where you meet can be 300 characters at most.';
  if (!whole(d.minutes, 10, 240)) return 'A meeting lasts 10 to 240 minutes.';
  if (!whole(d.buffer_minutes, 0, 120)) return 'The break between meetings is 0 to 120 minutes.';
  if (!whole(d.notice_hours, 0, 720)) return 'The notice is 0 to 720 hours.';
  if (!whole(d.days_ahead, 1, 60)) return 'People can book 1 to 60 days ahead.';
  if (!d.days.length) return 'Choose at least one day.';
  if (!/^\d\d:\d\d/.test(d.start_time) || !/^\d\d:\d\d/.test(d.end_time)) return 'Choose the start and end of your day.';
  if (minutesOfDay(d.end_time) - minutesOfDay(d.start_time) < Number(d.minutes)) return 'The day is shorter than one meeting.';
  if (!d.timezone) return 'Choose the time zone.';
  return null;
}

export const bookingRow = (d: BookingDraft) => ({
  host_id: d.host_id, name: d.name.trim(), title: d.title.trim(), intro: d.intro.trim(), location: d.location.trim(),
  minutes: Number(d.minutes), buffer_minutes: Number(d.buffer_minutes), days: [...d.days].sort((a, b) => a - b),
  start_time: d.start_time, end_time: d.end_time, timezone: d.timezone, notice_hours: Number(d.notice_hours),
  days_ahead: Number(d.days_ahead), ask_phone: d.ask_phone, ask_message: d.ask_message, enabled: d.enabled,
});

export const bookingLink = (token: string): string => `${BOOKING_PAGE}?p=${encodeURIComponent(token)}`;

/** "Mon, Tue, Wed · 10:00–17:00 · 30 minutes" */
export function summaryOf(page: BookingPage): string {
  const days = DAY_NAMES.filter(([n]) => page.days.includes(n)).map(([, label]) => label).join(', ');
  return `${days} · ${page.start_time.slice(0, 5)}–${page.end_time.slice(0, 5)} (${page.timezone}) · ${page.minutes} minutes`;
}

/** Still to come and not cancelled (soonest first), and everything else (latest first). */
export function splitBookings<B extends Pick<Booking, 'starts_at' | 'ends_at' | 'status'>>(bookings: B[], now: Date = new Date()): { upcoming: B[]; past: B[] } {
  const ahead = (b: B) => b.status === 'booked' && new Date(b.ends_at).getTime() > now.getTime();
  const at = (b: B) => new Date(b.starts_at).getTime();
  return {
    upcoming: bookings.filter(ahead).sort((a, b) => at(a) - at(b)),
    past: bookings.filter((b) => !ahead(b)).sort((a, b) => at(b) - at(a)),
  };
}
