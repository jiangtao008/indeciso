import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import type { HistoryRecordDTO } from '@shared/types'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { api } from '../lib/api'
import { formatDateTime, firstChar, MODE_LABEL } from '../lib/utils'
import { Icon } from '../components/icons'
import { ConfirmDialog, Modal } from '../components/Modal'
import { ShareCardModal } from '../components/ShareCardModal'

const PAGE_SIZE = 20

export function HistoryPage() {
  const { pools } = useAuth()
  const toast = useToast()
  const [filter, setFilter] = useState<'all' | string>('all')
  const [records, setRecords] = useState<HistoryRecordDTO[]>([])
  const [total, setTotal] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [detail, setDetail] = useState<HistoryRecordDTO | null>(null)
  const [share, setShare] = useState<HistoryRecordDTO | null>(null)
  const [toDelete, setToDelete] = useState<HistoryRecordDTO | null>(null)
  const [clearOpen, setClearOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const requestToken = useRef(0)

  const load = useCallback(
    async (reset: boolean) => {
      const token = ++requestToken.current
      const poolId = filter === 'all' ? undefined : filter
      if (reset) setLoading(true)
      else setLoadingMore(true)
      try {
        const res = await api.history.list({
          poolId,
          limit: PAGE_SIZE,
          offset: reset ? 0 : records.length,
        })
        if (token !== requestToken.current) return
        setRecords((prev) => (reset ? res.records : [...prev, ...res.records]))
        setTotal(res.total)
        setHasMore(res.hasMore)
      } catch (error) {
        if (token === requestToken.current) toast.fromError(error)
      } finally {
        if (token === requestToken.current) {
          setLoading(false)
          setLoadingMore(false)
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filter, records.length, toast],
  )

  useEffect(() => {
    setRecords([])
    setTotal(0)
    setHasMore(false)
    void load(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter])

  const removeRecord = async () => {
    if (!toDelete) return
    setBusy(true)
    try {
      await api.history.remove(toDelete.id)
      if (detail?.id === toDelete.id) setDetail(null)
      if (share?.id === toDelete.id) setShare(null)
      toast.success('这条记录已经丢给命运了。')
      setToDelete(null)
      await load(true)
    } catch (error) {
      toast.fromError(error)
    } finally {
      setBusy(false)
    }
  }

  const clearAll = async () => {
    setBusy(true)
    try {
      const res = await api.history.clear(filter === 'all' ? undefined : filter)
      setRecords([])
      setTotal(0)
      setHasMore(false)
      setClearOpen(false)
      toast.success(`已清空 ${res.deleted} 条历史记录。`)
    } catch (error) {
      toast.fromError(error)
    } finally {
      setBusy(false)
    }
  }

  const activeFilterName =
    filter === 'all' ? '全部选择池' : (pools.find((pool) => pool.id === filter)?.name ?? '选择池')

  return (
    <div className="page-wrap">
      <div className="page-head">
        <div>
          <span className="eyebrow">Archive · 历史记录</span>
          <h1 className="page-title mt-3" style={{ margin: '12px 0 0' }}>
            命运留下的证据。
          </h1>
          <p className="page-sub">
            每次完整的随机都会保存一条记录，按时间倒序排列。修改候选项不会改变这里的历史快照。
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="chip chip-brand">{total} 条记录</span>
          <button
            type="button"
            className="btn btn-sm btn-danger"
            onClick={() => setClearOpen(true)}
            disabled={total === 0}
          >
            <Icon name="trash" size={14} /> 清空历史
          </button>
        </div>
      </div>

      <div className="mb-5 flex flex-wrap gap-2">
        <button
          type="button"
          className="chip"
          style={
            filter === 'all'
              ? { borderColor: 'var(--brand)', color: 'var(--text)', background: 'var(--brand-soft)' }
              : undefined
          }
          onClick={() => setFilter('all')}
        >
          全部选择池
        </button>
        {pools.map((pool) => (
          <button
            key={pool.id}
            type="button"
            className="chip"
            style={
              filter === pool.id
                ? { borderColor: 'var(--brand)', color: 'var(--text)', background: 'var(--brand-soft)' }
                : undefined
            }
            onClick={() => setFilter(pool.id)}
          >
            <Icon name="layers" size={11} />
            {pool.name}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="history-list">
          {[0, 1, 2].map((index) => (
            <div key={index} className="history-card">
              <div className="skeleton" style={{ width: 220, height: 16 }} />
              <div className="skeleton mt-3" style={{ width: '70%', height: 28 }} />
            </div>
          ))}
        </div>
      ) : records.length === 0 ? (
        <div className="section-card empty-state">
          <img src="/mascot.jpeg" alt="" className="empty-mascot" />
          <h2 style={{ fontSize: '1.5rem', fontWeight: 600, margin: 0 }}>
            {total === 0 ? '这里还没有留下命运的脚印。' : '没有更多记录了。'}
          </h2>
          <p className="muted-copy mx-auto mt-3 max-w-[420px]" style={{ fontSize: 14 }}>
            去首页抽一次，结果会自动保存在这里；不满意的话，历史也不会替你反悔。
          </p>
          <div className="mt-6 flex justify-center gap-2">
            <Link to="/" className="btn btn-primary">
              <Icon name="sparkles" size={15} /> 去随机一次
            </Link>
            <Link to="/settings" className="btn">
              管理选择项
            </Link>
          </div>
        </div>
      ) : (
        <>
          <div className="history-list">
            {records.map((record) => (
              <article key={record.id} className="history-card">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="history-time">{formatDateTime(record.createdAt)}</span>
                      <span className="chip chip-brand">{MODE_LABEL[record.randomMode]}</span>
                      <span className="chip">{record.poolName}</span>
                      <span className="chip">{record.resultCount} 个结果</span>
                    </div>
                    <div className="mt-2.5 text-[15px] font-medium leading-relaxed">
                      {record.results.map((result) => result.title || '（图片项）').join(' · ')}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-1">
                    <button type="button" className="btn btn-sm" onClick={() => setDetail(record)}>
                      详情
                    </button>
                    <button type="button" className="btn btn-sm btn-ghost" onClick={() => setShare(record)}>
                      <Icon name="share" size={13} /> 分享
                    </button>
                    <button
                      type="button"
                      className="icon-btn"
                      style={{ color: 'var(--danger)', width: 30, height: 30 }}
                      title="删除这条记录"
                      aria-label="删除这条记录"
                      onClick={() => setToDelete(record)}
                    >
                      <Icon name="trash" size={14} />
                    </button>
                  </div>
                </div>
                <div className="history-results">
                  {record.results.map((result, index) => (
                    <span className="history-result-chip" key={`${record.id}-${result.itemId}-${index}`}>
                      {result.imageUrl ? (
                        <img src={result.imageUrl} alt="" loading="lazy" />
                      ) : (
                        <span className="ph">{firstChar(result.title)}</span>
                      )}
                      <span className="truncate">{result.title || '（图片项）'}</span>
                    </span>
                  ))}
                </div>
              </article>
            ))}
          </div>

          <div className="mt-6 flex justify-center">
            {hasMore ? (
              <button
                type="button"
                className="btn"
                onClick={() => void load(false)}
                disabled={loadingMore}
              >
                {loadingMore ? <Icon name="refresh" size={14} className="spin" /> : <Icon name="arrowDown" size={14} />}
                加载更多
              </button>
            ) : (
              <span className="chip">已经到底了，命运没有更多安排。</span>
            )}
          </div>
        </>
      )}

      <Modal
        open={detail !== null}
        onClose={() => setDetail(null)}
        title="这次选择的完整记录"
        subtitle={detail ? `${formatDateTime(detail.createdAt)} · ${detail.poolName}` : ''}
        wide
      >
        {detail && (
          <>
            <div className="mb-4 flex flex-wrap gap-2">
              <span className="chip chip-brand">{MODE_LABEL[detail.randomMode]}</span>
              <span className="chip">{detail.resultCount} 个结果</span>
              <span className="chip">{filter === 'all' ? '全部选择池' : activeFilterName}</span>
            </div>
            <div className={detail.results.length === 1 ? 'result-grid single' : 'result-grid'}>
              {detail.results.map((result, index) => (
                <div className="result-card" key={`${result.itemId}-${index}`} style={{ animation: 'none' }}>
                  <div className="result-media">
                    {result.imageUrl ? (
                      <img src={result.imageUrl} alt={result.title} />
                    ) : (
                      <span>{firstChar(result.title)}</span>
                    )}
                  </div>
                  <div className="result-title">{result.title || '（图片项）'}</div>
                </div>
              ))}
            </div>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                className="btn"
                onClick={() => setShare(detail)}
              >
                <Icon name="share" size={15} /> 生成分享卡片
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => setToDelete(detail)}
              >
                <Icon name="trash" size={15} /> 删除记录
              </button>
            </div>
          </>
        )}
      </Modal>

      {share && (
        <ShareCardModal
          open={share !== null}
          onClose={() => setShare(null)}
          poolName={share.poolName}
          results={share.results}
          headline="命运已经安排好了"
          line={`这是 ${formatDateTime(share.createdAt)} 的选择。`}
        />
      )}

      <ConfirmDialog
        open={toDelete !== null}
        title="删除这条历史记录？"
        message="删除后无法恢复。下一轮的「最近结果排除」也会按删除后的记录重新计算。"
        confirmLabel="删除"
        danger
        busy={busy}
        onCancel={() => setToDelete(null)}
        onConfirm={() => void removeRecord()}
      />

      <ConfirmDialog
        open={clearOpen}
        title={`清空${activeFilterName}的历史？`}
        message={`共 ${total} 条记录会被永久删除，无法恢复。选择池和候选项不会受影响。`}
        confirmLabel="全部清空"
        danger
        busy={busy}
        onCancel={() => setClearOpen(false)}
        onConfirm={() => void clearAll()}
      />
    </div>
  )
}
