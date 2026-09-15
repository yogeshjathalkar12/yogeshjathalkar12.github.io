// Talks to the LOCAL desktop app's backend (raptor/api/routes_calls.py) —
// not the hosted RAPTOR_API_URL. Requires the desktop app to be running on
// this machine (mic capture only exists there) and its CORS config to
// allow this site's origin. See config.ts for RAPTOR_LOCAL_API_URL.
import { RAPTOR_CLIENT_ID, RAPTOR_LOCAL_API_URL } from './config';

export interface StartCallResult {
  status: string;
  prospect_company: string;
  contact_phone: string | null;
  contact_email: string | null;
}

export async function startCall(accessToken: string, contactId: string): Promise<StartCallResult> {
  const res = await fetch(`${RAPTOR_LOCAL_API_URL}/calls/start`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ client_id: RAPTOR_CLIENT_ID, contact_id: contactId }),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    throw new Error(detail.detail || `Could not start call (${res.status})`);
  }
  return res.json();
}

export async function endCall(accessToken: string): Promise<void> {
  const res = await fetch(`${RAPTOR_LOCAL_API_URL}/calls/${RAPTOR_CLIENT_ID}/end`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    throw new Error(detail.detail || `Could not end call (${res.status})`);
  }
}

export type CallSocketMessage = {
  type: 'call_transcript' | 'call_event' | 'call_suggestion' | 'call_summary' | 'call_ended' | string;
  text: string;
};

/** Connects to routes_websocket.py's /ws/call socket. Returns a cleanup
 * function — call it on unmount to close the connection. */
export function connectCallSocket(
  accessToken: string,
  onMessage: (msg: CallSocketMessage) => void,
  onClose?: () => void,
): () => void {
  const wsUrl = RAPTOR_LOCAL_API_URL.replace(/^http/, 'ws');
  const socket = new WebSocket(`${wsUrl}/ws/call?token=${encodeURIComponent(accessToken)}`);

  socket.onmessage = (event) => {
    try {
      onMessage(JSON.parse(event.data));
    } catch {
      // Malformed frame — ignore rather than crash the panel.
    }
  };
  socket.onclose = () => onClose?.();
  socket.onerror = () => socket.close();

  return () => socket.close();
}