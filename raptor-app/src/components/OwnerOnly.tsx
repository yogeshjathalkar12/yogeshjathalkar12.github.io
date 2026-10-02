import type { ReactNode } from 'react';
import { useOrg } from '../hooks/OrgContext';
import type { Permission } from '../lib/team';

// Renders its children only for the organization owner, or - when
// `permission` is given - for anyone holding that permission. A UI
// convenience: the database's row-level security is the real enforcement.
export default function OwnerOnly({ children, permission }: { children: ReactNode; permission?: Permission }) {
  const { isOwner, can } = useOrg();
  const allowed = permission ? can(permission) : isOwner;
  return allowed ? <>{children}</> : null;
}
