import type { EstadoAsistencia } from '../types'

const estilos: Record<EstadoAsistencia, string> = {
  presente: 'bg-emerald-50 text-emerald-700',
  tarde: 'bg-amber-50 text-amber-700',
  ausente: 'bg-red-50 text-red-700',
}

const etiquetas: Record<EstadoAsistencia, string> = {
  presente: 'Presente',
  tarde: 'Tarde',
  ausente: 'Ausente',
}

export default function EstadoBadge({ estado }: { estado: EstadoAsistencia }) {
  return <span className={`badge ${estilos[estado]}`}>{etiquetas[estado]}</span>
}
