import { ToolLayout } from '../../layouts/ToolLayout';
import { findTool } from '../registry';

const TOOL = findTool('threader')!;

// PLACEHOLDER — not yet ported from threader.html. Chronos is the fully
// ported reference implementation (see ../chronos/ChronosTool.tsx); this
// tool follows the same pattern (ToolLayout + useAuthedFetch + HistoryTable)
// once it's migrated.
export default function ThreaderTool() {
  return (
    <ToolLayout tool={TOOL}>
      <div className="arsenal-card">
        <div className="arsenal-card-body">
          <div className="arsenal-empty">
            <div className="arsenal-empty-icon">◌</div>
            <div className="arsenal-empty-text">Not yet migrated from threader.html — coming next.</div>
          </div>
        </div>
      </div>
    </ToolLayout>
  );
}
