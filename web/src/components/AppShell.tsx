import { useEffect, useRef, useState } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Icon } from './icons'
import { cn, firstChar } from '../lib/utils'
import { MASCOT_URL } from '../lib/assets'

type Menu = 'pools' | 'user' | null

export function AppShell() {
  const { user, activePool, pools, activePoolId, setActivePool, theme, setTheme, logout } = useAuth()
  const [menu, setMenu] = useState<Menu>(null)
  const navRef = useRef<HTMLElement | null>(null)
  const location = useLocation()

  useEffect(() => {
    setMenu(null)
  }, [location.pathname])

  useEffect(() => {
    if (!menu) return
    const onDown = (event: MouseEvent) => {
      if (navRef.current && !navRef.current.contains(event.target as Node)) setMenu(null)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenu(null)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [menu])

  const isActive = (path: string) =>
    path === '/' ? location.pathname === '/' : location.pathname.startsWith(path)

  return (
    <div className="min-h-dvh">
      <header className="nav-shell" ref={navRef}>
        <div className="mx-auto flex h-[68px] max-w-[1440px] items-center gap-2 px-3 sm:gap-3 sm:px-6">
          <Link to="/" className="flex shrink-0 items-center gap-3" aria-label="别纠结 Indeciso 首页">
            <img src={MASCOT_URL} alt="" className="brand-mark" />
            <span className="hidden leading-none sm:block">
              <span className="block text-[15px] font-semibold tracking-[0.06em]">别纠结</span>
              <span
                className="mt-1 block text-[8.5px] uppercase tracking-[0.34em]"
                style={{ color: 'var(--text-mute)' }}
              >
                Indeciso
              </span>
            </span>
          </Link>

          <div className="relative ml-1 min-w-0 sm:ml-3">
            <button
              type="button"
              className="nav-link max-w-[168px] sm:max-w-[260px]"
              aria-haspopup="menu"
              aria-expanded={menu === 'pools'}
              onClick={() => setMenu(menu === 'pools' ? null : 'pools')}
            >
              <Icon name="layers" size={15} />
              <span className="truncate">{activePool?.name ?? '选择池'}</span>
              {activePool && (
                <span className="hidden sm:inline-flex">
                  <span className="chip chip-brand" style={{ padding: '3px 7px' }}>
                    {activePool.itemCount}
                  </span>
                </span>
              )}
              <Icon name="chevronDown" size={13} />
            </button>
            {menu === 'pools' && (
              <div className="dropdown left-0 top-[calc(100%+10px)]" role="menu">
                <div
                  className="px-3 pb-2 pt-1 text-[10px] uppercase tracking-[0.24em]"
                  style={{ color: 'var(--text-mute)' }}
                >
                  切换选择池
                </div>
                {pools.map((pool) => (
                  <button
                    key={pool.id}
                    type="button"
                    className="dropdown-item"
                    data-active={pool.id === activePoolId}
                    role="menuitem"
                    onClick={() => {
                      setMenu(null)
                      if (pool.id !== activePoolId) void setActivePool(pool.id)
                    }}
                  >
                    <span className="min-w-0 flex-1 truncate">{pool.name}</span>
                    {pool.isDefault && <span className="chip chip-gold">默认</span>}
                    <span className="chip" style={{ padding: '3px 7px' }}>
                      {pool.itemCount}
                    </span>
                    {pool.id === activePoolId && <Icon name="check" size={15} />}
                  </button>
                ))}
                <div className="dropdown-sep" />
                <Link to="/settings" className="dropdown-item" onClick={() => setMenu(null)}>
                  <Icon name="settings" size={15} />
                  管理选择池
                </Link>
                <Link to="/templates" className="dropdown-item" onClick={() => setMenu(null)}>
                  <Icon name="grid" size={15} />
                  从模板创建
                </Link>
              </div>
            )}
          </div>

          <div className="ml-auto flex items-center gap-0.5 sm:gap-1">
            <Link
              to="/history"
              className="nav-link"
              data-active={isActive('/history')}
              aria-label="历史记录"
            >
              <Icon name="history" size={16} />
              <span className="hidden md:inline">历史记录</span>
            </Link>
            <Link
              to="/settings"
              className="nav-link"
              data-active={isActive('/settings') || isActive('/templates')}
              aria-label="设置"
            >
              <Icon name="settings" size={16} />
              <span className="hidden md:inline">设置</span>
            </Link>
            <button
              type="button"
              className="icon-btn"
              onClick={() => void setTheme(theme === 'dark' ? 'light' : 'dark')}
              aria-label={theme === 'dark' ? '切换到浅色主题' : '切换到深色主题'}
              title={theme === 'dark' ? '切换到浅色主题' : '切换到深色主题'}
            >
              <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={17} />
            </button>
            <div className="relative">
              <button
                type="button"
                className="icon-btn ml-0.5"
                style={{
                  width: 36,
                  height: 36,
                  background: 'var(--brand-soft)',
                  border: '1px solid var(--line)',
                  color: 'var(--text)',
                  fontWeight: 600,
                  fontSize: 13,
                }}
                onClick={() => setMenu(menu === 'user' ? null : 'user')}
                aria-haspopup="menu"
                aria-expanded={menu === 'user'}
                aria-label="用户菜单"
              >
                {firstChar(user?.username ?? '?')}
              </button>
              {menu === 'user' && (
                <div className="dropdown right-0 top-[calc(100%+10px)]" role="menu" style={{ minWidth: 210 }}>
                  <div className="px-3 py-2">
                    <div className="text-[13px] font-medium">{user?.username}</div>
                    <div className="mt-0.5 text-[11px]" style={{ color: 'var(--text-mute)' }}>
                      选择困难症认证用户
                    </div>
                  </div>
                  <div className="dropdown-sep" />
                  <button
                    type="button"
                    className="dropdown-item"
                    role="menuitem"
                    onClick={() => {
                      setMenu(null)
                      void logout()
                    }}
                  >
                    <Icon name="logout" size={15} />
                    退出登录
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <main key={location.pathname} className={cn('page-enter')}>
        <Outlet />
      </main>
    </div>
  )
}
