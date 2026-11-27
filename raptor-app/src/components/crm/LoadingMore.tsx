// Shown while the rest of a long list is still arriving: counts and totals on the screen are not complete yet.
export default function LoadingMore({ count }: { count: number }) {
  if (!count) return null;
  return (
    <div role="status" style={{ fontSize: '0.65rem', color: 'var(--amber)', marginBottom: 8 }}>
      Showing the first {count.toLocaleString()}. Loading the rest… search, totals and export cover everything once it is done.
    </div>
  );
}
