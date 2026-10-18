import type { ReactNode } from 'react';
import type { Channel } from './channels';
import ConnectPanel from './ConnectPanel';
import type { Connection, ProviderInfo } from './core';
import type { HubData } from './insights';
import { note } from './ui';

export interface PageProps {
  data: HubData;
  providers: ProviderInfo[];
  reload: () => Promise<void>;
  canManage: boolean;
  goTo: (tab: string) => void;
}

/** The connections of one channel, as the full rows the screens need. */
export const connectionsOf = (data: HubData, channel: Channel): Connection[] => data.connections.filter((c) => channel.providers.includes(c.provider)) as Connection[];

// The frame every channel tab shares: the channel's name and one line about it, then ITS connections and the way to add one,
// then (once something is connected) the channel's own numbers and insights.
export function Shell({ channel, props, children, intro }: { channel: Channel; props: PageProps; children?: ReactNode; intro?: ReactNode }) {
  const conns = connectionsOf(props.data, channel);
  return (
    <div>
      <h3 style={{ margin: '4px 0 2px', fontSize: 20, color: 'var(--white)' }}>{channel.label}</h3>
      <p style={{ ...note, marginTop: 0, marginBottom: 14 }}>{channel.blurb}</p>
      <ConnectPanel channel={channel} providers={props.providers} connections={props.data.connections as Connection[]} reload={props.reload} canManage={props.canManage} intro={intro} />
      {conns.length > 0 ? children : null}
    </div>
  );
}

export const grid = (min = 360): React.CSSProperties => ({ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, ${min}px), 1fr))`, gap: 14, margin: '14px 0' });
