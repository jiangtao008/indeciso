import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { TemplateDTO } from '@shared/types'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { api } from '../lib/api'
import { Icon } from '../components/icons'
import { Modal } from '../components/Modal'

export function TemplatesPage() {
  const { pools, activePool, activePoolId, refreshPools, setActivePool } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const [templates, setTemplates] = useState<TemplateDTO[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<TemplateDTO | null>(null)
  const [target, setTarget] = useState<'new' | 'existing'>('new')
  const [name, setName] = useState('')
  const [dedupe, setDedupe] = useState(true)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let alive = true
    api.templates
      .list()
      .then((res) => {
        if (alive) setTemplates(res.templates)
      })
      .catch((error) => toast.fromError(error))
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [toast])

  const openTemplate = (template: TemplateDTO) => {
    setSelected(template)
    setTarget('new')
    setName(template.name)
    setDedupe(true)
  }

  const useTemplate = async () => {
    if (!selected) return
    if (target === 'existing' && !activePoolId) {
      toast.error('先在设置里创建一个选择池，或者在导入时选择新建。')
      return
    }
    setBusy(true)
    try {
      const res = await api.templates.import(selected.id, {
        poolId: target === 'existing' ? activePoolId : null,
        name: target === 'new' ? name.trim() || selected.name : undefined,
        dedupe,
      })
      await refreshPools()
      if (res.created) {
        await setActivePool(res.poolId)
        toast.success(`「${selected.name}」已建好，导入了 ${res.added} 个候选项。`)
      } else {
        toast.success(
          res.skipped > 0
            ? `已追加 ${res.added} 个候选项，跳过 ${res.skipped} 个重复项。`
            : `已追加 ${res.added} 个候选项。`,
        )
      }
      setSelected(null)
      navigate('/settings')
    } catch (error) {
      toast.fromError(error, '模板导入失败了，再试一次。')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page-wrap">
      <div className="page-head">
        <div>
          <span className="eyebrow">Templates · 模板库</span>
          <h1 className="page-title mt-3" style={{ margin: '12px 0 0' }}>
            纠结之前，先抄个作业。
          </h1>
          <p className="page-sub">
            预置场景的候选项一键导入，导进你自己的选择池后可以随意改。公共模板永远保持原样。
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="chip chip-brand">{templates.length} 个模板</span>
          <span className="chip">
            <Icon name="layers" size={12} /> {activePool?.name ?? '尚未选择池'}
          </span>
        </div>
      </div>

      {loading ? (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: 14,
          }}
        >
          {[0, 1, 2, 3].map((index) => (
            <div key={index} className="template-card">
              <div className="skeleton" style={{ width: 52, height: 52, borderRadius: 16 }} />
              <div className="skeleton" style={{ width: 120, height: 20 }} />
              <div className="skeleton" style={{ width: '90%', height: 14 }} />
              <div className="skeleton" style={{ width: '60%', height: 14 }} />
            </div>
          ))}
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))',
            gap: 14,
          }}
        >
          {templates.map((template) => (
            <article key={template.id} className="template-card">
              <div className="flex items-start justify-between gap-3">
                <span className="template-emoji" aria-hidden="true">
                  {template.emoji}
                </span>
                <span className="chip">{template.items.length} 项</span>
              </div>
              <div>
                <h2 className="text-[17px] font-semibold" style={{ margin: 0 }}>
                  {template.name}
                </h2>
                <p className="mt-1.5 text-[12.5px] leading-relaxed" style={{ color: 'var(--text-mute)' }}>
                  {template.description}
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {template.items.slice(0, 6).map((item) => (
                  <span key={item.title} className="chip" style={{ fontSize: 11 }}>
                    {item.title}
                  </span>
                ))}
                {template.items.length > 6 && (
                  <span className="chip" style={{ fontSize: 11 }}>
                    +{template.items.length - 6}
                  </span>
                )}
              </div>
              <div className="mt-auto flex items-center justify-between gap-2 pt-2">
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  onClick={() => openTemplate(template)}
                >
                  查看全部
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-primary"
                  onClick={() => openTemplate(template)}
                >
                  使用模板
                  <Icon name="arrowRight" size={13} />
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      <Modal
        open={selected !== null}
        onClose={() => setSelected(null)}
        title={selected ? `${selected.emoji} ${selected.name}` : ''}
        subtitle={selected?.description}
        wide
      >
        {selected && (
          <>
            <div className="mb-5 flex flex-wrap gap-1.5" style={{ maxHeight: 220, overflow: 'auto' }}>
              {selected.items.map((item) => (
                <span key={item.title} className="chip">
                  {item.title}
                  {item.category ? ` · ${item.category}` : ''}
                </span>
              ))}
            </div>

            <div className="flex flex-col gap-2.5">
              <label
                className="pool-card"
                data-active={target === 'new'}
                style={{ cursor: 'pointer' }}
              >
                <input
                  type="radio"
                  name="import-target"
                  checked={target === 'new'}
                  onChange={() => setTarget('new')}
                />
                <div className="min-w-0 flex-1">
                  <div className="text-[13.5px] font-medium">新建选择池</div>
                  <div className="mt-0.5 text-[11.5px]" style={{ color: 'var(--text-mute)' }}>
                    把模板内容复制到一个全新的选择池里
                  </div>
                </div>
              </label>
              {target === 'new' && (
                <div style={{ paddingLeft: 28 }}>
                  <input
                    className="input"
                    value={name}
                    maxLength={40}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="选择池名称"
                    aria-label="新选择池名称"
                  />
                </div>
              )}

              <label
                className="pool-card"
                data-active={target === 'existing'}
                style={{ cursor: activePoolId ? 'pointer' : 'not-allowed', opacity: activePoolId ? 1 : 0.5 }}
              >
                <input
                  type="radio"
                  name="import-target"
                  checked={target === 'existing'}
                  onChange={() => setTarget('existing')}
                  disabled={!activePoolId}
                />
                <div className="min-w-0 flex-1">
                  <div className="text-[13.5px] font-medium">
                    追加到已有选择池{activePool ? `：${activePool.name}` : ''}
                  </div>
                  <div className="mt-0.5 text-[11.5px]" style={{ color: 'var(--text-mute)' }}>
                    只追加内容，不会未经确认覆盖现有候选项
                  </div>
                </div>
              </label>
            </div>

            <label className="mt-4 flex items-center gap-2 text-[12.5px]" style={{ color: 'var(--text-dim)' }}>
              <input type="checkbox" checked={dedupe} onChange={(event) => setDedupe(event.target.checked)} />
              跳过名称重复的候选项
            </label>

            <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
              <span className="text-[11.5px]" style={{ color: 'var(--text-mute)' }}>
                将导入 {selected.items.length} 个候选项，默认权重 1。
                {target === 'new' && ` 当前共有 ${pools.length} 个选择池。`}
              </span>
              <div className="flex gap-2">
                <button type="button" className="btn" onClick={() => setSelected(null)} disabled={busy}>
                  取消
                </button>
                <button type="button" className="btn btn-primary" onClick={() => void useTemplate()} disabled={busy}>
                  {busy ? <Icon name="refresh" size={14} className="spin" /> : <Icon name="download" size={14} />}
                  确认导入
                </button>
              </div>
            </div>
          </>
        )}
      </Modal>
    </div>
  )
}
