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
  /** Solo en el horario de un grupo: nombre del profesor de esa clase */
  profesor_nombre?: string
  /** Grupo de alumnos de la clase (cuando la RPC lo devuelve) */
  grupo?: string
}

/** Fila devuelta por la RPC `get_grupos` */
export interface Grupo {
  grupo: string
  clases: number
}

/** Una clase en el planificador de horarios (un bloque día+hora) */
export interface ClasePlan {
  id: string
  codigo: string
  profesor: string
  materia: string
  clave: string
  carrera: string
  crn: string
  grupo: string
  tipo: string
  aula: string
  horas: string
  /** 1=Lunes … 5=Viernes */
  dia_semana: number
  hora_inicio: string
  hora_fin: string
}

/** Aula con clases (RPC `get_aulas_horario`) */
export interface AulaHorario {
  aula_id: string
  aula_nombre: string
  edificio: string | null
  clases: number
}

/** Ciclo archivado (respaldo) — RPC `get_archivos` */
export interface ArchivoCiclo {
  id: string
  etiqueta: string | null
  creado_en: string
  n_horarios: number
  n_registros: number
  creado_por: string | null
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

/** Clase con ventana de salida abierta (RPC `get_clase_para_salida`) */
export interface ClaseSalida {
  horario_id: string
  materia_nombre: string
  aula_nombre: string | null
  hora_inicio: string
  hora_fin: string
  /** timestamptz de la salida ya firmada, o null si aún no firma */
  hora_salida: string | null
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
  horario_id: string
  /** Fecha en formato YYYY-MM-DD */
  fecha: string
  dia_semana: number
  materia_nombre: string
  aula_nombre: string | null
  hora_inicio: string
  hora_fin: string
  /** timestamptz del registro, o null si fue falta */
  hora_registro: string | null
  /** timestamptz de la salida firmada, o null si no firmó salida */
  hora_salida: string | null
  estado: EstadoReporte
  /** Minutos vs hora programada (positivo = tarde); null si no hubo registro */
  diferencia_min: number | null
  /** La clase está marcada como justificada */
  justificado: boolean
  motivo: string | null
}

/** Fila del historial propio del profesor (RPC `get_mi_asistencia`) */
export interface MiAsistenciaItem {
  horario_id: string
  fecha: string
  dia_semana: number
  materia_nombre: string
  aula_nombre: string | null
  hora_inicio: string
  hora_fin: string
  hora_registro: string | null
  /** timestamptz de la salida firmada, o null si no firmó salida */
  hora_salida: string | null
  estado: EstadoReporte
  diferencia_min: number | null
  justificado: boolean
  motivo: string | null
}

/** Día no laborable (festivo/suspensión) */
export interface DiaNoLaborable {
  fecha: string
  motivo: string
  created_at: string
}

/** Fila de la bitácora de correcciones (RPC `get_bitacora`) */
export interface BitacoraItem {
  created_at: string
  admin_email: string | null
  accion: string
  detalle: string
  fecha: string | null
  profesor_nombre: string | null
  materia_nombre: string | null
}

/** Profesor con datos NO sensibles (RPC `get_profesores_basico`) */
export interface ProfesorBasico {
  id: string
  nombre: string
  apellidos: string
  numero_empleado: string | null
  activo: boolean
}

/** Registro de asistencia de un día para el dashboard (RPC `get_registros_dia`) */
export interface RegistroDia {
  id: string
  profesor_id: string
  profesor_nombre: string
  profesor_apellidos: string
  materia_nombre: string | null
  aula_nombre: string | null
  hora_registro: string | null
  hora_salida: string | null
  estado: EstadoAsistencia
  metodo_deteccion: MetodoDeteccion
}

/** KPIs del dashboard (RPC `get_dashboard_kpis`) */
export interface DashboardKpis {
  activos: number
  registradas_hoy: number
  pct_semana: number | null
  en_clase: number
}

/** Fila del tablero "próximas clases" (RPC `get_proximas_clases`) */
export interface ProximaClaseTablero {
  horario_id: string
  profesor_nombre: string
  profesor_apellidos: string
  materia_nombre: string
  aula_nombre: string | null
  hora_inicio: string
  hora_fin: string
  /** Minutos que faltan para que inicie la clase */
  minutos_para: number
  /** El profesor ya registró (raro, pero posible si llegó antes) */
  registrado: boolean
}

/** Fila del tablero "clases en curso" (RPC `get_clases_en_curso`) */
export interface ClaseEnCurso {
  horario_id: string
  profesor_nombre: string
  profesor_apellidos: string
  materia_nombre: string
  aula_nombre: string | null
  hora_inicio: string
  hora_fin: string
  registrado: boolean
  estado: EstadoAsistencia | null
  hora_registro: string | null
  /** timestamptz de la salida firmada, o null si no firmó salida */
  hora_salida: string | null
}
