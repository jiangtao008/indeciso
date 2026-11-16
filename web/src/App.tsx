import { Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { AppShell } from './components/AppShell'
import { LoginPage } from './pages/LoginPage'
import { HomePage } from './pages/HomePage'
import { SettingsPage } from './pages/SettingsPage'
import { HistoryPage } from './pages/HistoryPage'
import { TemplatesPage } from './pages/TemplatesPage'
import { MASCOT_URL } from './lib/assets'

function Splash() {
  return (
    <div
      style={{
        minHeight: '100dvh',
        display: 'grid',
        placeItems: 'center',
        gap: 16,
        textAlign: 'center',
      }}
    >
      <div>
        <img
          src={MASCOT_URL}
          alt=""
          style={{
            width: 96,
            height: 96,
            borderRadius: 28,
            objectFit: 'cover',
            animation: 'float-soft 3s ease-in-out infinite',
            filter: 'drop-shadow(0 24px 40px rgba(168,85,247,.4))',
          }}
        />
        <div
          className="mt-4 text-[12px] uppercase tracking-[0.3em]"
          style={{ color: 'var(--text-mute)' }}
        >
          Indeciso
        </div>
      </div>
    </div>
  )
}

function Protected({ children }: { children: React.ReactNode }) {
  const { loading, user } = useAuth()
  if (loading) return <Splash />
  if (!user) return <Navigate to="/login" replace />
  return children
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          element={
            <Protected>
              <AppShell />
            </Protected>
          }
        >
          <Route index element={<HomePage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="/templates" element={<TemplatesPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  )
}
