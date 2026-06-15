import { useCallback, useEffect, useState, type FormEvent } from 'react'
import toast from 'react-hot-toast'
import AdminLayout from '../components/AdminLayout'
import Modal from '../components/Modal'
import { SkeletonTable } from '../components/Skeleton'
import { IconChevronDown, IconKey, IconPencil, IconPlus, IconTrash } from '../components/icons'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import { formatHora } from '../lib/asistencia'
import type { Aula, Horario, Materia, Profesor, Rol } from '../types'

const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']

type Aviso = { tipo: 'ok' | 'error' | 'info'; mensaje: string } | null

interface FormProfesor {
  nombre: string
  apellidos: string
  correo: string
  numero_empleado: string
  telefono: string
}

const FORM_VACIO: FormProfesor = {
  nombre: '',
  apellidos: '',
  correo: '',
  numero_empleado: '',
  telefono: '',
}

interface FormHorario {
  materia_id: string
  aula_id: string
  dia_semana: string
  hora_inicio: string
  hora_fin: string
  semestre: string
}

const HORARIO_VACIO: FormHorario = {
  materia_id: '',
  aula_id: '',
  dia_semana: '1',
  hora_inicio: '07:00',
  hora_fin: '08:55',
  semestre: '2026-A',
}

export default function AdminProfesores() {
  const { user } = useAuth()
  const [profesores, setProfesores] = useState<Profesor[]>([])
  const [materias, setMaterias] = useState<Materia[]>([])
  const [aulas, setAulas] = useState<Aula[]>([])
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState(false)
  const [aviso, setAviso] = useState<Aviso>(null)

  // Modal de profesor (alta/edición)
  const [editando, setEditando] = useState<Profesor | 'nuevo' | null>(null)
  const [form, setForm] = useState<FormProfesor>(FORM_VACIO)

  // Modal de confirmación de reseteo de contraseña
  const [resetTarget, setResetTarget] = useState<Profesor | null>(null)

  // Modal de confirmación de cambio de rol
  const [rolTarget, setRolTarget] = useState<{ profesor: Profesor; nuevoRol: Rol } | null>(
    null
  )

  // Fila expandida con horarios
  const [expandido, setExpandido] = useState<string | null>(null)
  const [horarios, setHorarios] = useState<Record<string, Horario[]>>({})

  // Modal de horario (alta/edición)
  const [horarioModal, setHorarioModal] = useState<{
    profesorId: string
    horario: Horario | null
  } | null>(null)
  const [formHorario, setFormHorario] = useState<FormHorario>(HORARIO_VACIO)

  const cargar = useCallback(async () => {
    const [resProf, resMat, resAulas] = await Promise.all([
      supabase.from('profesores').select('*').order('apellidos', { ascending: true }),
      supabase.from('materias').select('*').order('nombre'),
      supabase.from('aulas').select('*').order('nombre'),
    ])
    if (resProf.error || resMat.error || resAulas.error) {
      setAviso({ tipo: 'error', mensaje: 'No se pudo cargar la información.' })
    } else {
      setProfesores((resProf.data ?? []) as Profesor[])
      setMaterias((resMat.data ?? []) as Materia[])
      setAulas((resAulas.data ?? []) as Aula[])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    void cargar()
  }, [cargar])

  // ---------- Horarios por profesor ----------

  const cargarHorarios = useCallback(async (profesorId: string) => {
    const { data } = await supabase
      .from('horarios')
      .select('*, materia:materias(nombre, clave), aula:aulas(nombre, edificio)')
      .eq('profesor_id', profesorId)
      .order('dia_semana')
      .order('hora_inicio')
    setHorarios((prev) => ({ ...prev, [profesorId]: (data ?? []) as Horario[] }))
  }, [])

  function toggleExpandir(profesorId: string) {
    const nuevo = expandido === profesorId ? null : profesorId
    setExpandido(nuevo)
    if (nuevo && !horarios[nuevo]) void cargarHorarios(nuevo)
  }

  // ---------- Alta / edición de profesor ----------

  function abrirNuevo() {
    setForm(FORM_VACIO)
    setEditando('nuevo')
  }

  function abrirEdicion(p: Profesor) {
    setForm({
      nombre: p.nombre,
      apellidos: p.apellidos,
      correo: p.correo,
      numero_empleado: p.numero_empleado ?? '',
      telefono: p.telefono ?? '',
    })
    setEditando(p)
  }

  async function guardarProfesor(e: FormEvent) {
    e.preventDefault()
    if (!editando) return
    setWorking(true)
    setAviso(null)

    const datos = {
      nombre: form.nombre.trim(),
      apellidos: form.apellidos.trim(),
      correo: form.correo.trim().toLowerCase(),
      numero_empleado: form.numero_empleado.trim() || null,
      telefono: form.telefono.trim() || null,
    }

    if (editando === 'nuevo') {
      // Solo se crea la ficha (user_id queda null). La cuenta de acceso de Auth
      // requiere la service role key y se genera aparte con invitar_profesores.js,
      // que también vincula el user_id por correo.
      const { error } = await supabase.from('profesores').insert(datos)
      if (error) {
        setAviso({
          tipo: 'error',
          mensaje:
            error.code === '23505'
              ? 'Ya existe un profesor con ese correo o número de empleado.'
              : 'No se pudo crear el profesor.',
        })
        toast.error('No se pudo crear el profesor.')
        setWorking(false)
        return
      }
      setAviso({
        tipo: 'info',
        mensaje:
          'Profesor agregado. Para crear su cuenta de acceso, ejecuta el script invitar_profesores.js',
      })
      toast.success('Profesor agregado. Ejecuta invitar_profesores.js para su cuenta de acceso.')
    } else {
      const { error } = await supabase
        .from('profesores')
        .update(datos)
        .eq('id', editando.id)
      if (error) {
        setAviso({ tipo: 'error', mensaje: 'No se pudo guardar los cambios.' })
        toast.error('No se pudieron guardar los cambios.')
      } else {
        setAviso({ tipo: 'ok', mensaje: 'Datos actualizados.' })
        toast.success('Datos actualizados.')
      }
    }

    setEditando(null)
    await cargar()
    setWorking(false)
  }

  async function toggleActivo(p: Profesor) {
    setWorking(true)
    const { error } = await supabase
      .from('profesores')
      .update({ activo: !p.activo })
      .eq('id', p.id)
    if (error) setAviso({ tipo: 'error', mensaje: 'No se pudo cambiar el estado.' })
    await cargar()
    setWorking(false)
  }

  async function confirmarReset() {
    if (!resetTarget?.user_id) return
    setWorking(true)
    const { data, error } = await supabase.functions.invoke('reset-profesor-password', {
      body: { profesor_id: resetTarget.id, user_id: resetTarget.user_id },
    })
    if (error || (data && data.error)) {
      toast.error('No se pudo resetear la contraseña.')
    } else {
      toast.success('Contraseña reseteada correctamente')
      await cargar()
    }
    setResetTarget(null)
    setWorking(false)
  }

  async function confirmarRol() {
    if (!rolTarget) return
    setWorking(true)
    // El rol se gobierna por profesores.admin, que is_admin() (RLS) y calcularRol()
    // (frontend) ya tratan como admin. Un admin puede actualizarlo vía la política
    // profesores_admin_all, así que no hace falta una Edge Function.
    const { error } = await supabase
      .from('profesores')
      .update({ admin: rolTarget.nuevoRol === 'admin' })
      .eq('id', rolTarget.profesor.id)
    if (error) {
      toast.error('No se pudo cambiar el rol.')
    } else {
      toast.success(
        rolTarget.nuevoRol === 'admin'
          ? 'Ahora es administrador.'
          : 'Permisos de administrador retirados.'
      )
      await cargar()
    }
    setRolTarget(null)
    setWorking(false)
  }

  // ---------- Alta / edición / borrado de horarios ----------

  function abrirHorario(profesorId: string, horario: Horario | null) {
    setFormHorario(
      horario
        ? {
            materia_id: horario.materia_id,
            aula_id: horario.aula_id,
            dia_semana: String(horario.dia_semana),
            hora_inicio: formatHora(horario.hora_inicio),
            hora_fin: formatHora(horario.hora_fin),
            semestre: horario.semestre,
          }
        : HORARIO_VACIO
    )
    setHorarioModal({ profesorId, horario })
  }

  async function guardarHorario(e: FormEvent) {
    e.preventDefault()
    if (!horarioModal) return
    setWorking(true)
    setAviso(null)

    const datos = {
      profesor_id: horarioModal.profesorId,
      materia_id: formHorario.materia_id,
      aula_id: formHorario.aula_id,
      dia_semana: Number(formHorario.dia_semana),
      hora_inicio: formHorario.hora_inicio,
      hora_fin: formHorario.hora_fin,
      semestre: formHorario.semestre.trim(),
    }

    const { error } = horarioModal.horario
      ? await supabase.from('horarios').update(datos).eq('id', horarioModal.horario.id)
      : await supabase.from('horarios').insert(datos)

    if (error) {
      setAviso({
        tipo: 'error',
        mensaje: 'No se pudo guardar el horario. Verifica que la hora fin sea mayor a la de inicio.',
      })
    } else {
      setHorarioModal(null)
      await cargarHorarios(horarioModal.profesorId)
    }
    setWorking(false)
  }

  async function eliminarHorario(h: Horario) {
    if (!window.confirm('¿Eliminar este horario? Sus registros de asistencia también se eliminarán.')) {
      return
    }
    setWorking(true)
    const { error } = await supabase.from('horarios').delete().eq('id', h.id)
    if (error) setAviso({ tipo: 'error', mensaje: 'No se pudo eliminar el horario.' })
    await cargarHorarios(h.profesor_id)
    setWorking(false)
  }

  return (
    <AdminLayout breadcrumb={[{ label: 'Profesores' }]}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Profesores</h1>
          <p className="mt-1 text-sm text-gray-500">
            Personal docente, sus cuentas y horarios. Toca una fila para ver sus horarios.
          </p>
        </div>
        <button onClick={abrirNuevo} className="btn-primary">
          <IconPlus className="h-4 w-4" />
          Agregar profesor
        </button>
      </div>

      {aviso && (
        <p
          className={`mt-4 rounded-lg px-3 py-2 text-sm font-medium ${
            aviso.tipo === 'ok'
              ? 'bg-emerald-50 text-emerald-700'
              : aviso.tipo === 'info'
                ? 'bg-amber-50 text-amber-700'
                : 'bg-red-50 text-red-700'
          }`}
          role="alert"
        >
          {aviso.mensaje}
        </p>
      )}

      {loading ? (
        <div className="mt-5">
          <SkeletonTable rows={6} cols={5} />
        </div>
      ) : (
        <div className="card mt-5 overflow-x-auto !p-0">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-xs uppercase tracking-wide text-gray-400">
                <th className="px-4 py-3 font-semibold">Nombre</th>
                <th className="px-4 py-3 font-semibold">Correo</th>
                <th className="px-4 py-3 font-semibold">No. empleado</th>
                <th className="px-4 py-3 font-semibold">Rol</th>
                <th className="px-4 py-3 font-semibold">Estado</th>
                <th className="px-4 py-3 text-right font-semibold">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {profesores.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                    No hay profesores registrados todavía.
                  </td>
                </tr>
              ) : (
                profesores.map((p) => (
                  <ProfesorFila
                    key={p.id}
                    profesor={p}
                    expandido={expandido === p.id}
                    horarios={horarios[p.id]}
                    working={working}
                    onExpandir={() => toggleExpandir(p.id)}
                    onEditar={() => abrirEdicion(p)}
                    onToggleActivo={() => void toggleActivo(p)}
                    onNuevoHorario={() => abrirHorario(p.id, null)}
                    onEditarHorario={(h) => abrirHorario(p.id, h)}
                    onEliminarHorario={(h) => void eliminarHorario(h)}
                    onResetPassword={() => setResetTarget(p)}
                    onCambiarRol={(nuevoRol) => setRolTarget({ profesor: p, nuevoRol })}
                    esUsuarioActual={p.user_id != null && p.user_id === user?.id}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal alta/edición de profesor */}
      <Modal
        open={editando !== null}
        title={editando === 'nuevo' ? 'Agregar profesor' : 'Editar profesor'}
        onClose={() => setEditando(null)}
      >
        <form onSubmit={guardarProfesor} className="flex flex-col gap-3">
          {(
            [
              ['nombre', 'Nombre(s)', 'text', true],
              ['apellidos', 'Apellidos', 'text', true],
              ['correo', 'Correo institucional', 'email', true],
              ['numero_empleado', 'Número de empleado', 'text', false],
              ['telefono', 'Teléfono', 'tel', false],
            ] as const
          ).map(([campo, etiqueta, tipo, requerido]) => (
            <div key={campo}>
              <label
                htmlFor={`f-${campo}`}
                className="mb-1 block text-sm font-semibold text-gray-700"
              >
                {etiqueta}
                {!requerido && <span className="text-gray-400"> (opcional)</span>}
              </label>
              <input
                id={`f-${campo}`}
                type={tipo}
                required={requerido}
                className="input"
                value={form[campo]}
                onChange={(e) => setForm((f) => ({ ...f, [campo]: e.target.value }))}
              />
            </div>
          ))}
          {editando === 'nuevo' && (
            <p className="rounded-lg bg-udeg-azul-light px-3 py-2 text-xs text-udeg-azul">
              Se crea solo la ficha. Para generar su cuenta de acceso, ejecuta el script{' '}
              <code>invitar_profesores.js</code> (vincula el user_id por correo).
            </p>
          )}
          <button type="submit" disabled={working} className="btn-primary mt-1">
            {working ? 'Guardando…' : 'Guardar'}
          </button>
        </form>
      </Modal>

      {/* Modal alta/edición de horario */}
      <Modal
        open={horarioModal !== null}
        title={horarioModal?.horario ? 'Editar horario' : 'Agregar horario'}
        onClose={() => setHorarioModal(null)}
      >
        <form onSubmit={guardarHorario} className="flex flex-col gap-3">
          <div>
            <label htmlFor="h-materia" className="mb-1 block text-sm font-semibold text-gray-700">
              Materia
            </label>
            <select
              id="h-materia"
              required
              className="input"
              value={formHorario.materia_id}
              onChange={(e) => setFormHorario((f) => ({ ...f, materia_id: e.target.value }))}
            >
              <option value="">Selecciona…</option>
              {materias.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nombre}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="h-aula" className="mb-1 block text-sm font-semibold text-gray-700">
              Aula
            </label>
            <select
              id="h-aula"
              required
              className="input"
              value={formHorario.aula_id}
              onChange={(e) => setFormHorario((f) => ({ ...f, aula_id: e.target.value }))}
            >
              <option value="">Selecciona…</option>
              {aulas.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nombre}
                  {a.edificio ? ` · ${a.edificio}` : ''}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="h-dia" className="mb-1 block text-sm font-semibold text-gray-700">
              Día
            </label>
            <select
              id="h-dia"
              className="input"
              value={formHorario.dia_semana}
              onChange={(e) => setFormHorario((f) => ({ ...f, dia_semana: e.target.value }))}
            >
              {DIAS.map((d, i) => (
                <option key={d} value={i + 1}>
                  {d}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="h-inicio" className="mb-1 block text-sm font-semibold text-gray-700">
                Inicio
              </label>
              <input
                id="h-inicio"
                type="time"
                required
                className="input"
                value={formHorario.hora_inicio}
                onChange={(e) => setFormHorario((f) => ({ ...f, hora_inicio: e.target.value }))}
              />
            </div>
            <div>
              <label htmlFor="h-fin" className="mb-1 block text-sm font-semibold text-gray-700">
                Fin
              </label>
              <input
                id="h-fin"
                type="time"
                required
                className="input"
                value={formHorario.hora_fin}
                onChange={(e) => setFormHorario((f) => ({ ...f, hora_fin: e.target.value }))}
              />
            </div>
          </div>
          <div>
            <label htmlFor="h-semestre" className="mb-1 block text-sm font-semibold text-gray-700">
              Semestre
            </label>
            <input
              id="h-semestre"
              type="text"
              required
              placeholder="2026-A"
              className="input"
              value={formHorario.semestre}
              onChange={(e) => setFormHorario((f) => ({ ...f, semestre: e.target.value }))}
            />
          </div>
          <button type="submit" disabled={working} className="btn-primary mt-1">
            {working ? 'Guardando…' : 'Guardar horario'}
          </button>
        </form>
      </Modal>

      {/* Modal de confirmación de reseteo de contraseña */}
      <Modal
        open={resetTarget !== null}
        title="Resetear contraseña"
        onClose={() => setResetTarget(null)}
      >
        <div className="flex flex-col gap-4">
          <div className="space-y-2 text-sm text-gray-600">
            <p className="font-semibold text-gray-800">
              ¿Resetear contraseña de {resetTarget?.nombre} {resetTarget?.apellidos}?
            </p>
            <p>
              Se restablecerá a la contraseña temporal:{' '}
              <span className="font-mono font-semibold text-udeg-naranja">Prepa21@2026</span>
            </p>
            <p>El profesor deberá cambiarla en su próximo inicio de sesión.</p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setResetTarget(null)}
              disabled={working}
              className="btn-ghost flex-1"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => void confirmarReset()}
              disabled={working}
              className="btn-primary flex-1"
            >
              {working ? 'Reseteando…' : 'Resetear'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Modal de confirmación de cambio de rol */}
      <Modal
        open={rolTarget !== null}
        title={rolTarget?.nuevoRol === 'admin' ? 'Hacer administrador' : 'Quitar administrador'}
        onClose={() => setRolTarget(null)}
      >
        <div className="flex flex-col gap-4">
          <div className="space-y-2 text-sm text-gray-600">
            {rolTarget?.nuevoRol === 'admin' ? (
              <>
                <p className="font-semibold text-gray-800">
                  ¿Convertir a {rolTarget?.profesor.nombre} {rolTarget?.profesor.apellidos} en
                  administrador?
                </p>
                <p>Tendrá acceso completo al panel de administración.</p>
              </>
            ) : (
              <>
                <p className="font-semibold text-gray-800">
                  ¿Quitar permisos de administrador a {rolTarget?.profesor.nombre}{' '}
                  {rolTarget?.profesor.apellidos}?
                </p>
                <p>Solo tendrá acceso como profesor regular.</p>
              </>
            )}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setRolTarget(null)}
              disabled={working}
              className="btn-ghost flex-1"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => void confirmarRol()}
              disabled={working}
              className="btn-primary flex-1"
            >
              {working ? 'Guardando…' : 'Confirmar'}
            </button>
          </div>
        </div>
      </Modal>
    </AdminLayout>
  )
}

// ---------- Fila de profesor (con expansión de horarios) ----------

interface FilaProps {
  profesor: Profesor
  expandido: boolean
  horarios: Horario[] | undefined
  working: boolean
  onExpandir: () => void
  onEditar: () => void
  onToggleActivo: () => void
  onNuevoHorario: () => void
  onEditarHorario: (h: Horario) => void
  onEliminarHorario: (h: Horario) => void
  onResetPassword: () => void
  onCambiarRol: (nuevoRol: Rol) => void
  /** El profesor de esta fila es el admin que está usando la app */
  esUsuarioActual: boolean
}

function ProfesorFila({
  profesor: p,
  expandido,
  horarios,
  working,
  onExpandir,
  onEditar,
  onToggleActivo,
  onNuevoHorario,
  onEditarHorario,
  onEliminarHorario,
  onResetPassword,
  onCambiarRol,
  esUsuarioActual,
}: FilaProps) {
  const esAdmin = p.admin
  return (
    <>
      <tr
        className="cursor-pointer border-b border-gray-50 transition-colors last:border-0 hover:bg-gray-50/60"
        onClick={onExpandir}
        aria-expanded={expandido}
      >
        <td className="px-4 py-3">
          <span className="flex items-center gap-2 font-semibold text-gray-800">
            <IconChevronDown
              className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${
                expandido ? 'rotate-180' : ''
              }`}
            />
            {p.apellidos}, {p.nombre}
          </span>
        </td>
        <td className="px-4 py-3 text-gray-600">{p.correo}</td>
        <td className="px-4 py-3 text-gray-600">{p.numero_empleado ?? '—'}</td>
        <td className="px-4 py-3">
          <span
            className={`badge ${
              esAdmin ? 'bg-udeg-azul-light text-udeg-azul' : 'bg-gray-100 text-gray-500'
            }`}
          >
            {esAdmin ? 'Admin' : 'Profesor'}
          </span>
        </td>
        <td className="px-4 py-3">
          <span
            className={`badge ${
              p.activo ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'
            }`}
          >
            {p.activo ? 'Activo' : 'Inactivo'}
          </span>
        </td>
        <td className="px-4 py-3">
          <div
            className="flex items-center justify-end gap-1"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={onEditar}
              aria-label={`Editar a ${p.nombre} ${p.apellidos}`}
              className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-udeg-azul-light hover:text-udeg-azul"
            >
              <IconPencil className="h-4 w-4" />
            </button>
            {p.user_id && (
              <button
                onClick={onResetPassword}
                aria-label={`Resetear contraseña de ${p.nombre} ${p.apellidos}`}
                title="Resetear contraseña"
                className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-udeg-naranja-light hover:text-udeg-naranja"
              >
                <IconKey className="h-4 w-4" />
              </button>
            )}
            {p.user_id && (
              <button
                onClick={() => onCambiarRol(esAdmin ? 'profesor' : 'admin')}
                disabled={working || esUsuarioActual}
                title={
                  esUsuarioActual
                    ? 'No puedes cambiar tu propio rol'
                    : esAdmin
                      ? 'Quitar permisos de administrador'
                      : 'Convertir en administrador'
                }
                className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-udeg-azul transition-colors hover:bg-udeg-azul-light disabled:cursor-not-allowed disabled:opacity-40"
              >
                {esAdmin ? 'Quitar Admin' : 'Hacer Admin'}
              </button>
            )}
            <button
              onClick={onToggleActivo}
              disabled={working}
              className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-gray-500 transition-colors hover:bg-gray-100 disabled:opacity-50"
            >
              {p.activo ? 'Desactivar' : 'Activar'}
            </button>
          </div>
        </td>
      </tr>

      {expandido && (
        <tr className="border-b border-gray-50 bg-fondo/60">
          <td colSpan={6} className="px-4 py-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                Horarios de {p.nombre}
              </h3>
              <button onClick={onNuevoHorario} className="btn-ghost !px-3 !py-1.5 text-xs">
                <IconPlus className="h-3.5 w-3.5" />
                Agregar horario
              </button>
            </div>

            {!horarios ? (
              <p className="mt-3 text-sm text-gray-500">Cargando horarios…</p>
            ) : horarios.length === 0 ? (
              <p className="mt-3 text-sm text-gray-500">Sin horarios asignados.</p>
            ) : (
              <ul className="mt-3 flex flex-col gap-1.5">
                {horarios.map((h) => (
                  <li
                    key={h.id}
                    className="flex items-center justify-between gap-3 rounded-xl bg-white px-3 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-gray-800">
                        {h.materia?.nombre ?? 'Materia'}
                      </p>
                      <p className="text-xs text-gray-500">
                        {DIAS[h.dia_semana - 1]} · {formatHora(h.hora_inicio)}–
                        {formatHora(h.hora_fin)} · {h.aula?.nombre ?? ''} · {h.semestre}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <button
                        onClick={() => onEditarHorario(h)}
                        aria-label="Editar horario"
                        className="rounded-lg p-2 text-gray-400 hover:bg-udeg-azul-light hover:text-udeg-azul"
                      >
                        <IconPencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => onEliminarHorario(h)}
                        disabled={working}
                        aria-label="Eliminar horario"
                        className="rounded-lg p-2 text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                      >
                        <IconTrash className="h-4 w-4" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </td>
        </tr>
      )}
    </>
  )
}
