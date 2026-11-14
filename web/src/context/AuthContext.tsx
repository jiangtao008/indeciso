import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type {
  BootstrapDTO,
  PoolSummary,
  ThemeName,
  UserDTO,
  UserSettingsDTO,
} from '@shared/types'
import { api, onUnauthorized } from '../lib/api'
import { useToast } from './ToastContext'

interface AuthContextValue {
  loading: boolean
  user: UserDTO | null
  settings: UserSettingsDTO
  pools: PoolSummary[]
  activePoolId: string | null
  activePool: PoolSummary | null
  theme: ThemeName
  login: (username: string, password: string) => Promise<void>
  register: (username: string, password: string) => Promise<void>
  logout: () => Promise<void>
  refreshPools: () => Promise<void>
  setActivePool: (id: string) => Promise<void>
  setTheme: (theme: ThemeName) => Promise<void>
  adoptBootstrap: (data: BootstrapDTO) => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}

const THEME_KEY = 'indeciso.theme'

function initialTheme(): ThemeName {
  try {
    const stored = localStorage.getItem(THEME_KEY)
    if (stored === 'light' || stored === 'dark') return stored
  } catch {
    /* ignore */
  }
  return 'dark'
}

function applyThemeToDocument(theme: ThemeName) {
  document.documentElement.dataset.theme = theme
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', theme === 'light' ? '#f4f0e8' : '#08070f')
  try {
    localStorage.setItem(THEME_KEY, theme)
  } catch {
    /* ignore */
  }
}

const EMPTY_SETTINGS: UserSettingsDTO = { theme: initialTheme(), activePoolId: null }

export function AuthProvider({ children }: { children: ReactNode }) {
  const toast = useToast()
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<UserDTO | null>(null)
  const [settings, setSettings] = useState<UserSettingsDTO>(EMPTY_SETTINGS)
  const [pools, setPools] = useState<PoolSummary[]>([])
  const [activePoolId, setActivePoolId] = useState<string | null>(null)

  const applyBootstrap = useCallback(
    (data: BootstrapDTO) => {
      setUser(data.user)
      setSettings({ ...data.settings, theme: data.settings.theme ?? 'dark' })
      setPools(data.pools)
      setActivePoolId(data.settings.activePoolId ?? data.pools[0]?.id ?? null)
    },
    [],
  )

  const adoptBootstrap = useCallback(
    (data: BootstrapDTO) => {
      applyBootstrap(data)
    },
    [applyBootstrap],
  )

  useEffect(() => {
    applyThemeToDocument(settings.theme)
  }, [settings.theme])

  useEffect(() => {
    let alive = true
    api.auth
      .me()
      .then((data) => {
        if (alive) applyBootstrap(data)
      })
      .catch(() => {
        /* not signed in */
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [applyBootstrap])

  useEffect(
    () =>
      onUnauthorized(() => {
        setUser((current) => {
          if (current) toast.show('登录失效了，请重新登录。', 'error')
          return null
        })
        setPools([])
        setActivePoolId(null)
      }),
    [toast],
  )

  const login = useCallback(
    async (username: string, password: string) => {
      const data = await api.auth.login(username, password)
      applyBootstrap(data)
    },
    [applyBootstrap],
  )

  const register = useCallback(
    async (username: string, password: string) => {
      const data = await api.auth.register(username, password)
      applyBootstrap(data)
    },
    [applyBootstrap],
  )

  const logout = useCallback(async () => {
    try {
      await api.auth.logout()
    } finally {
      setUser(null)
      setPools([])
      setActivePoolId(null)
      setSettings((s) => ({ ...s, activePoolId: null }))
    }
  }, [])

  const refreshPools = useCallback(async () => {
    const { pools: fresh } = await api.pools.list()
    setPools(fresh)
    setActivePoolId((current) => {
      if (current && fresh.some((p) => p.id === current)) return current
      return fresh.find((p) => p.isDefault)?.id ?? fresh[0]?.id ?? null
    })
  }, [])

  const setActivePool = useCallback(
    async (id: string) => {
      const prev = activePoolId
      setActivePoolId(id)
      setSettings((s) => ({ ...s, activePoolId: id }))
      try {
        await api.settings.update({ activePoolId: id })
      } catch (error) {
        setActivePoolId(prev)
        setSettings((s) => ({ ...s, activePoolId: prev }))
        toast.fromError(error, '切换选择池失败了，再试一次。')
      }
    },
    [activePoolId, toast],
  )

  const setTheme = useCallback(
    async (theme: ThemeName) => {
      setSettings((s) => ({ ...s, theme }))
      if (user) {
        try {
          await api.settings.update({ theme })
        } catch {
          /* theme still applies locally */
        }
      }
    },
    [user],
  )

  const activePool = useMemo(
    () => pools.find((p) => p.id === activePoolId) ?? null,
    [pools, activePoolId],
  )

  const value = useMemo<AuthContextValue>(
    () => ({
      loading,
      user,
      settings,
      pools,
      activePoolId,
      activePool,
      theme: settings.theme,
      login,
      register,
      logout,
      refreshPools,
      setActivePool,
      setTheme,
      adoptBootstrap,
    }),
    [
      loading,
      user,
      settings,
      pools,
      activePoolId,
      activePool,
      login,
      register,
      logout,
      refreshPools,
      setActivePool,
      setTheme,
      adoptBootstrap,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
