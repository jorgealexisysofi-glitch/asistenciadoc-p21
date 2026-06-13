export default function Spinner({ label = 'Cargando…' }: { label?: string }) {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3">
      <div
        className="h-9 w-9 animate-spin rounded-full border-4 border-udeg-naranja-light border-t-udeg-naranja"
        aria-hidden="true"
      />
      <p className="text-sm font-medium text-gray-500">{label}</p>
    </div>
  )
}
