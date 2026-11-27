import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { isNotInstalled } from '../lib/dbMissing';

// Is a column there yet? A part of a screen that needs a database file shows only once the file has been run. null = still asking.
// The answer "yes" is remembered for the visit; "no" is asked again next time the screen opens.
const known = new Set<string>();

export function useColumn(table: string, column: string): boolean | null {
  const id = `${table}.${column}`;
  const [there, setThere] = useState<boolean | null>(known.has(id) ? true : null);
  useEffect(() => {
    if (known.has(id)) { setThere(true); return undefined; }
    let current = true;
    Promise.resolve(supabase.from(table).select(column).limit(1)).then(({ error }) => {
      if (!error) known.add(id);
      if (current) setThere(!error ? true : isNotInstalled(error) ? false : null);
    });
    return () => { current = false; };
  }, [id, table, column]);
  return there;
}
