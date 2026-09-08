import Logo from './Logo'
import { formatHora } from '../lib/asistencia'
import type { HorarioProfesor } from '../types'

const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'] as const
const HORA_INICIO = 7
const HORA_FIN = 21
const HORAS = Array.from({ length: HORA_FIN - HORA_INICIO }, (_, i) => HORA_INICIO + i)

/** 'HH:MM[:SS]' → minutos desde medianoche */
function aMinutos(hora: string): number {
  const [h, m] = hora.split(':').map(Number)
  return h * 60 + (m ?? 0)
}

interface HorarioSemanalProps {
  nombre: string
  horarios: HorarioProfesor[]
  ciclo?: string
  /** Si se pasa, cada clase es clicable y llama a esto (para abrir un detalle) */
  onClaseClick?: (clase: HorarioProfesor) => void
}

/** Rejilla semanal imprimible (Lun–Vie, 07:00–21:00) para un profesor */
export default function HorarioSemanal({
  nombre,
  horarios,
  ciclo = '2026-A',
  onClaseClick,
}: HorarioSemanalProps) {
  const clases = horarios.filter((h) => h.dia_semana >= 1 && h.dia_semana <= 5)
  const fechaImpresion = new Date().toLocaleDateString('es-MX', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  return (
    <div className="horario-print rounded-2xl border border-gray-100 bg-white p-4 shadow-sm print:border-0 print:p-0 print:shadow-none">
      {/* Encabezado (también se imprime) */}
      <div className="mb-4 flex items-center justify-between gap-4 border-b border-gray-100 pb-3">
        <div className="flex items-center gap-3">
          <Logo size={44} />
          <div>
            <p className="text-base font-bold text-udeg-azul">Preparatoria 21 · UdeG</p>
            <p className="text-sm font-semibold text-gray-700">{nombre}</p>
          </div>
        </div>
        <div className="text-right text-xs text-gray-500">
          <p className="font-semibold text-gray-700">Ciclo {ciclo}</p>
          <p>Impreso: {fechaImpresion}</p>
        </div>
      </div>

      {clases.length === 0 ? (
        <p className="py-8 text-center text-sm text-gray-500">
          No hay horarios registrados de lunes a viernes.
        </p>
      ) : (
        <div
          className="grid overflow-hidden rounded-xl border border-gray-200 text-xs"
          style={{
            gridTemplateColumns: '60px repeat(5, 1fr)',
            gridTemplateRows: `28px repeat(${HORAS.length}, minmax(38px, 1fr))`,
          }}
        >
          <div className="border-b border-r border-gray-200 bg-gray-50" />
          {DIAS.map((dia, di) => (
            <div
              key={dia}
              className="flex items-center justify-center border-b border-gray-200 bg-udeg-azul-light font-semibold text-udeg-azul"
              style={{ gridColumn: di + 2, gridRow: 1, borderRight: di < 4 ? undefined : 'none' }}
            >
              {dia}
            </div>
          ))}
          {HORAS.map((h, hi) => (
            <div
              key={h}
              className="flex items-start justify-end border-r border-t border-gray-200 bg-gray-50 px-1.5 pt-1 font-medium text-gray-400"
              style={{ gridColumn: 1, gridRow: hi + 2 }}
            >
              {String(h).padStart(2, '0')}:00
            </div>
          ))}
          {DIAS.map((_, di) =>
            HORAS.map((h, hi) => (
              <div
                key={`${di}-${h}`}
                className="border-t border-gray-100"
                style={{
                  gridColumn: di + 2,
                  gridRow: hi + 2,
                  borderRight: di < 4 ? '1px solid #f3f4f6' : 'none',
                }}
              />
            ))
          )}
          {clases.map((c) => {
            const inicioMin = aMinutos(c.hora_inicio)
            const finMin = aMinutos(c.hora_fin)
            const filaInicio = Math.max(0, Math.floor(inicioMin / 60) - HORA_INICIO) + 2
            const filaFin = Math.min(HORAS.length, Math.ceil(finMin / 60) - HORA_INICIO) + 2
            const detalle =
              c.profesor_nombre ?? [c.grupo, c.aula_nombre].filter(Boolean).join(' · ')
            const estilo = {
              gridColumn: c.dia_semana + 1,
              gridRow: `${filaInicio} / ${Math.max(filaInicio + 1, filaFin)}`,
            }
            const base =
              'm-0.5 flex flex-col justify-center overflow-hidden rounded-md bg-udeg-naranja px-1.5 py-1 text-white'
            const contenido = (
              <>
                <p className="line-clamp-2 text-[11px] font-bold leading-tight">{c.materia_nombre}</p>
                <p className="truncate text-[10px] leading-tight opacity-90">
                  {detalle || 'Aula por asignar'}
                </p>
                <p className="text-[9px] leading-tight opacity-80">
                  {formatHora(c.hora_inicio)}–{formatHora(c.hora_fin)}
                </p>
              </>
            )
            return onClaseClick ? (
              <button
                key={c.horario_id}
                type="button"
                onClick={() => onClaseClick(c)}
                style={estilo}
                className={`${base} text-left transition hover:brightness-95 active:scale-[0.98]`}
              >
                {contenido}
              </button>
            ) : (
              <div key={c.horario_id} style={estilo} className={base}>
                {contenido}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
