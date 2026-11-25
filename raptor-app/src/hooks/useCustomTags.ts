import { useEffect, useState } from 'react';
import { loadFieldDefs } from '../lib/customFields';
import { customTags } from '../lib/customTags';
import type { CustomTag } from '../lib/customTags';

/** The merge tags of the organization's own custom fields (companies, people, deals). Empty while loading or when they cannot be read. */
export function useCustomTags(active = true): CustomTag[] {
  const [tags, setTags] = useState<CustomTag[]>([]);
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    Promise.all([loadFieldDefs('company'), loadFieldDefs('contact'), loadFieldDefs('deal')])
      .then((all) => { if (!cancelled) setTags(customTags(all.flat())); })
      .catch(() => { if (!cancelled) setTags([]); });
    return () => { cancelled = true; };
  }, [active]);
  return tags;
}
