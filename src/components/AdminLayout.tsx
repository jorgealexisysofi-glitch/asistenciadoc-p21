import { useState, type ReactNode } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import Logo from './Logo'
import {
  IconBuilding,
  IconChart,
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

const NAV = [
  { to: '/admin', label: 'Dashboard', icon: IconHome, end: true },
  { to: '/admin/profesores', label: 'Profesores', icon: IconUsers, end: false },
  { to: '/admin/reportes', label: 'Reportes', icon: IconChart, end: false },
  { to: '/admin/aulas', label: 'Aulas / Beacons', icon: IconBuilding, end: false },
  { to: '/admin/horarios', label: 'Importar horarios', icon: IconUpload, end: false },
  { to: '/admin/asignar-aulas', label: 'Asignar aulas', icon: IconBuilding, end: false },
]

interface AdminLayoutProps {
  /** Migas tras la raíz "Admin" (la raíz se agrega sola) */
  breadcrumb: Crumb[]
  children: ReactNode
}

export default function AdminLayout({ breadcrumb, children }: AdminLayoutProps) {
  const { profesor, user, esSesionSupabase, signOut } = useAuth()
  const navigate = useNavigate()
  const [abierto, setAbierto] = useState(false)

  // Diagnóstico temporal: revisar en la consola del navegador si hay sesión de
  // Supabase Auth. Si esSesionSupabase es false, entraste por código + NIP (no
  // por correo + contraseña) y por eso no aparece "Cambiar contraseña".
  console.log('[AdminLayout] esSesionSupabase:', esSesionSupabase, 'user:', user?.email ?? null)

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

      <nav className="flex-1 space-y-1 px-3 py-4" aria-label="Navegación admin">
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={() => setAbierto(false)}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors ${
                isActive
                  ? 'bg-udeg-naranja-light text-udeg-naranja'
                  : 'text-gray-600 hover:bg-gray-100'
              }`
            }
          >
            <Icon className="h-5 w-5 shrink-0" />
            {label}
          </NavLink>
        ))}
        {/* Solo admins con sesión de Supabase Auth pueden cambiar su contraseña */}
        {esSesionSupabase && (
          <NavLink
            to="/admin/cambiar-password"
            onClick={() => setAbierto(false)}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors ${
                isActive
                  ? 'bg-udeg-naranja-light text-udeg-naranja'
                  : 'text-gray-600 hover:bg-gray-100'
              }`
            }
          >
            <IconKey className="h-5 w-5 shrink-0" />
            Cambiar contraseña
          </NavLink>
        )}
      </nav>

      <div className="border-t border-gray-100 px-3 py-4">
        <p className="truncate px-3 text-xs font-semibold text-gray-400" title={nombreAdmin}>
          {nombreAdmin}
        </p>
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
