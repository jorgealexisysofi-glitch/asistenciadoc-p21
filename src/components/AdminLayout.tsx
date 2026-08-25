import { useState, type ReactNode } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import Logo from './Logo'
import {
  IconBuilding,
  IconCalendar,
  IconChart,
  IconDownload,
  IconHome,
  IconKey,
  IconMenu,
  IconUpload,
  IconUsers,
  IconX,
} from './icons'

export interface Crumb {
  label: string
  to?: string
}

const NAV_GRUPOS = [
  {
    titulo: 'Asistencia en vivo',
    items: [
      { to: '/admin', label: 'Dashboard', icon: IconHome, end: true, monitor: true },
      { to: '/admin/tablero', label: 'Clases ahora', icon: IconCalendar, end: false, monitor: true },
    ],
  },
  {
    titulo: 'Profesores y reportes',
    items: [
      { to: '/admin/profesores', label: 'Profesores', icon: IconUsers, end: false, monitor: false },
      { to: '/admin/reportes', label: 'Reportes', icon: IconChart, end: false, monitor: true },
      { to: '/admin/reportes-pasados', label: 'Reportes pasados', icon: IconChart, end: false, monitor: true },
      { to: '/admin/bitacora', label: 'Bitácora', icon: IconChart, end: false, monitor: false },
    ],
  },
  {
    titulo: 'Horarios y grupos',
    items: [
      { to: '/admin/planeacion', label: 'Planeación', icon: IconCalendar, end: false, monitor: false },
      { to: '/admin/horarios', label: 'Importar horarios', icon: IconUpload, end: false, monitor: false },
      { to: '/admin/grupos', label: 'Grupos', icon: IconUsers, end: false, monitor: false },
      { to: '/admin/horario-por-salon', label: 'Horario por salón', icon: IconBuilding, end: false, monitor: false },
      { to: '/admin/asignar-aulas', label: 'Asignar aulas', icon: IconBuilding, end: false, monitor: false },
    ],
  },
  {
    titulo: 'Configuración',
    items: [
      { to: '/admin/aulas', label: 'Aulas / Beacons', icon: IconBuilding, end: false, monitor: false },
      { to: '/admin/dias-no-laborables', label: 'Días no laborables', icon: IconCalendar, end: false, monitor: false },
      { to: '/admin/ciclos', label: 'Respaldos', icon: IconDownload, end: false, monitor: false },
    ],
  },
]

