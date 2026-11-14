import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { DEFAULT_POOL_SETTINGS, type DrawDTO, type ItemDTO, type PoolDetail } from '@shared/types'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { api, ApiError } from '../lib/api'
import { EMPTY_CTA, EMPTY_SUB, pickCopy } from '../lib/copy'
import { buildEliminationPlan } from '../lib/elimination'
import type { DrawPhase } from '../lib/types'
import {
  animationDuration,
  cn,
  eliminationRoundMs,
  MODE_LABEL,
  prefersReducedMotion,
  sleep,
} from '../lib/utils'
import { FloatingField } from '../components/FloatingField'
import { DirectReveal } from '../components/draw/DirectReveal'
import { Wheel } from '../components/draw/Wheel'
import { EliminationBoard } from '../components/draw/EliminationBoard'
import { ResultStage, type SaveState } from '../components/draw/ResultStage'
import { ShareCardModal } from '../components/ShareCardModal'
import { Icon } from '../components/icons'

function LoadingCard({ text = '正在召集候选项……' }: { text?: string }) {
  return (
    <div className="center-stage">
      <div className="slot-card" style={{ width: 'min(380px, 78vw)', padding: '34px 26px' }}>
        <Icon name="sparkles" size={26} className="mx-auto" style={{ color: 'var(--brand)' }} />
        <div className="mt-4 text-[15px] font-medium">{text}</div>
        <div className="mt-2 text-[12px]" style={{ color: 'var(--text-mute)' }}>
          别急，命运也需要一点时间。
        </div>
      </div>
    </div>
  )
}

