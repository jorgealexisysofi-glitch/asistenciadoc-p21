export type Rol = 'profesor' | 'admin'

export type BeaconTipo = 'wifi' | 'bluetooth'

export type MetodoDeteccion = 'wifi' | 'bluetooth' | 'manual' | 'kiosco'

export type EstadoAsistencia = 'presente' | 'tarde' | 'ausente'

/** Personal docente (tabla `profesores`, vinculada a auth.users vía user_id) */
export interface Profesor {
  id: string
  nombre: string
  apellidos: string
  /** Opcional: los maestros entran con número de empleado + NIP, no con correo */
  correo: string | null
  numero_empleado: string | null
  telefono: string | null
  activo: boolean
  /** true → la app le asigna rol admin (además de app_metadata.rol del JWT) */
  admin: boolean
  /** PIN de 4 dígitos para confirmar el registro manual; null si no se ha asignado */
  pin: string | null
  /** NIP de acceso (4 dígitos). Inicial: '2126' */
  nip: string
  /** true mientras use el NIP temporal: obliga a cambiarlo al primer login */
  nip_temporal: boolean
  /** (legado de Supabase Auth; ya no se usa para el login de profesores) */
  password_temporal: boolean
  created_at: string
  /** null para profesores que entran por NIP; solo el admin usa Supabase Auth */
  user_id: string | null
}

/** Sesión de profesor autenticado por NIP (guardada en localStorage) */
export interface SesionProfesor {
  id: string
  nombre: string
  apellidos: string
  admin: boolean
  nip_temporal: boolean
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

/** Fila devuelta por la RPC `get_proxima_clase` */
export interface ProximaClase {
  horario_id: string
  materia_nombre: string
  materia_clave: string | null
  /** null si el horario aún no tiene aula asignada */
  aula_nombre: string | null
  edificio: string | null
  hora_inicio: string
  hora_fin: string
}

/** Fila devuelta por la RPC `get_horarios_profesor` */
export interface HorarioProfesor {
  horario_id: string
  materia_nombre: string
  materia_clave: string | null
  /** null si el horario aún no tiene aula asignada */
  aula_nombre: string | null
  edificio: string | null
  /** 1=Lunes … 6=Sábado */
  dia_semana: number
  hora_inicio: string
  hora_fin: string
  semestre: string
}

/** Fila devuelta por la RPC `get_historial_profesor` */
export interface HistorialItem {
  id: string
  fecha: string
  hora_registro: string
  metodo_deteccion: MetodoDeteccion
  estado: EstadoAsistencia
  materia_nombre: string | null
  aula_nombre: string | null
}

/** Fila devuelta por `get_registro_clase` y `registrar_asistencia` */
export interface RegistroClase {
  id: string
  estado: EstadoAsistencia
  hora_registro: string
}

export type EstadoReporte = 'presente' | 'tarde' | 'falta'

/** Fila de detalle devuelta por la RPC `generar_reporte_asistencia` */
export interface ReporteDetalle {
  profesor_id: string
  profesor_nombre: string
  profesor_apellidos: string
  /** Fecha en formato YYYY-MM-DD */
  fecha: string
  dia_semana: number
  materia_nombre: string
  aula_nombre: string | null
  hora_inicio: string
  hora_fin: string
  /** timestamptz del registro, o null si fue falta */
  hora_registro: string | null
  estado: EstadoReporte
  /** Minutos vs hora programada (positivo = tarde); null si no hubo registro */
  diferencia_min: number | null
}
