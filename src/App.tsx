import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { AuthProvider } from './hooks/useAuth'
import ProtectedRoute from './components/ProtectedRoute'
import InstallBanner from './components/InstallBanner'
import ConnectionWatcher from './components/ConnectionWatcher'
import Login from './pages/Login'
import Checador from './pages/Checador'
import CambiarNIP from './pages/CambiarNIP'
import ProfesorHome from './pages/ProfesorHome'
import MiHorario from './pages/MiHorario'
import MiAsistencia from './pages/MiAsistencia'
import ValidarAsistencia from './pages/ValidarAsistencia'
import Admin from './pages/Admin'
import AdminProfesores from './pages/AdminProfesores'
import AdminReportes from './pages/AdminReportes'
import AdminAulas from './pages/AdminAulas'
import CambiarPasswordAdmin from './pages/CambiarPasswordAdmin'
import AdminImportarHorarios from './pages/AdminImportarHorarios'
import AdminAsignarAulas from './pages/AdminAsignarAulas'
import AdminHorarioProfesor from './pages/AdminHorarioProfesor'
import AdminTablero from './pages/AdminTablero'
import AdminActa from './pages/AdminActa'
import AdminDiasNoLaborables from './pages/AdminDiasNoLaborables'
import AdminBitacora from './pages/AdminBitacora'
import AdminGrupos from './pages/AdminGrupos'
import AdminHorarioGrupo from './pages/AdminHorarioGrupo'

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          <Route path="/" element={<Login />} />
          <Route path="/checador" element={<Checador />} />
          <Route
            path="/cambiar-nip"
            element={
              <ProtectedRoute skipNipCheck>
                <CambiarNIP />
              </ProtectedRoute>
            }
          />
          <Route
            path="/home"
            element={
              <ProtectedRoute>
                <ProfesorHome />
              </ProtectedRoute>
            }
          />
          <Route
            path="/validar"
            element={
              <ProtectedRoute>
                <ValidarAsistencia />
              </ProtectedRoute>
            }
          />
          <Route
            path="/mi-horario"
            element={
              <ProtectedRoute>
                <MiHorario />
              </ProtectedRoute>
            }
          />
          <Route
            path="/mi-asistencia"
            element={
              <ProtectedRoute>
                <MiAsistencia />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin"
            element={
              <ProtectedRoute requireRol="monitor">
                <Admin />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/profesores"
            element={
              <ProtectedRoute requireRol="admin">
                <AdminProfesores />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/reportes"
            element={
              <ProtectedRoute requireRol="monitor">
                <AdminReportes />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/aulas"
            element={
              <ProtectedRoute requireRol="admin">
                <AdminAulas />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/cambiar-password"
            element={
              <ProtectedRoute requireRol="admin">
                <CambiarPasswordAdmin />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/horarios"
            element={
              <ProtectedRoute requireRol="admin">
                <AdminImportarHorarios />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/asignar-aulas"
            element={
              <ProtectedRoute requireRol="admin">
                <AdminAsignarAulas />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/horario/:id"
            element={
              <ProtectedRoute requireRol="admin">
                <AdminHorarioProfesor />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/grupos"
            element={
              <ProtectedRoute requireRol="admin">
                <AdminGrupos />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/grupo/:grupo"
            element={
              <ProtectedRoute requireRol="admin">
                <AdminHorarioGrupo />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/tablero"
            element={
              <ProtectedRoute requireRol="monitor">
                <AdminTablero />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/acta/:id"
            element={
              <ProtectedRoute requireRol="monitor">
                <AdminActa />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/dias-no-laborables"
            element={
              <ProtectedRoute requireRol="admin">
                <AdminDiasNoLaborables />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/bitacora"
            element={
              <ProtectedRoute requireRol="admin">
                <AdminBitacora />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <InstallBanner />
        <ConnectionWatcher />
        <Toaster
          position="top-center"
          toastOptions={{
            duration: 4000,
            style: { fontSize: '0.875rem', fontWeight: 500 },
            success: { iconTheme: { primary: '#E87722', secondary: '#fff' } },
          }}
        />
      </BrowserRouter>
    </AuthProvider>
  )
}
