export default function Skeleton({ rows = 3 }) {
  return (
    <div className="space-y-4 animate-pulse" aria-busy="true" aria-label="Loading">
      <div className="h-9 w-2/3 rounded-sm2 bg-line dark:bg-dline" />
      {[0, 1].map((c) => (
        <div key={c} className="bg-card dark:bg-dcard rounded-lg2 shadow-card p-4 space-y-4">
          <div className="h-3 w-24 rounded bg-line-soft dark:bg-dline-soft" />
          {Array.from({ length: rows }, (_, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="w-7 h-7 rounded-[9px] bg-line-soft dark:bg-dline-soft" />
              <div className="h-4 flex-1 rounded bg-line-soft dark:bg-dline-soft" />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
