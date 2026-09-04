/** Скелетон дашборда — вкладка «подгружается» визуально сразу. */
export default function DashboardLoading() {
  return (
    <div className="mx-auto max-w-7xl px-6 py-12" aria-label="Загрузка дашборда">
      <div className="skeleton h-9 w-72" />
      <div className="skeleton mt-3 h-4 w-96" />
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="glass rounded-2xl p-5">
            <div className="skeleton h-3 w-24" />
            <div className="skeleton mt-3 h-9 w-16" />
          </div>
        ))}
      </div>
      <div className="glass mt-8 space-y-0 overflow-hidden rounded-2xl">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="border-b border-white/5 px-5 py-4 last:border-0">
            <div className="skeleton h-4 w-1/3" />
            <div className="skeleton mt-2 h-3 w-1/2" />
          </div>
        ))}
      </div>
    </div>
  );
}
