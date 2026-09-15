import { NavLink, Outlet } from 'react-router-dom';

// Same shape as CrmLayout.tsx's sub-nav tabs - this section is the
// desktop app's synced data (pipeline/DNA/dossiers/pitches/competitors),
// which previously landed in Supabase with zero webapp visibility.
export default function SyncLayout() {
  return (
    <div style={{ padding: '2rem', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <nav style={{ display: 'flex', gap: '2rem', borderBottom: '1px solid var(--border)', marginBottom: '2rem' }}>
        {[
          { name: 'Pipeline', path: '/sync/pipeline' },
          { name: 'DNA', path: '/sync/dna' },
          { name: 'Dossiers', path: '/sync/dossiers' },
          { name: 'Pitches', path: '/sync/pitches' },
          { name: 'Competitors', path: '/sync/competitors' },
        ].map((tab) => (
          <NavLink
            key={tab.name}
            to={tab.path}
            style={({ isActive }) => ({
              paddingBottom: '0.8rem',
              fontSize: '0.8rem',
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              textDecoration: 'none',
              color: isActive ? 'var(--purple)' : 'var(--dim)',
              borderBottom: isActive ? '2px solid var(--purple)' : '2px solid transparent',
              fontFamily: 'var(--mono)',
              transition: 'all 0.2s ease',
            })}
          >
            {tab.name}
          </NavLink>
        ))}
      </nav>

      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <Outlet />
      </div>
    </div>
  );
}
