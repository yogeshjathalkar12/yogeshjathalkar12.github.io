// The calendar address (db/migrations/2026-11-28_m_calendar_feed.sql; served by websites-api raptor/crm/calendar_router.py).

export const feedLink = (serverUrl: string, token: string): string => `${serverUrl.replace(/\/+$/, '')}/api/raptor/calendar/${token}.ics`;
