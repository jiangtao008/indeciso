import { Link } from 'react-router-dom'
import type { DrawDTO } from '@shared/types'
import type { DrawPhase } from '../../lib/types'
import { Icon } from '../icons'
import { cn, firstChar, MODE_LABEL } from '../../lib/utils'

export type SaveState = 'idle' | 'saving' | 'saved' | 'failed'

interface ResultStageProps {
  draw: DrawDTO
  revealed: number
  phase: DrawPhase
  headline: string
  line: string
  redrawingIndex: number | null
  saveState: SaveState
  againLabel: string
  onRedraw: (index: number) => void
  onAgain: () => void
  onShare: () => void
  onRetrySave: () => void
  onClose: () => void
}

export function ResultStage({
  draw,
  revealed,
  phase,
  headline,
  line,
  redrawingIndex,
  saveState,
  againLabel,
  onRedraw,
  onAgain,
  onShare,
  onRetrySave,
  onClose,
}: ResultStageProps) {
  const results = draw.results.slice(0, Math.max(0, revealed))
  const done = phase === 'completed'
  const single = draw.results.length === 1

  return (
    <div className="center-stage">
      <div className="result-panel" aria-live="polite">
        <button
          type="button"
          className="result-close icon-btn"
          onClick={onClose}
          aria-label="关闭结果"
          title="关闭结果"
        >
          <Icon name="x" size={17} />
        </button>
        <div className="result-headline">
          <span className="chip chip-brand" style={{ marginBottom: 12 }}>
            <Icon name="sparkles" size={12} />
            {MODE_LABEL[draw.mode]} · {draw.pool.name}
          </span>
          <h2>{done ? headline : '正在揭晓……'}</h2>
          <p>{line}</p>
        </div>

        <div className={cn('result-grid', single && 'single')}>
          {results.map((result, index) => (
            <article
              key={`${index}-${result.itemId}`}
              className="result-card"
              style={{ animationDelay: `${Math.min(index, 6) * 60}ms` }}
            >
              <div className="result-media">
                <span className="result-media-fallback" aria-hidden="true">
                  {firstChar(result.title)}
                </span>
                {result.imageUrl && (
                  <img
                    src={result.imageUrl}
                    alt={result.title}
                    loading="eager"
                    onError={(event) => {
                      const img = event.currentTarget
                      img.style.display = 'none'
                    }}
                  />
                )}
              </div>
              <div className="result-title">{result.title || '（只有图片）'}</div>
              {done && (
                <button
                  type="button"
                  className="redraw-btn"
                  onClick={() => onRedraw(index)}
                  disabled={redrawingIndex !== null}
                >
                  {redrawingIndex === index ? (
                    <Icon name="refresh" size={12} className="spin" />
                  ) : (
                    <Icon name="shuffle" size={12} />
                  )}
                  {redrawingIndex === index ? '换一个中…' : '换一个'}
                </button>
              )}
            </article>
          ))}
        </div>

        {revealed < draw.results.length && (
          <div className="result-footnote">
            还有 {draw.results.length - revealed} 个结果，命运正在赶来……
          </div>
        )}

        {done && (
          <>
            <div className="result-actions">
              <button type="button" className="btn btn-primary" onClick={onAgain}>
                <Icon name="refresh" size={15} />
                {againLabel}
              </button>
              <button type="button" className="btn" onClick={onShare}>
                <Icon name="share" size={15} />
                生成分享卡片
              </button>
              <Link to="/history" className="btn btn-ghost">
                <Icon name="history" size={15} />
                历史记录
              </Link>
            </div>
            <div className="result-footnote">
              {saveState === 'saving' && (
                <span className="inline-flex items-center gap-1.5">
                  <Icon name="refresh" size={11} className="spin" /> 正在写入历史记录…
                </span>
              )}
              {saveState === 'saved' && (
                <span className="inline-flex items-center gap-1.5" style={{ color: 'var(--ok)' }}>
                  <Icon name="check" size={11} /> 已写入历史记录 · 单个结果可单独重抽
                </span>
              )}
              {saveState === 'failed' && (
                <span className="inline-flex items-center gap-1.5" style={{ color: 'var(--danger)' }}>
                  历史记录没能保存。
                  <button
                    type="button"
                    className="btn btn-sm"
                    style={{ padding: '3px 8px' }}
                    onClick={onRetrySave}
                  >
                    重试
                  </button>
                </span>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
