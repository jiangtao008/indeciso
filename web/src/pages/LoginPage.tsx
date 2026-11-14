import { useEffect, useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Icon } from '../components/icons'
import { ApiError } from '../lib/api'

type Mode = 'login' | 'register'

export function LoginPage() {
  const { user, loading, login, register } = useAuth()
  const navigate = useNavigate()
  const [mode, setMode] = useState<Mode>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [demoBusy, setDemoBusy] = useState(false)

  useEffect(() => {
    if (user) navigate('/', { replace: true })
  }, [user, navigate])

  if (!loading && user) return <Navigate to="/" replace />

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    if (mode === 'register' && password.length < 6) {
      setError('密码至少 6 位，别让命运都猜得到。')
      return
    }
    setBusy(true)
    try {
      if (mode === 'login') await login(username.trim(), password)
      else await register(username.trim(), password)
      navigate('/', { replace: true })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '命运暂时失联，请稍后再试。')
    } finally {
      setBusy(false)
    }
  }

  const enterDemo = async () => {
    setDemoBusy(true)
    setError('')
    try {
      await login('demo', 'demo1234')
      navigate('/', { replace: true })
    } catch {
      setError('体验账号暂时进不去，试着自己注册一个吧。')
    } finally {
      setDemoBusy(false)
    }
  }

  return (
    <div className="auth-root">
      <section className="auth-hero">
        <div className="relative z-10">
          <div className="eyebrow">Stop overthinking · start choosing</div>
        </div>

        <div className="relative z-10 flex flex-col items-center gap-8 text-center">
          <img src="/mascot.jpeg" alt="别纠结吉祥物" className="auth-mascot" />
          <div className="auth-hero-copy">
            <h1 className="hero-title" style={{ margin: 0 }}>
              别纠结，
              <br />
              让选择
              <span className="hero-serif text-gradient"> 变简单</span>。
            </h1>
            <p
              className="muted-copy mx-auto mt-5 max-w-[380px]"
              style={{ fontSize: 14 }}
            >
              把候选项交给命运，把纠结的时间还给自己。
              一次真正的随机，一点恰到好处的仪式感。
            </p>
          </div>
        </div>

        <div
          className="relative z-10 hidden flex-wrap items-center gap-2 sm:flex"
          aria-hidden="true"
        >
          <span className="chip">
            <Icon name="dice" size={13} /> 真实随机
          </span>
          <span className="chip">
            <Icon name="sparkles" size={13} /> 沉浸动画
          </span>
          <span className="chip">
            <Icon name="history" size={13} /> 历史可溯
          </span>
        </div>
      </section>

      <section className="auth-card-wrap">
        <div className="auth-card">
          <div className="mb-6">
            <div className="flex items-center gap-3">
              <img src="/mascot.jpeg" alt="" className="mascot-mini" style={{ width: 40, height: 40 }} />
              <div>
                <div className="text-[17px] font-semibold tracking-wide">
                  {mode === 'login' ? '欢迎回来' : '先占个位置'}
                </div>
                <div className="mt-1 text-[12px]" style={{ color: 'var(--text-mute)' }}>
                  {mode === 'login' ? '命运已经等你很久了。' : '注册完成后，第一个选择池自动就位。'}
                </div>
              </div>
            </div>
          </div>

          <div className="auth-tabs" role="tablist" aria-label="登录或注册">
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'login'}
              data-active={mode === 'login'}
              onClick={() => {
                setMode('login')
                setError('')
              }}
            >
              登录
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'register'}
              data-active={mode === 'register'}
              onClick={() => {
                setMode('register')
                setError('')
              }}
            >
              注册
            </button>
          </div>

          {error && (
            <div className="auth-error" role="alert">
              {error}
            </div>
          )}

          <form onSubmit={submit} className="flex flex-col gap-4">
            <div>
              <label className="field-label" htmlFor="username">
                用户名
              </label>
              <input
                id="username"
                className="input"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder={mode === 'login' ? '输入用户名' : '3–32 位，支持文字和数字'}
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                required
                minLength={mode === 'register' ? 3 : 1}
                maxLength={32}
              />
            </div>
            <div>
              <label className="field-label" htmlFor="password">
                密码
              </label>
              <div className="relative">
                <input
                  id="password"
                  className="input"
                  style={{ paddingRight: 44 }}
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder={mode === 'login' ? '输入密码' : '至少 6 位'}
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  required
                  minLength={mode === 'register' ? 6 : 1}
                  maxLength={128}
                />
                <button
                  type="button"
                  className="icon-btn"
                  style={{ position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)', width: 34, height: 34 }}
                  onClick={() => setShowPassword((value) => !value)}
                  aria-label={showPassword ? '隐藏密码' : '显示密码'}
                  tabIndex={-1}
                >
                  <Icon name={showPassword ? 'eyeOff' : 'eye'} size={16} />
                </button>
              </div>
            </div>

            <button type="submit" className="btn btn-primary btn-lg mt-1 w-full" disabled={busy}>
              {busy && <Icon name="refresh" size={15} className="spin" />}
              {mode === 'login' ? '进入别纠结' : '创建账号'}
            </button>
          </form>

          {mode === 'login' && (
            <>
              <div className="my-5 flex items-center gap-3" aria-hidden="true">
                <div className="glow-line flex-1" />
                <span className="text-[10.5px] uppercase tracking-[0.22em]" style={{ color: 'var(--text-mute)' }}>
                  或者
                </span>
                <div className="glow-line flex-1" />
              </div>
              <button
                type="button"
                className="btn w-full"
                onClick={() => void enterDemo()}
                disabled={demoBusy}
              >
                {demoBusy ? <Icon name="refresh" size={15} className="spin" /> : <Icon name="sparkles" size={15} />}
                用体验账号逛一圈
              </button>
              <p className="mt-3 text-center text-[11px]" style={{ color: 'var(--text-mute)' }}>
                体验账号 demo / demo1234，自带「今天吃什么」
              </p>
            </>
          )}

          <p
            className="mt-6 text-center text-[11px] leading-relaxed"
            style={{ color: 'var(--text-mute)' }}
          >
            每个账号拥有独立数据空间，你的纠结只属于你。
          </p>
        </div>
      </section>
    </div>
  )
}
