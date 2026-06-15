import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { AuthProvider } from './hooks/useAuth'
import ProtectedRoute from './components/ProtectedRoute'
import InstallBanner from './components/InstallBanner'
import ConnectionWatcher from './components/ConnectionWatcher'
import Login from './pages/Login'
import CambiarNIP from './pages/CambiarNIP'
import ProfesorHome from './pages/ProfesorHome'
import ValidarAsistencia from './pages/ValidarAsistencia'
import Admin from './pages/Admin'
import AdminProfesores from './pages/AdminProfesores'
import AdminReportes from './pages/AdminReportes'
import AdminAulas from './pages/AdminAulas'

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          <Route path="/" element={<Login />} />
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
            path="/admin"
            element={
              <ProtectedRoute requireRol="admin">
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
              <ProtectedRoute requireRol="admin">
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
