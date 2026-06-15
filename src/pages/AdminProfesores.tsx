import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
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
  const { user, profesor: profesorActual } = useAuth()
  const [profesores, setProfesores] = useState<Profesor[]>([])
  const [materias, setMaterias] = useState<Materia[]>([])
  const [aulas, setAulas] = useState<Aula[]>([])
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState(false)
  const [aviso, setAviso] = useState<Aviso>(null)

  // Búsqueda y filtros
  const [busqueda, setBusqueda] = useState('')
  const [fEstado, setFEstado] = useState<'todos' | 'activos' | 'inactivos'>('todos')
  const [fRol, setFRol] = useState<'todos' | 'profesores' | 'admins'>('todos')

  // Modal de profesor (alta/edición)
  const [editando, setEditando] = useState<Profesor | 'nuevo' | null>(null)
  const [form, setForm] = useState<FormProfesor>(FORM_VACIO)

  // Modal de confirmación de reseteo de contraseña
  const [resetTarget, setResetTarget] = useState<Profesor | null>(null)

  // Modal de confirmación de cambio de rol
  const [rolTarget, setRolTarget] = useState<{ profesor: Profesor; nuevoRol: Rol } | null>(
    null
  )

  // Modal de confirmación de eliminación
  const [deleteTarget, setDeleteTarget] = useState<Profesor | null>(null)

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

  // ---------- Búsqueda y filtros combinados ----------

  const hayFiltros = busqueda.trim() !== '' || fEstado !== 'todos' || fRol !== 'todos'

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    return profesores.filter((p) => {
      const coincideTexto =
        q === '' ||
        `${p.nombre} ${p.apellidos}`.toLowerCase().includes(q) ||
        p.correo.toLowerCase().includes(q) ||
        (p.numero_empleado ?? '').toLowerCase().includes(q)
      const coincideEstado =
        fEstado === 'todos' ||
        (fEstado === 'activos' ? p.activo : !p.activo)
      const coincideRol =
        fRol === 'todos' || (fRol === 'admins' ? p.admin : !p.admin)
      return coincideTexto && coincideEstado && coincideRol
    })
  }, [profesores, busqueda, fEstado, fRol])

  function limpiarFiltros() {
    setBusqueda('')
    setFEstado('todos')
    setFRol('todos')
  }

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
      const correoDuplicado = 'Ya existe un profesor registrado con ese correo electrónico'

      // 1. Verificar de antemano si el correo ya está registrado
      const { data: existente, error: errBusca } = await supabase
        .from('profesores')
        .select('id')
        .eq('correo', datos.correo)
        .maybeSingle()
      if (errBusca) {
        setAviso({ tipo: 'error', mensaje: 'No se pudo verificar el correo. Intenta de nuevo.' })
        toast.error('No se pudo verificar el correo.')
        setWorking(false)
        return
      }
      if (existente) {
        setAviso({ tipo: 'error', mensaje: correoDuplicado })
        toast.error(correoDuplicado)
        setWorking(false)
        return
      }

      // 2. Insertar. Solo se crea la ficha (user_id queda null); la cuenta de Auth
      //    se genera aparte con invitar_profesores.js, que vincula el user_id.
      const { error } = await supabase.from('profesores').insert(datos)
      if (error) {
        // 3. Fallback: 23505 = violación de unicidad (correo o número de empleado),
        //    el 409 Conflict que devuelve Supabase si el registro se creó entre medias.
        const esDuplicado = error.code === '23505'
        const mensaje = esDuplicado
          ? error.message.includes('numero_empleado')
            ? 'Ya existe un profesor con ese número de empleado.'
            : correoDuplicado
          : 'No se pudo crear el profesor.'
        setAviso({ tipo: 'error', mensaje })
        toast.error(mensaje)
        setWorking(false)
        return
      }
      toast.success('Profesor creado. Su NIP inicial es 2126')
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

  async function confirmarEliminar() {
    if (!deleteTarget) return
    setWorking(true)
    const teniaCuenta = deleteTarget.user_id != null
    const { error } = await supabase.from('profesores').delete().eq('id', deleteTarget.id)
    if (error) {
      // 23503 = violación de FK (el profesor tiene registros de asistencia)
      if (error.code === '23503') {
        toast.error(
          'No se puede eliminar porque tiene registros de asistencia. Desactívalo en su lugar.'
        )
      } else {
        toast.error('No se pudo eliminar el profesor.')
      }
      setWorking(false)
      return
    }
    toast.success('Profesor eliminado correctamente')
    if (teniaCuenta) {
      setAviso({
        tipo: 'info',
        mensaje:
          'Recuerda eliminar también la cuenta en Supabase Auth → Authentication → Users.',
      })
    }
    setDeleteTarget(null)
    await cargar()
    setWorking(false)
  }

  async function confirmarReset() {
    if (!resetTarget) return
    setWorking(true)
    const { error } = await supabase
      .from('profesores')
      .update({ nip: '2126', nip_temporal: true })
      .eq('id', resetTarget.id)
    if (error) {
      toast.error('No se pudo resetear el NIP.')
    } else {
      toast.success('NIP reseteado a 2126')
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
      // Diagnóstico: el error exacto de Supabase/PostgREST (p. ej. columna inexistente)
      console.error('[set-rol] update profesores.admin falló:', error)
      toast.error(`No se pudo cambiar el rol: ${error.message}`)
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

  const editandoExistente = editando && editando !== 'nuevo' ? editando : null

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

      {/* Búsqueda y filtros */}
      <div className="card mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="lg:col-span-2">
          <label htmlFor="busqueda" className="mb-1 block text-xs font-semibold text-gray-500">
            Buscar
          </label>
          <input
            id="busqueda"
            type="search"
            placeholder="Nombre, correo o número de empleado…"
            className="input !py-2"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="f-estado" className="mb-1 block text-xs font-semibold text-gray-500">
            Estado
          </label>
          <select
            id="f-estado"
            className="input !py-2"
            value={fEstado}
            onChange={(e) => setFEstado(e.target.value as typeof fEstado)}
          >
            <option value="todos">Todos</option>
            <option value="activos">Activos</option>
            <option value="inactivos">Inactivos</option>
          </select>
        </div>
        <div>
          <label htmlFor="f-rol" className="mb-1 block text-xs font-semibold text-gray-500">
            Rol
          </label>
          <select
            id="f-rol"
            className="input !py-2"
            value={fRol}
            onChange={(e) => setFRol(e.target.value as typeof fRol)}
          >
            <option value="todos">Todos</option>
            <option value="profesores">Profesores</option>
            <option value="admins">Administradores</option>
          </select>
        </div>
      </div>

      {!loading && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-gray-500">
            Mostrando <span className="font-semibold text-gray-700">{filtrados.length}</span> de{' '}
            <span className="font-semibold text-gray-700">{profesores.length}</span> profesores
          </p>
          {hayFiltros && (
            <button
              onClick={limpiarFiltros}
              className="text-sm font-semibold text-udeg-azul hover:underline"
            >
              Limpiar filtros
            </button>
          )}
        </div>
      )}

      {loading ? (
        <div className="mt-3">
          <SkeletonTable rows={6} cols={5} />
        </div>
      ) : (
        <div className="card mt-3 overflow-x-auto !p-0">
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
              {filtrados.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                    {profesores.length === 0
                      ? 'No hay profesores registrados todavía.'
                      : 'Sin resultados para los filtros seleccionados.'}
                  </td>
                </tr>
              ) : (
                filtrados.map((p) => (
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
                    esUsuarioActual={
                      (p.user_id != null && p.user_id === user?.id) ||
                      p.id === profesorActual?.id
                    }
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
              El profesor accederá con su número de empleado y el NIP inicial{' '}
              <span className="font-mono font-semibold">2126</span>, que deberá cambiar en
              su primer ingreso.
            </p>
          )}
          <button type="submit" disabled={working} className="btn-primary mt-1">
            {working ? 'Guardando…' : 'Guardar'}
          </button>
        </form>

        {/* Eliminar profesor (solo en edición), separado y abajo a la izquierda */}
        {editandoExistente && (
          <div className="mt-4 border-t border-gray-100 pt-3">
            <button
              type="button"
              onClick={() => {
                const p = editandoExistente
                setEditando(null)
                setDeleteTarget(p)
              }}
              className="text-sm font-semibold text-red-600 transition-colors hover:text-red-700 hover:underline"
            >
              Eliminar profesor
            </button>
          </div>
        )}
      </Modal>

      {/* Modal de confirmación de eliminación */}
      <Modal
        open={deleteTarget !== null}
        title="Eliminar profesor"
        onClose={() => setDeleteTarget(null)}
      >
        <div className="flex flex-col gap-4">
          <p className="text-sm text-gray-600">
            ¿Eliminar a{' '}
            <span className="font-semibold text-gray-800">
              {deleteTarget?.nombre} {deleteTarget?.apellidos}
            </span>
            ? Esta acción no se puede deshacer.
          </p>
          {deleteTarget?.user_id && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
              Recuerda eliminar también la cuenta en Supabase Auth → Authentication → Users.
            </p>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setDeleteTarget(null)}
              disabled={working}
              className="btn-ghost flex-1"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => void confirmarEliminar()}
              disabled={working}
              className="flex-1 rounded-xl bg-red-600 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-600 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {working ? 'Eliminando…' : 'Eliminar'}
            </button>
          </div>
        </div>
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

      {/* Modal de confirmación de reseteo de NIP */}
      <Modal
        open={resetTarget !== null}
        title="Resetear NIP"
        onClose={() => setResetTarget(null)}
      >
        <div className="flex flex-col gap-4">
          <div className="space-y-2 text-sm text-gray-600">
            <p className="font-semibold text-gray-800">
              ¿Resetear el NIP de {resetTarget?.nombre} {resetTarget?.apellidos}?
            </p>
            <p>
              Se restablecerá al NIP inicial:{' '}
              <span className="font-mono font-semibold text-udeg-naranja">2126</span>
            </p>
            <p>El profesor deberá cambiarlo en su próximo inicio de sesión.</p>
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
            <button
              onClick={onResetPassword}
              aria-label={`Resetear NIP de ${p.nombre} ${p.apellidos}`}
              title="Resetear NIP"
              className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-udeg-naranja-light hover:text-udeg-naranja"
            >
              <IconKey className="h-4 w-4" />
            </button>
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
