export type Rol = 'profesor' | 'admin'

export type BeaconTipo = 'wifi' | 'bluetooth'

export type MetodoDeteccion = 'wifi' | 'bluetooth' | 'manual'

export type EstadoAsistencia = 'presente' | 'tarde' | 'ausente'

/** Personal docente (tabla `profesores`, vinculada a auth.users vía user_id) */
export interface Profesor {
  id: string
  nombre: string
  apellidos: string
  correo: string
  numero_empleado: string | null
  telefono: string | null
  activo: boolean
  /** true → la app le asigna rol admin (además de app_metadata.rol del JWT) */
  admin: boolean
  /** PIN de 4 dígitos para confirmar el registro manual; null si no se ha asignado */
  pin: string | null
  /** true mientras use la contraseña temporal: obliga a cambiarla al primer login */
  password_temporal: boolean
  created_at: string
  /** null hasta que el profesor active su cuenta en Supabase Auth */
  user_id: string | null
}

/** Espacio físico con beacon ESP32 (tabla `aulas`) */
export interface Aula {
  id: string
  nombre: string
  edificio: string | null
  /** SSID (wifi) o nombre del dispositivo (bluetooth) emitido por el ESP32 */
  beacon_id: string | null
  beacon_tipo: BeaconTipo | null
}

/** Unidad de aprendizaje (tabla `materias`) */
export interface Materia {
  id: string
  nombre: string
  clave: string | null
}

/** Bloque semanal profesor + materia + aula (tabla `horarios`) */
export interface Horario {
  id: string
  profesor_id: string
  materia_id: string
  aula_id: string
  /** 1=Lunes … 6=Sábado */
  dia_semana: number
  hora_inicio: string
  hora_fin: string
  semestre: string
  activo: boolean
  /** Relaciones embebidas (select con join) */
  materia?: Pick<Materia, 'nombre' | 'clave'>
  aula?: Pick<Aula, 'nombre' | 'edificio'>
}

/** Marcaje de asistencia (tabla `registros_asistencia`) */
export interface RegistroAsistencia {
  id: string
  horario_id: string
  profesor_id: string
  aula_id: string
  /** Fecha en formato YYYY-MM-DD */
  fecha: string
  hora_registro: string
  metodo_deteccion: MetodoDeteccion
  beacon_detectado: string | null
  estado: EstadoAsistencia
  latitud: number | null
  longitud: number | null
  /** Relaciones embebidas (select con join) */
  profesor?: Pick<Profesor, 'nombre' | 'apellidos' | 'numero_empleado'>
  aula?: Pick<Aula, 'nombre' | 'edificio'>
  horario?: Pick<Horario, 'hora_inicio' | 'hora_fin'> & {
    materia?: Pick<Materia, 'nombre'>
  }
}

/** Fila devuelta por la RPC `get_horario_activo` */
export interface HorarioActivo {
  horario_id: string
  materia_id: string
  materia_nombre: string
  materia_clave: string | null
  aula_id: string
  aula_nombre: string
  edificio: string | null
  beacon_id: string | null
  beacon_tipo: BeaconTipo | null
  dia_semana: number
  hora_inicio: string
  hora_fin: string
  semestre: string
}
