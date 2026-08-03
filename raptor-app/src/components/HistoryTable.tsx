export interface HistoryColumn<Row> {
  header: string;
  render: (row: Row) => React.ReactNode;
}

interface HistoryTableProps<Row> {
  columns: HistoryColumn<Row>[];
  rows: Row[] | null; // null = still loading
  emptyText: string;
  keyField: (row: Row) => string | number;
}

export function HistoryTable<Row>({ columns, rows, emptyText, keyField }: HistoryTableProps<Row>) {
  if (rows === null) {
    return (
      <div className="arsenal-empty">
        <div className="arsenal-empty-text">Loading…</div>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="arsenal-empty">
        <div className="arsenal-empty-icon">◌</div>
        <div className="arsenal-empty-text">{emptyText}</div>
      </div>
    );
  }

  return (
    <table className="arsenal-table">
      <thead>
        <tr>
          {columns.map((c) => (
            <th key={c.header}>{c.header}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={keyField(row)}>
            {columns.map((c) => (
              <td key={c.header}>{c.render(row)}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