/** Estilo de cada enlace del menú (activo / inactivo) */
const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors ${
    isActive ? 'bg-udeg-naranja-light text-udeg-naranja' : 'text-gray-600 hover:bg-gray-100'
  }`

interface AdminLayoutProps {
  /** Migas tras la raíz "Admin" (la raíz se agrega sola) */
  breadcrumb: Crumb[]
  children: ReactNode
}

export default function AdminLayout({ breadcrumb, children }: AdminLayoutProps) {
  const { profesor, user, esSesionSupabase, esMonitor, signOut } = useAuth()
  const navigate = useNavigate()
  const [abierto, setAbierto] = useState(false)

  const nombreAdmin = profesor
    ? `${profesor.nombre} ${profesor.apellidos}`
    : (user?.email ?? 'Administrador')

  async function handleSignOut() {
    await signOut()
    navigate('/', { replace: true })
  }

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-4">
        <Logo size={36} withText />
        <button
          onClick={() => setAbierto(false)}
          aria-label="Cerrar menú"
          className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 md:hidden"
        >
          <IconX />
        </button>
      </div>

      {esMonitor && (
        <div className="mx-3 mt-3 rounded-xl bg-udeg-azul-light px-3 py-2 text-center">
          <p className="text-xs font-bold text-udeg-azul">👁️ Solo lectura</p>
          <p className="text-[11px] text-udeg-azul/70">Modo monitoreo · sin edición</p>
        </div>
      )}

      <nav className="flex-1 space-y-4 px-3 py-4" aria-label="Navegación admin">
        {NAV_GRUPOS.map((grupo) => {
          const items = esMonitor ? grupo.items.filter((i) => i.monitor) : grupo.items
          if (items.length === 0) return null
          return (
            <div key={grupo.titulo}>
              <p className="px-3 pb-1 text-[11px] font-bold uppercase tracking-wider text-gray-400">
                {grupo.titulo}
              </p>
              <div className="space-y-1">
                {items.map(({ to, label, icon: Icon, end }) => (
                  <NavLink key={to} to={to} end={end} onClick={() => setAbierto(false)} className={navLinkClass}>
                    <Icon className="h-5 w-5 shrink-0" />
                    {label}
                  </NavLink>
                ))}
              </div>
            </div>
          )
        })}

        {/* Solo admins con sesión de Supabase Auth pueden cambiar su contraseña */}
        {esSesionSupabase && !esMonitor && (
          <div>
            <p className="px-3 pb-1 text-[11px] font-bold uppercase tracking-wider text-gray-400">
              Cuenta
            </p>
            <NavLink to="/admin/cambiar-password" onClick={() => setAbierto(false)} className={navLinkClass}>
              <IconKey className="h-5 w-5 shrink-0" />
              Cambiar contraseña
            </NavLink>
          </div>
        )}
      </nav>

      <div className="border-t border-gray-100 px-3 py-4">
        <p className="truncate px-3 text-xs font-semibold text-gray-400" title={nombreAdmin}>
          {nombreAdmin}
        </p>
        {!esMonitor && (
          <>
            <Link
              to="/home"
              className="mt-2 block rounded-xl px-3 py-2 text-sm font-semibold text-udeg-azul hover:bg-udeg-azul-light"
            >
              Vista profesor
            </Link>
            <a
              href="/checador"
              target="_blank"
              rel="noopener"
              className="mt-1 block rounded-xl px-3 py-2 text-sm font-semibold text-udeg-azul hover:bg-udeg-azul-light"
            >
              Punto de control ↗
            </a>
          </>
        )}
        <button
          onClick={handleSignOut}
          className="mt-1 w-full rounded-xl px-3 py-2 text-left text-sm font-semibold text-gray-600 hover:bg-gray-100 hover:text-udeg-naranja"
        >
          Cerrar sesión
        </button>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-fondo">
      {/* Barra superior móvil */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-gray-100 bg-white px-4 py-3 md:hidden">
        <button
          onClick={() => setAbierto(true)}
          aria-label="Abrir menú"
          className="rounded-lg p-2 text-gray-600 hover:bg-gray-100"
        >
          <IconMenu />
        </button>
        <Logo size={32} withText />
        <button
          onClick={handleSignOut}
          className="rounded-lg px-2 py-2 text-sm font-semibold text-gray-500 hover:text-udeg-naranja"
        >
          Salir
        </button>
      </header>

      {/* Sidebar móvil (drawer) */}
      {abierto && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setAbierto(false)}
            aria-hidden="true"
          />
          <aside className="absolute inset-y-0 left-0 w-72 max-w-[85vw] bg-white shadow-xl">
            {sidebar}
          </aside>
        </div>
      )}

      {/* Sidebar escritorio */}
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-64 border-r border-gray-100 bg-white md:block">
        {sidebar}
      </aside>

      <main className="px-4 py-6 md:ml-64 md:px-8">
        <nav aria-label="Breadcrumb" className="mb-5">
          <ol className="flex flex-wrap items-center gap-1.5 text-sm text-gray-400">
            <li>
              <Link to="/admin" className="font-semibold hover:text-udeg-naranja">
                Admin
              </Link>
            </li>
            {breadcrumb.map((c, i) => (
              <li key={i} className="flex items-center gap-1.5">
                <span aria-hidden="true">/</span>
                {c.to ? (
                  <Link to={c.to} className="font-semibold hover:text-udeg-naranja">
                    {c.label}
                  </Link>
                ) : (
                  <span className="font-semibold text-gray-700" aria-current="page">
                    {c.label}
                  </span>
                )}
              </li>
            ))}
          </ol>
        </nav>
        <div className="mx-auto max-w-5xl">{children}</div>
      </main>
    </div>
  )
}
