// A section with tabs across the top, each at its own address (Calls, Competitors).
import { NavLink, Outlet } from 'react-router-dom';

export default function TabsLayout({ tabs }: { tabs: { name: string; path: string; end?: boolean }[] }) {
  return (
    <div style={{ padding: 'clamp(0.75rem, 4vw, 2rem)', height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <nav style={{ display: 'flex', gap: '1.6rem', borderBottom: '1px solid var(--border)', marginBottom: '1.4rem', flexWrap: 'wrap' }}>
        {tabs.map((tab) => (
          <NavLink
            key={tab.path} to={tab.path} end={tab.end}
            style={({ isActive }) => ({
              paddingBottom: '0.8rem', fontSize: '0.72rem', letterSpacing: '0.1em', textTransform: 'uppercase', textDecoration: 'none', fontFamily: 'var(--mono)',
              color: isActive ? 'var(--purple)' : 'var(--dim)', borderBottom: isActive ? '2px solid var(--purple)' : '2px solid transparent',
            })}
          >
            {tab.name}
          </NavLink>
        ))}
      </nav>
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <Outlet />
      </div>
    </div>
  );
}

export const COMPETITOR_TABS = [
  { name: 'Competitors', path: '/competitors', end: true },
  { name: 'Updates', path: '/competitors/updates' },
  { name: 'Win / loss', path: '/competitors/win-loss' },
  { name: 'Settings', path: '/competitors/settings' },
];

export const CALL_TABS = [
  { name: 'All calls', path: '/calls', end: true },
  { name: 'Team', path: '/calls/team' },
  { name: 'Library', path: '/calls/library' },
  { name: 'Scorecards', path: '/calls/scorecards' },
  { name: 'Watch words', path: '/calls/watch-words' },
];
