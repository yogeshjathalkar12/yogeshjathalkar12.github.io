import { PERMISSIONS, PRESETS, type Permission } from '../../lib/team';
import { fieldLabelStyle, ghostBtnStyle } from '../crm/Modal';

export type PermissionMap = Partial<Record<Permission, boolean>>;

interface PermissionEditorProps {
  permissions: PermissionMap;
  preset: string | null;
  onChange: (permissions: PermissionMap, preset: string | null) => void;
}

// Presets are just shortcuts that pre-fill the toggles - once a toggle is
// changed by hand the preset label becomes "Custom". What's stored is always
// the individual toggles.
export default function PermissionEditor({ permissions, preset, onChange }: PermissionEditorProps) {
  const applyPreset = (name: string) => {
    const found = PRESETS.find((p) => p.name === name);
    if (!found) return;
    const next: PermissionMap = {};
    found.permissions.forEach((k) => { next[k] = true; });
    onChange(next, name);
  };

  const toggle = (key: Permission) => {
    const next = { ...permissions, [key]: !permissions[key] };
    onChange(next, 'Custom');
  };

  return (
    <div>
      <label style={fieldLabelStyle}>Start from</label>
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        {PRESETS.map((p) => (
          <button
            key={p.name}
            type="button"
            onClick={() => applyPreset(p.name)}
            style={{
              ...ghostBtnStyle, flex: 'none', padding: '0.4rem 0.8rem', fontSize: '0.6rem',
              color: preset === p.name ? '#fff' : 'var(--dim)',
              background: preset === p.name ? 'var(--grad)' : 'transparent',
            }}
          >
            {p.name}
          </button>
        ))}
        {preset === 'Custom' && <span style={{ fontSize: '0.6rem', color: 'var(--dim)', alignSelf: 'center' }}>Custom</span>}
      </div>

      <label style={fieldLabelStyle}>Permissions</label>
      {PERMISSIONS.map((p) => (
        <label key={p.key} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.6rem', padding: '0.4rem 0', cursor: 'pointer' }}>
          <input type="checkbox" checked={!!permissions[p.key]} onChange={() => toggle(p.key)} style={{ marginTop: 3 }} />
          <span>
            <span style={{ fontSize: '0.7rem', color: 'var(--white)', display: 'block' }}>{p.label}</span>
            <span style={{ fontSize: '0.58rem', color: 'var(--dim)' }}>{p.hint}</span>
          </span>
        </label>
      ))}
      <div style={{ fontSize: '0.58rem', color: 'var(--dim2)', marginTop: '0.6rem' }}>
        Importing/exporting data and managing the team are always owner-only.
      </div>
    </div>
  );
}
