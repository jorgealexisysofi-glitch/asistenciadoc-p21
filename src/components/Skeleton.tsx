interface SkeletonProps {
  className?: string
}

/** Bloque gris con pulso para estados de carga */
export function Skeleton({ className = '' }: SkeletonProps) {
  return <div className={`animate-pulse rounded-md bg-gray-200/80 ${className}`} />
}

/** Varias "cards" placeholder apiladas */
export function SkeletonCards({ count = 3 }: { count?: number }) {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="card flex items-center justify-between py-3.5">
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-2/5" />
            <Skeleton className="h-3 w-3/5" />
          </div>
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
      ))}
    </div>
  )
}

/** Grid de KPIs placeholder */
export function SkeletonKpis({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="card flex flex-col items-center gap-2 py-5">
          <Skeleton className="h-8 w-12" />
          <Skeleton className="h-3 w-20" />
        </div>
      ))}
    </div>
  )
}

/** Filas placeholder para tablas */
export function SkeletonTable({ rows = 5, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="card overflow-hidden !p-0">
      <div className="space-y-px">
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="flex items-center gap-4 px-4 py-3.5">
            {Array.from({ length: cols }).map((_, c) => (
              <Skeleton key={c} className={`h-4 ${c === 0 ? 'w-1/4' : 'flex-1'}`} />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
