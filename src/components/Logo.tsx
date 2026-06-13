interface LogoProps {
  /** Tamaño en píxeles del escudo */
  size?: number
  /** Mostrar el texto "AsistenciaDoc" junto al escudo */
  withText?: boolean
}

/** Escudo placeholder UdeG P21 en SVG */
export default function Logo({ size = 40, withText = false }: LogoProps) {
  return (
    <div className="flex items-center gap-2.5">
      <svg
        width={size}
        height={size}
        viewBox="0 0 64 64"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-label="Escudo UdeG Preparatoria 21"
        role="img"
      >
        {/* Escudo */}
        <path
          d="M32 2 L58 10 V32 C58 47 47 57.5 32 62 C17 57.5 6 47 6 32 V10 Z"
          fill="#E87722"
        />
        <path
          d="M32 8 L52 14.5 V31.5 C52 43.5 43.5 52 32 56 C20.5 52 12 43.5 12 31.5 V14.5 Z"
          fill="#FFFFFF"
        />
        <path
          d="M32 13 L47 18 V31 C47 40.5 40.5 47.5 32 51 C23.5 47.5 17 40.5 17 31 V18 Z"
          fill="#003DA5"
        />
        <text
          x="32"
          y="29"
          textAnchor="middle"
          fontFamily="Inter, sans-serif"
          fontWeight="800"
          fontSize="11"
          fill="#FFFFFF"
        >
          UdeG
        </text>
        <text
          x="32"
          y="42"
          textAnchor="middle"
          fontFamily="Inter, sans-serif"
          fontWeight="800"
          fontSize="11"
          fill="#FFFFFF"
        >
          P21
        </text>
      </svg>
      {withText && (
        <div className="leading-tight">
          <p className="text-base font-bold text-udeg-azul">AsistenciaDoc</p>
          <p className="text-xs font-medium text-gray-500">Preparatoria 21 · UdeG</p>
        </div>
      )}
    </div>
  )
}
