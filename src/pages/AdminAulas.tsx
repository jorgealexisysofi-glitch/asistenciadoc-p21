import { useCallback, useEffect, useState, type FormEvent } from 'react'
import AdminLayout from '../components/AdminLayout'
import Modal from '../components/Modal'
import { SkeletonTable } from '../components/Skeleton'
import { IconPencil, IconPlus } from '../components/icons'
import { supabase } from '../lib/supabase'
import type { Aula } from '../types'

interface FormAula {
  nombre: string
  edificio: string
  beacon_id: string
  beacon_tipo: 'wifi' | 'bluetooth' | ''
}

const FORM_VACIO: FormAula = { nombre: '', edificio: '', beacon_id: '', beacon_tipo: '' }

export default function AdminAulas() {
  const [aulas, setAulas] = useState<Aula[]>([])
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editando, setEditando] = useState<Aula | 'nueva' | null>(null)
  const [form, setForm] = useState<FormAula>(FORM_VACIO)

  const cargar = useCallback(async () => {
    const { data, error: err } = await supabase.from('aulas').select('*').order('nombre')
    if (err) setError('No se pudieron cargar las aulas.')
    else setAulas((data ?? []) as Aula[])
    setLoading(false)
  }, [])

  useEffect(() => {
    void cargar()
  }, [cargar])

  function abrir(aula: Aula | 'nueva') {
    setForm(
      aula === 'nueva'
        ? FORM_VACIO
        : {
            nombre: aula.nombre,
            edificio: aula.edificio ?? '',
            beacon_id: aula.beacon_id ?? '',
            beacon_tipo: aula.beacon_tipo ?? '',
          }
    )
    setEditando(aula)
  }

  async function guardar(e: FormEvent) {
    e.preventDefault()
    if (!editando) return
    setWorking(true)
    setError(null)

    const datos = {
      nombre: form.nombre.trim(),
      edificio: form.edificio.trim() || null,
      beacon_id: form.beacon_id.trim() || null,
      beacon_tipo: form.beacon_id.trim() ? form.beacon_tipo || 'wifi' : null,
    }

    const { error: err } =
      editando === 'nueva'
        ? await supabase.from('aulas').insert(datos)
        : await supabase.from('aulas').update(datos).eq('id', editando.id)

    if (err) {
      setError(
        err.code === '23505'
          ? 'Ya existe un aula con ese beacon.'
          : 'No se pudo guardar el aula.'
      )
    } else {
      setEditando(null)
    }
    await cargar()
    setWorking(false)
  }

  return (
    <AdminLayout breadcrumb={[{ label: 'Aulas / Beacons' }]}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Aulas y beacons</h1>
          <p className="mt-1 text-sm text-gray-500">
            Espacios físicos y el identificador del ESP32 instalado en cada uno.
          </p>
        </div>
        <button onClick={() => abrir('nueva')} className="btn-primary">
          <IconPlus className="h-4 w-4" />
          Agregar aula
        </button>
      </div>

      {error && (
        <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
          {error}
        </p>
      )}

      {loading ? (
        <div className="mt-5">
          <SkeletonTable rows={5} cols={5} />
        </div>
      ) : (
        <div className="card mt-5 overflow-x-auto !p-0">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-xs uppercase tracking-wide text-gray-400">
                <th className="px-4 py-3 font-semibold">Aula</th>
                <th className="px-4 py-3 font-semibold">Edificio</th>
                <th className="px-4 py-3 font-semibold">Beacon</th>
                <th className="px-4 py-3 font-semibold">Tipo</th>
                <th className="px-4 py-3 text-right font-semibold">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {aulas.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                    No hay aulas registradas todavía.
                  </td>
                </tr>
              ) : (
                aulas.map((a) => (
                  <tr key={a.id} className="border-b border-gray-50 last:border-0">
                    <td className="px-4 py-3 font-semibold text-gray-800">{a.nombre}</td>
                    <td className="px-4 py-3 text-gray-600">{a.edificio ?? '—'}</td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-600">
                      {a.beacon_id ?? '—'}
                    </td>
                    <td className="px-4 py-3">
                      {a.beacon_tipo ? (
                        <span
                          className={`badge ${
                            a.beacon_tipo === 'wifi'
                              ? 'bg-udeg-azul-light text-udeg-azul'
                              : 'bg-violet-50 text-violet-700'
                          }`}
                        >
                          {a.beacon_tipo === 'wifi' ? 'WiFi' : 'Bluetooth'}
                        </span>
                      ) : (
                        <span className="badge bg-gray-100 text-gray-500">Sin beacon</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => abrir(a)}
                        aria-label={`Editar ${a.nombre}`}
                        className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-udeg-azul-light hover:text-udeg-azul"
                      >
                        <IconPencil className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={editando !== null}
        title={editando === 'nueva' ? 'Agregar aula' : 'Editar aula'}
        onClose={() => setEditando(null)}
      >
        <form onSubmit={guardar} className="flex flex-col gap-3">
          <div>
            <label htmlFor="a-nombre" className="mb-1 block text-sm font-semibold text-gray-700">
              Nombre
            </label>
            <input
              id="a-nombre"
              type="text"
              required
              placeholder="Aula 101"
              className="input"
              value={form.nombre}
              onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
            />
          </div>
          <div>
            <label htmlFor="a-edificio" className="mb-1 block text-sm font-semibold text-gray-700">
              Edificio <span className="text-gray-400">(opcional)</span>
            </label>
            <input
              id="a-edificio"
              type="text"
              placeholder="Edificio A"
              className="input"
              value={form.edificio}
              onChange={(e) => setForm((f) => ({ ...f, edificio: e.target.value }))}
            />
          </div>
          <div>
            <label htmlFor="a-beacon" className="mb-1 block text-sm font-semibold text-gray-700">
              Beacon ID <span className="text-gray-400">(SSID o nombre Bluetooth)</span>
            </label>
            <input
              id="a-beacon"
              type="text"
              placeholder="P21-BEACON-A101"
              className="input font-mono"
              value={form.beacon_id}
              onChange={(e) => setForm((f) => ({ ...f, beacon_id: e.target.value }))}
            />
          </div>
          <div>
            <label htmlFor="a-tipo" className="mb-1 block text-sm font-semibold text-gray-700">
              Tipo de beacon
            </label>
            <select
              id="a-tipo"
              className="input"
              value={form.beacon_tipo}
              onChange={(e) =>
                setForm((f) => ({ ...f, beacon_tipo: e.target.value as FormAula['beacon_tipo'] }))
              }
              disabled={form.beacon_id.trim() === ''}
            >
              <option value="">Sin beacon</option>
              <option value="wifi">WiFi (SSID)</option>
              <option value="bluetooth">Bluetooth</option>
            </select>
          </div>
          <button type="submit" disabled={working} className="btn-primary mt-1">
            {working ? 'Guardando…' : 'Guardar'}
          </button>
        </form>
      </Modal>
    </AdminLayout>
  )
}
