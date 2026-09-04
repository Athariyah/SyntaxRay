/** Скелетон страницы ревью: навигация ощущается мгновенной,
    даже пока сервер тянет файлы и замечания из БД. */
export default function ReviewLoading() {
  return (
    <div className="mx-auto max-w-[1600px] px-4 py-8 sm:px-6" aria-label="Загрузка ревью">
      <div className="glass-strong rounded-2xl p-6">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="min-w-0 flex-1 space-y-3">
            <div className="skeleton h-6 w-64" />
            <div className="skeleton h-3 w-96" />
            <div className="flex flex-wrap gap-2 pt-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="skeleton h-7 w-28" />
              ))}
            </div>
          </div>
          <div className="skeleton h-32 w-32 !rounded-full" />
        </div>
      </div>
      <div className="mt-5 grid gap-4 xl:grid-cols-[240px_minmax(0,1fr)_420px]">
        <div className="glass space-y-2 rounded-2xl p-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="skeleton h-7 w-full" />
          ))}
        </div>
        <div className="glass space-y-2 rounded-2xl p-6">
          {Array.from({ length: 16 }).map((_, i) => (
            <div key={i} className="skeleton h-3" style={{ width: `${50 + ((i * 17) % 45)}%` }} />
          ))}
        </div>
        <div className="glass space-y-3 rounded-2xl p-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="skeleton h-16 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}