export function HomePage() {
  const { activePoolId, activePool } = useAuth()
  const toast = useToast()
  const [detail, setDetail] = useState<PoolDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [phase, setPhase] = useState<DrawPhase>('idle')
  const [draw, setDraw] = useState<DrawDTO | null>(null)
  const [revealed, setRevealed] = useState(0)
  const [heroLine, setHeroLine] = useState(() => pickCopy('hero'))
  const [animLine, setAnimLine] = useState(() => pickCopy('animating'))
  const [resultLine, setResultLine] = useState(() => pickCopy('result'))
  const [buttonLabel] = useState(() => pickCopy('button'))
  const [againLabel, setAgainLabel] = useState(() => pickCopy('buttonAgain'))
  const [redrawingIndex, setRedrawingIndex] = useState<number | null>(null)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [shareOpen, setShareOpen] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [emptyLine] = useState(() => pickCopy('empty'))
  const runToken = useRef(0)
  const [reduced] = useState(prefersReducedMotion)

  const items = detail?.items ?? []
  const settings = detail?.pool.settings ?? DEFAULT_POOL_SETTINGS
  const isEmpty = !loading && items.length === 0
  const busy = phase === 'preparing' || phase === 'animating'
  const compact = phase === 'revealing' || phase === 'completed'

  const pickedIds = useMemo(() => {
    if (!draw || (phase !== 'revealing' && phase !== 'completed')) return new Set<string>()
    return new Set(draw.results.map((result) => result.itemId))
  }, [draw, phase])

  const eligibleItems = useMemo<ItemDTO[]>(() => {
    if (!draw) return items
    const allow = new Set(draw.eligibleItemIds)
    return items.filter((item) => allow.has(item.id))
  }, [items, draw])

  const loadPool = useCallback(
    async (poolId: string) => {
      setLoading(true)
      try {
        const data = await api.pools.get(poolId)
        setDetail(data)
        setHeroLine(pickCopy('hero'))
      } catch (error) {
        toast.fromError(error, '选择池加载失败了，刷新一下试试。')
        setDetail(null)
      } finally {
        setLoading(false)
      }
    },
    [toast],
  )

  useEffect(() => {
    const token = ++runToken.current
    setPhase('idle')
    setDraw(null)
    setRevealed(0)
    setSaveState('idle')
    setErrorMsg('')
    setShareOpen(false)
    setRedrawingIndex(null)
    if (!activePoolId) {
      setDetail(null)
      setLoading(false)
      return
    }
    void loadPool(activePoolId)
    return () => {
      if (token === runToken.current) runToken.current += 1
    }
  }, [activePoolId, loadPool])

  const saveHistory = useCallback(
    async (drawId: string, token: number) => {
      setSaveState('saving')
      try {
        await api.draws.complete(drawId)
        if (token === runToken.current) setSaveState('saved')
      } catch {
        if (token === runToken.current) {
          setSaveState('failed')
          toast.error('历史记录没能保存，可以点一下重试。')
        }
      }
    },
    [toast],
  )

  const durationFor = useCallback(
    (data: DrawDTO) => {
      if (data.mode === 'elimination') {
        const allow = new Set(data.eligibleItemIds)
        const eligible = items.filter((item) => allow.has(item.id))
        const plan = buildEliminationPlan(eligible, data.results)
        return 420 + plan.rounds.length * eliminationRoundMs(data.animationSpeed) + 320
      }
      return animationDuration(data.mode, data.animationSpeed)
    },
    [items],
  )

  const startDraw = useCallback(async () => {
    if (!activePoolId || busy) return
    if (items.length === 0) {
      toast.error('这里空空如也，先去添加几个选择项吧。')
      return
    }
    if (settings.resultCount > items.length) {
      toast.error(`结果数量不能超过候选项数量（当前 ${items.length} 个），去设置里调整一下吧。`)
      return
    }

    const token = ++runToken.current
    setErrorMsg('')
    setDraw(null)
    setRevealed(0)
    setSaveState('idle')
    setRedrawingIndex(null)
    setShareOpen(false)
    setAnimLine(pickCopy('animating'))
    setPhase('preparing')

    try {
      const data = await api.draws.draw(activePoolId)
      if (token !== runToken.current) return
      setDraw(data)
      setPhase('animating')

      const duration = durationFor(data)
      const copyTimer = window.setInterval(() => {
        if (token === runToken.current) setAnimLine(pickCopy('animating'))
      }, 1600)

      await sleep(reduced ? Math.min(750, duration) : duration)
      window.clearInterval(copyTimer)
      if (token !== runToken.current) return

      setPhase('revealing')
      setResultLine(pickCopy('result'))
      setAgainLabel(pickCopy('buttonAgain'))

      for (let index = 0; index < data.results.length; index++) {
        if (token !== runToken.current) return
        setRevealed(index + 1)
        if (index < data.results.length - 1) {
          await sleep(reduced ? 260 : Math.max(320, data.resultInterval))
        }
      }

      // Let the last card's reveal animation settle before exposing actions,
      // so the "completed" state always matches what is actually visible.
      await sleep(reduced ? 120 : 700)
      if (token !== runToken.current) return
      setPhase('completed')
      void saveHistory(data.drawId, token)
    } catch (error) {
      if (token !== runToken.current) return
      setPhase('error')
      const message =
        error instanceof ApiError ? error.message : '命运暂时失联，请检查网络后再试。'
      setErrorMsg(message)
      toast.error(message)
    }
  }, [activePoolId, busy, durationFor, items.length, reduced, saveHistory, settings.resultCount, toast])

  const handleRedraw = useCallback(
    async (index: number) => {
      if (!draw || redrawingIndex !== null) return
      const token = runToken.current
      setRedrawingIndex(index)
      try {
        const result = await api.draws.redraw(draw.drawId, index)
        if (token !== runToken.current) return
        setDraw({ ...draw, results: result.results })
        setSaveState('saved')
        toast.success('又换了一个，这次相信命运了吗？')
      } catch (error) {
        if (token === runToken.current) toast.fromError(error, '重新抽取失败了，再试一次。')
      } finally {
        if (token === runToken.current) setRedrawingIndex(null)
      }
    },
    [draw, redrawingIndex, toast],
  )

  const retrySave = useCallback(() => {
    if (!draw) return
    void saveHistory(draw.drawId, runToken.current)
  }, [draw, saveHistory])

  const closeResults = useCallback(() => {
    if (draw && saveState === 'failed') {
      void saveHistory(draw.drawId, runToken.current)
    }
    runToken.current += 1
    setPhase('idle')
    setDraw(null)
    setRevealed(0)
    setRedrawingIndex(null)
    setShareOpen(false)
    setSaveState('idle')
  }, [draw, saveHistory, saveState])

  useEffect(() => {
    if (phase !== 'revealing' && phase !== 'completed') return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !shareOpen) closeResults()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [phase, shareOpen, closeResults])

  const heroText = compact
    ? '命运已经安排好了。'
    : phase === 'preparing' || phase === 'animating'
      ? animLine
      : isEmpty
        ? emptyLine
        : heroLine

  const metaText =
    detail?.pool.description ||
    (items.length
      ? `${items.length} 个候选项正在漂浮，等着被命运点名。`
      : '命运需要一个候选名单，才能开始工作。')

  if (!activePoolId && !loading) {
    return (
      <div className="page-wrap">
        <div className="empty-state">
          <img src="/mascot.jpeg" alt="" className="empty-mascot" />
          <h2 className="page-title">还没有选择池</h2>
          <p className="muted-copy mx-auto mt-3 max-w-[420px]" style={{ fontSize: 14 }}>
            先创建一个选择池，把纠结的事情放进去。
          </p>
          <div className="mt-6 flex justify-center gap-2">
            <Link className="btn btn-primary" to="/settings">
              去创建
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="home-root">
      {!isEmpty && (
        <FloatingField items={items} phase={phase} pickedIds={pickedIds} />
      )}
      <div
        className={`stage-veil${phase !== 'idle' && !isEmpty ? ' active' : ''}`}
        aria-hidden="true"
      />

      {!compact && !isEmpty && (
        <div className="hero-copy">
          <span className="eyebrow">Stop overthinking · Indeciso</span>
          <h1 className="hero-title" style={{ margin: '16px 0 0' }}>
            {heroText}
          </h1>
          <div className="hero-meta mt-4">
            {activePool?.name && (
              <span className="chip" style={{ marginRight: 8 }}>
                <Icon name="layers" size={12} />
                {activePool.name}
              </span>
            )}
            <span>{metaText}</span>
          </div>
        </div>
      )}

      <div className="relative z-10 flex flex-1 items-center justify-center px-4 py-4">
        {loading ? (
          <div className="center-stage flex flex-col items-center gap-4">
            <div className="skeleton" style={{ width: 280, height: 74, borderRadius: 22 }} />
            <div className="skeleton" style={{ width: 220, height: 18, borderRadius: 8 }} />
          </div>
        ) : isEmpty ? (
          <div className="empty-state">
            <img src="/mascot.jpeg" alt="" className="empty-mascot" />
            <h2 style={{ fontSize: 'clamp(1.4rem,3vw,2rem)', fontWeight: 600, margin: 0 }}>
              {emptyLine}
            </h2>
            <p className="muted-copy mx-auto mt-3 max-w-[430px]" style={{ fontSize: 14 }}>
              {EMPTY_SUB}
            </p>
            <div className="mt-7 flex flex-wrap justify-center gap-2">
              <Link to="/settings" className="btn btn-primary">
                <Icon name="plus" size={15} />
                {EMPTY_CTA}
              </Link>
              <Link to="/templates" className="btn">
                <Icon name="grid" size={15} />
                从模板开始
              </Link>
            </div>
          </div>
        ) : phase === 'error' ? (
          <div className="center-stage">
            <div className="panel" style={{ padding: 28, textAlign: 'center' }}>
              <div
                className="mx-auto grid h-12 w-12 place-items-center rounded-full"
                style={{ background: 'color-mix(in srgb, var(--danger) 12%, transparent)', color: 'var(--danger)' }}
              >
                <Icon name="alert" size={22} />
              </div>
              <h2 className="mt-4 text-[17px] font-semibold">这次没能完成</h2>
              <p className="muted-copy mx-auto mt-2 max-w-[400px]" style={{ fontSize: 13 }}>
                {errorMsg}
              </p>
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                <button type="button" className="btn btn-primary" onClick={() => void startDraw()}>
                  <Icon name="refresh" size={15} />
                  再试一次
                </button>
                <Link to="/settings" className="btn">
                  去调整设置
                </Link>
              </div>
            </div>
          </div>
        ) : draw && (phase === 'revealing' || phase === 'completed') ? (
          <ResultStage
            draw={draw}
            revealed={revealed}
            phase={phase}
            headline={resultLine}
            line={`从「${draw.pool.name}」里，命运替你选出了 ${draw.results.length} 个结果。`}
            redrawingIndex={redrawingIndex}
            saveState={saveState}
            againLabel={againLabel}
            onRedraw={(index) => void handleRedraw(index)}
            onAgain={() => void startDraw()}
            onShare={() => setShareOpen(true)}
            onRetrySave={retrySave}
            onClose={closeResults}
          />
        ) : phase === 'preparing' ? (
          <LoadingCard text="正在召集候选项……" />
        ) : phase === 'animating' && draw ? (
          reduced ? (
            <LoadingCard text="命运正在计算结果……" />
          ) : draw.mode === 'wheel' ? (
            <Wheel
              items={eligibleItems}
              target={draw.results[0] ?? null}
              spinKey={runToken.current}
              duration={animationDuration('wheel', draw.animationSpeed)}
            />
          ) : draw.mode === 'elimination' ? (
            <EliminationBoard
              items={eligibleItems}
              results={draw.results}
              roundMs={eliminationRoundMs(draw.animationSpeed)}
            />
          ) : (
            <DirectReveal items={eligibleItems} active />
          )
        ) : null}
      </div>

      {(phase === 'idle' || phase === 'error') && !isEmpty && !loading && (
        <div className="home-controls">
          <div className="draw-wrap">
            <div className="draw-halo" aria-hidden="true" />
            <button
              type="button"
              className={cn('draw-button', busy && 'busy')}
              onClick={() => void startDraw()}
              disabled={busy}
              aria-busy={busy}
            >
              {busy ? (
                <>
                  <Icon name="refresh" size={18} className="spin" />
                  命运正在计算…
                </>
              ) : (
                <>
                  {buttonLabel}
                  <Icon name="sparkles" size={18} />
                </>
              )}
              <span className="draw-sub">
                这次抽取 {settings.resultCount} 个结果
              </span>
            </button>
          </div>
          <div className="draw-meta">
            <span className="chip">
              <Icon name={settings.randomMode === 'wheel' ? 'wheel' : settings.randomMode === 'elimination' ? 'shuffle' : 'dice'} size={12} />
              {MODE_LABEL[settings.randomMode]}
            </span>
            <span className="dot" />
            <span>{settings.resultCount} 个结果</span>
            <span className="dot" />
            <span>间隔 {(settings.resultInterval / 1000).toFixed(settings.resultInterval % 1000 ? 1 : 0)}s</span>
            {settings.exclusionEnabled && (
              <>
                <span className="dot" />
                <span>排除最近 {settings.exclusionRounds} 轮</span>
              </>
            )}
          </div>
        </div>
      )}

      {draw && (
        <ShareCardModal
          open={shareOpen}
          onClose={() => setShareOpen(false)}
          poolName={draw.pool.name}
          results={draw.results}
          headline="命运已经安排好了"
          line={resultLine}
        />
      )}
    </div>
  )
}
