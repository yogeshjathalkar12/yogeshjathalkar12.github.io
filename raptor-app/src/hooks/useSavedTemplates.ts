import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { listSaved, deleteSaved, saveTemplate, updateTemplate, type SavedKind, type SavedRow } from '../lib/savedTemplates';
import type { SaveInput, SaveMode } from '../components/TemplateEditor';

// The team's saved templates of one kind. If they cannot be loaded (nothing saved yet, or the database step has not been run)
// the list is simply empty and the built-in templates work as before.
export function useSavedTemplates(kind: SavedKind) {
  const [rows, setRows] = useState<SavedRow[]>([]);
  const reload = useCallback(async () => {
    try { setRows(await listSaved(supabase, kind)); } catch { setRows([]); }
  }, [kind]);
  useEffect(() => { reload(); }, [reload]);

  // "saved:<id>" is how a saved template is named in the pickers.
  const remove = useCallback(async (pickerId: string) => {
    await deleteSaved(supabase, pickerId.replace(/^saved:/, ''));
    await reload();
  }, [reload]);

  // What the template editor calls: change a saved template in place, or save a new one (a copy of a built-in, or one written from nothing).
  const persist = useCallback(async (input: SaveInput, mode: SaveMode, savedId?: string) => {
    if (mode === 'update' && savedId) await updateTemplate(supabase, savedId, input);
    else await saveTemplate(supabase, input);
    await reload();
  }, [reload]);

  return { rows, reload, remove, persist };
}
