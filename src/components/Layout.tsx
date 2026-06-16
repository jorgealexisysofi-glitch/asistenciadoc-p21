import type { ReactNode } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import Logo from './Logo'
import { IconCalendar } from './icons'

const linkBase =
  'flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold transition-colors'

function navClass({ isActive }: { isActive: boolean }) {
  return `${linkBase} ${
    isActive
      ? 'bg-udeg-naranja-light text-udeg-naranja'
      : 'text-gray-600 hover:bg-gray-100'
  }`
}

export default function Layout({ children }: { children: ReactNode }) {
  const { isAdmin, signOut } = useAuth()
  const navigate = useNavigate()

  async function handleSignOut() {
    await signOut()
    navigate('/', { replace: true })
  }

  return (
    <div className="min-h-screen bg-fondo">
      <header className="sticky top-0 z-10 border-b border-gray-100 bg-white print:hidden">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <Logo size={36} withText />
          <button
            onClick={handleSignOut}
            className="rounded-lg px-3 py-2 text-sm font-semibold text-gray-500 transition-colors hover:bg-gray-100 hover:text-udeg-naranja"
          >
            Salir
          </button>
        </div>
        <nav className="mx-auto flex max-w-3xl gap-1 overflow-x-auto px-4 pb-3">
          <NavLink to="/home" className={navClass}>
            Inicio
          </NavLink>
          <NavLink to="/validar" className={navClass}>
            Validar
          </NavLink>
          <NavLink to="/mi-horario" className={navClass}>
            <IconCalendar className="h-4 w-4" />
            Mi Horario
          </NavLink>
          {isAdmin && (
            <NavLink to="/admin" className={navClass}>
              Panel admin
            </NavLink>
          )}
        </nav>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6 pb-16">{children}</main>
    </div>
  )
}
