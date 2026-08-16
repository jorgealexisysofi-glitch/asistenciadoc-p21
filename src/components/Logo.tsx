interface LogoProps {
  /** Alto del logo en píxeles */
  size?: number
  /** Mostrar el texto "AsistenciaDoc" junto al logo */
  withText?: boolean
}

/** Logo principal: león Preparatoria 21 (naranja UdeG) */
export default function Logo({ size = 40, withText = false }: LogoProps) {
  return (
    <div className="flex items-center gap-2.5">
      <img
        src="/logo-prepa21.svg"
        alt="Preparatoria 21"
        style={{ height: size, width: 'auto' }}
        className="shrink-0"
      />
      {withText && (
        <div className="leading-tight">
          <p className="text-base font-bold text-udeg-azul">AsistenciaDoc</p>
          <p className="text-xs font-medium text-gray-500">Preparatoria 21 · UdeG</p>
        </div>
      )}
    </div>
  )
}
