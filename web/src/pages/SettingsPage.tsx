import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { formatItemsText, parseItemsText, type CsvRowError } from '@shared/csv'
import {
  DEFAULT_POOL_SETTINGS,
  type EditableItem,
  type ItemDTO,
  type PoolDetail,
  type PoolSettings,
  type PoolSummary,
} from '@shared/types'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { api } from '../lib/api'
import { assetUrl, MASCOT_URL } from '../lib/assets'
import { SAVE_FAIL_COPY } from '../lib/copy'
import { cn, MODE_DESC, MODE_LABEL, SPEED_DESC, SPEED_LABEL } from '../lib/utils'
import { uploadImage, validateImageFile } from '../lib/upload'
import { CsvEditor } from '../components/CsvEditor'
import { ConfirmDialog, Modal } from '../components/Modal'
import { Icon } from '../components/icons'

const EMPTY_ITEM: EditableItem = {
  title: '',
  imageUrl: '',
  weight: 1,
  category: '',
  tags: [],
  isFavorite: false,
}

const INTERVAL_PRESETS = [500, 1000, 1500, 2000, 3000, 5000]

function toEditable(item: ItemDTO): EditableItem {
  return {
    id: item.id,
    title: item.title,
    imageUrl: item.imageUrl,
    weight: item.weight,
    category: item.category,
    tags: item.tags,
    isFavorite: item.isFavorite,
  }
}

function toInput(item: EditableItem) {
  return {
    id: item.id,
    title: item.title.trim(),
    imageUrl: item.imageUrl.trim(),
    weight: Number.isFinite(item.weight) ? item.weight : 1,
    category: item.category.trim(),
    tags: item.tags,
    isFavorite: item.isFavorite,
  }
}

interface PoolFormState {
  mode: 'create' | 'edit'
  id?: string
  name: string
  description: string
}

export function SettingsPage() {
  const {
    activePoolId,
    activePool,
    pools,
    refreshPools,
    setActivePool,
    adoptBootstrap,
  } = useAuth()
  const toast = useToast()
  const location = useLocation()
  const [detail, setDetail] = useState<PoolDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [items, setItems] = useState<EditableItem[]>([])
  const itemsRef = useRef<EditableItem[]>([])
  const [textValue, setTextValue] = useState('')
  const [parseErrors, setParseErrors] = useState<CsvRowError[]>([])
  const [textValid, setTextValid] = useState(true)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [uploadingIndex, setUploadingIndex] = useState<number | null>(null)
  const [settingsDraft, setSettingsDraft] = useState<PoolSettings>(DEFAULT_POOL_SETTINGS)
  const [settingsDirty, setSettingsDirty] = useState(false)
  const [savingSettings, setSavingSettings] = useState(false)
  const [mobileTab, setMobileTab] = useState<'table' | 'text'>('table')
  const [batchOpen, setBatchOpen] = useState(false)
  const [batchText, setBatchText] = useState('')
  const [confirmDeleteIndex, setConfirmDeleteIndex] = useState<number | null>(null)
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const [poolForm, setPoolForm] = useState<PoolFormState | null>(null)
  const [poolFormBusy, setPoolFormBusy] = useState(false)
  const [poolToDelete, setPoolToDelete] = useState<PoolSummary | null>(null)
  const [poolDeleteBusy, setPoolDeleteBusy] = useState(false)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dropIndex, setDropIndex] = useState<number | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const pendingUploadIndex = useRef<number | null>(null)

  useEffect(() => {
    itemsRef.current = items
  }, [items])

  const loadPool = useCallback(
    async (poolId: string) => {
      setLoading(true)
      setLoadError('')
      try {
        const data = await api.pools.get(poolId)
        setDetail(data)
        const editable = data.items.map(toEditable)
        setItems(editable)
        itemsRef.current = editable
        setTextValue(formatItemsText(editable))
        setParseErrors([])
        setTextValid(true)
        setDirty(false)
        setSettingsDraft(data.pool.settings)
        setSettingsDirty(false)
      } catch (error) {
        setLoadError('选择池加载失败了，刷新一下再试试。')
        toast.fromError(error)
      } finally {
        setLoading(false)
      }
    },
    [toast],
  )

  useEffect(() => {
    if (!activePoolId) {
      setLoading(false)
      setDetail(null)
      return
    }
    void loadPool(activePoolId)
  }, [activePoolId, loadPool])

  useEffect(() => {
    if (loading) return
    if (location.hash === '#pools') {
      document.getElementById('pools')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [loading, location.hash])

  useEffect(() => {
    if (!dirty && !settingsDirty) return
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirty, settingsDirty])

  const syncFromItems = useCallback((next: EditableItem[]) => {
    setItems(next)
    itemsRef.current = next
    setTextValue(formatItemsText(next))
    setParseErrors([])
    setTextValid(true)
    setDirty(true)
  }, [])

  const updateItem = (index: number, patch: Partial<EditableItem>) => {
    if (!textValid) {
      toast.show('文本区的错误内容已被表格修改覆盖。')
    }
    const next = items.map((item, i) => (i === index ? { ...item, ...patch } : item))
    syncFromItems(next)
  }

  const handleTextChange = (value: string) => {
    setTextValue(value)
    setDirty(true)
    const parsed = parseItemsText(value)
    setParseErrors(parsed.errors)
    if (parsed.errors.length > 0) {
      setTextValid(false)
      return
    }
    setTextValid(true)
    setItems(parsed.items)
    itemsRef.current = parsed.items
  }

  const resetTextFromTable = () => {
    setTextValue(formatItemsText(items))
    setParseErrors([])
    setTextValid(true)
    toast.success('已按左侧表格重新生成文本。')
  }

  const addRow = () => {
    syncFromItems([...items, { ...EMPTY_ITEM }])
    setMobileTab('table')
  }

  const removeItem = (index: number) => {
    if (!textValid) toast.show('文本区的错误内容已被表格修改覆盖。')
    syncFromItems(items.filter((_, i) => i !== index))
  }

  const moveItem = (from: number, to: number) => {
    if (to < 0 || to >= items.length || from === to) return
    const next = [...items]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    syncFromItems(next)
  }

  const triggerUpload = (index: number) => {
    pendingUploadIndex.current = index
    fileInputRef.current?.click()
  }

  const handleFilePicked = async (file: File | undefined) => {
    const index = pendingUploadIndex.current
    pendingUploadIndex.current = null
    if (!file || index === null) return
    const invalid = validateImageFile(file)
    if (invalid) {
      toast.error(invalid)
      return
    }
    setUploadingIndex(index)
    try {
      const url = await uploadImage(file)
      const latest = itemsRef.current
      const next = latest.map((item, i) => (i === index ? { ...item, imageUrl: url } : item))
      syncFromItems(next)
      toast.success('图片已经放进来了。')
    } catch (error) {
      toast.fromError(error, '这张图片暂时进不来，再试一次吧。')
    } finally {
      setUploadingIndex(null)
    }
  }

  const saveItems = async () => {
    if (!activePoolId) return
    if (!textValid) {
      toast.error('文本区还有错误，先修正再保存。')
      return
    }
    const cleaned = items.filter((item) => item.title.trim() || item.imageUrl.trim())
    if (cleaned.length === 0) {
      toast.error('至少需要一个有效选择项。')
      return
    }
    const badWeight = cleaned.findIndex(
      (item) => !Number.isFinite(item.weight) || item.weight <= 0 || item.weight > 10000,
    )
    if (badWeight >= 0) {
      toast.error(`第 ${badWeight + 1} 个选择项的权重需要大于 0 且不超过 10000。`)
      return
    }
    const badImage = cleaned.findIndex(
      (item) => item.imageUrl && !/^(https?:\/\/|\/)/i.test(item.imageUrl.trim()),
    )
    if (badImage >= 0) {
      toast.error(`第 ${badImage + 1} 个选择项的图片路径不合法。`)
      return
    }

    setSaving(true)
    try {
      const res = await api.pools.saveItems(activePoolId, cleaned.map(toInput))
      const editable = res.items.map(toEditable)
      setDetail({ pool: res.pool, items: res.items })
      setItems(editable)
      itemsRef.current = editable
      setTextValue(formatItemsText(editable))
      setParseErrors([])
      setTextValid(true)
      setDirty(false)
      if (!settingsDirty) setSettingsDraft(res.pool.settings)
      if (res.pool.settings.resultCount !== settingsDraft.resultCount) {
        toast.show(`结果数量已自动调整为 ${res.pool.settings.resultCount}（不能超过候选项数量）。`)
      }
      const blanks = items.length - cleaned.length
      toast.success(blanks > 0 ? `已保存，忽略了 ${blanks} 个空白项。` : '已记住这次修改。')
      void refreshPools()
    } catch (error) {
      toast.fromError(error, SAVE_FAIL_COPY)
    } finally {
      setSaving(false)
    }
  }

  const patchSettings = (patch: Partial<PoolSettings>) => {
    setSettingsDraft((draft) => ({ ...draft, ...patch }))
    setSettingsDirty(true)
  }

  const saveSettingsDraft = async () => {
    if (!activePoolId) return
    const count = Math.round(settingsDraft.resultCount)
    if (!Number.isFinite(count) || count < 1) {
      toast.error('结果数量至少为 1。')
      return
    }
    if (count > Math.max(1, items.length)) {
      toast.error(`结果数量不能超过候选项数量（当前 ${items.length} 个）。`)
      return
    }
    if (
      !Number.isFinite(settingsDraft.resultInterval) ||
      settingsDraft.resultInterval < 300 ||
      settingsDraft.resultInterval > 60000
    ) {
      toast.error('结果间隔需要在 300ms 到 60000ms 之间。')
      return
    }
    setSavingSettings(true)
    try {
      const res = await api.pools.saveSettings(activePoolId, {
        ...settingsDraft,
        resultCount: count,
        resultInterval: Math.round(settingsDraft.resultInterval),
      })
      setSettingsDraft(res.pool.settings)
      setSettingsDirty(false)
      setDetail((prev) => (prev ? { ...prev, pool: res.pool } : prev))
      toast.success('随机配置已保存，下一轮就生效。')
      void refreshPools()
    } catch (error) {
      toast.fromError(error, SAVE_FAIL_COPY)
    } finally {
      setSavingSettings(false)
    }
  }

  const batchPreview = useMemo(() => parseItemsText(batchText), [batchText])

  const applyBatch = () => {
    if (!batchText.trim()) {
      toast.error('先输入点内容吧。')
      return
    }
    if (batchPreview.errors.length > 0) return
    if (batchPreview.items.length === 0) {
      toast.error('没有解析出有效的选择项。')
      return
    }
    if (!textValid) toast.show('文本区的错误内容已被批量添加覆盖。')
    syncFromItems([...items, ...batchPreview.items])
    setBatchOpen(false)
    setBatchText('')
    toast.success(`已批量添加 ${batchPreview.items.length} 个选择项，记得保存。`)
  }

  const savePoolForm = async () => {
    if (!poolForm) return
    const name = poolForm.name.trim()
    if (!name) {
      toast.error('选择池需要一个名字。')
      return
    }
    setPoolFormBusy(true)
    try {
      if (poolForm.mode === 'create') {
        const res = await api.pools.create(name, poolForm.description.trim())
        await refreshPools()
        await setActivePool(res.pool.id)
        toast.success('新的选择池建好了，先放几个候选项进去吧。')
      } else if (poolForm.id) {
        const res = await api.pools.update(poolForm.id, {
          name,
          description: poolForm.description.trim(),
        })
        setDetail((prev) => (prev && prev.pool.id === res.pool.id ? { ...prev, pool: res.pool } : prev))
        await refreshPools()
        toast.success('选择池信息已更新。')
      }
      setPoolForm(null)
    } catch (error) {
      toast.fromError(error)
    } finally {
      setPoolFormBusy(false)
    }
  }

  const deletePool = async () => {
    if (!poolToDelete) return
    setPoolDeleteBusy(true)
    try {
      const bootstrap = await api.pools.remove(poolToDelete.id)
      adoptBootstrap(bootstrap)
      toast.success('选择池已删除，历史记录快照仍然保留。')
      setPoolToDelete(null)
    } catch (error) {
      toast.fromError(error)
    } finally {
      setPoolDeleteBusy(false)
    }
  }

  const copyPool = async (pool: PoolSummary) => {
    try {
      await api.pools.copy(pool.id)
      await refreshPools()
      toast.success('已复制出一份独立副本。')
    } catch (error) {
      toast.fromError(error)
    }
  }

  const makeDefault = async (pool: PoolSummary) => {
    try {
      const bootstrap = await api.pools.setDefault(pool.id)
      adoptBootstrap(bootstrap)
      toast.success(`「${pool.name}」现在是默认选择池了。`)
    } catch (error) {
      toast.fromError(error)
    }
  }

  if (loading) {
    return (
      <div className="page-wrap">
        <div className="page-head">
          <div>
            <div className="skeleton" style={{ width: 120, height: 12 }} />
            <div className="skeleton mt-3" style={{ width: 260, height: 34 }} />
          </div>
        </div>
        <div className="section-card" style={{ marginBottom: 18 }}>
          <div className="skeleton" style={{ height: 160, borderRadius: 18 }} />
        </div>
        <div className="section-card">
          <div className="skeleton" style={{ height: 420, borderRadius: 18 }} />
        </div>
      </div>
    )
  }

  if (!activePoolId || !detail) {
    return (
      <div className="page-wrap">
        <div className="empty-state">
          <img src={MASCOT_URL} alt="" className="empty-mascot" />
          <h1 className="page-title">还没有可编辑的选择池</h1>
          <p className="muted-copy mx-auto mt-3 max-w-[420px]" style={{ fontSize: 14 }}>
            {loadError || '先创建一个选择池，命运才有地方安放你的纠结。'}
          </p>
          <div className="mt-6 flex justify-center gap-2">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setPoolForm({ mode: 'create', name: '', description: '' })}
            >
              <Icon name="plus" size={15} /> 新建选择池
            </button>
            <Link to="/templates" className="btn">
              从模板开始
            </Link>
          </div>
        </div>
        <PoolFormModal
          form={poolForm}
          busy={poolFormBusy}
          onClose={() => setPoolForm(null)}
          onChange={setPoolForm}
          onSave={() => void savePoolForm()}
        />
      </div>
    )
  }

  const settings = settingsDraft

  return (
    <div className="page-wrap">
      <div className="page-head">
        <div>
          <span className="eyebrow">Workspace · 设置中心</span>
          <h1 className="page-title mt-3" style={{ margin: '12px 0 0' }}>
            把纠结，安排明白。
          </h1>
          <p className="page-sub">
            左侧表格和右侧文本共用同一份数据；改哪边都算数，保存前记得看一眼。
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {dirty && <span className="chip chip-gold">选择项有未保存的修改</span>}
          {settingsDirty && <span className="chip chip-gold">配置有未保存的修改</span>}
          <span className="chip">
            <Icon name="layers" size={12} />
            {activePool?.name}
          </span>
        </div>
      </div>

      <section className="section-card" id="pools" style={{ marginBottom: 18 }}>
        <div className="section-head">
          <div>
            <h2 className="section-title">
              <span className="section-index">00</span>
              选择池
            </h2>
            <p className="page-sub" style={{ marginTop: 6 }}>
              每个选择池拥有自己的候选项、随机配置和历史记录。
            </p>
          </div>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => setPoolForm({ mode: 'create', name: '', description: '' })}
          >
            <Icon name="plus" size={14} /> 新建选择池
          </button>
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
            gap: 12,
          }}
        >
          {pools.map((pool) => (
            <div
              key={pool.id}
              className="pool-card"
              data-active={pool.id === activePoolId}
              style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}
            >
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className="truncate text-left text-[14px] font-semibold"
                  style={{ background: 'none', border: 0, color: 'var(--text)', padding: 0, cursor: 'pointer' }}
                  onClick={() => {
                    setMobileTab('table')
                    void setActivePool(pool.id)
                  }}
                  title="切换到这个选择池"
                >
                  {pool.name}
                </button>
                {pool.isDefault && <span className="chip chip-gold">默认</span>}
                {pool.id === activePoolId && <span className="chip chip-brand">当前</span>}
              </div>
              <div className="text-[11.5px]" style={{ color: 'var(--text-mute)' }}>
                {pool.itemCount} 个候选项 · {MODE_LABEL[pool.settings.randomMode]}
              </div>
              {pool.description && (
                <div className="truncate text-[11.5px]" style={{ color: 'var(--text-mute)' }}>
                  {pool.description}
                </div>
              )}
              <div
                className="mt-1 flex flex-wrap items-center justify-between gap-1 border-t pt-2"
                style={{ borderColor: 'var(--line)' }}
              >
                <div className="flex flex-wrap items-center gap-1">
                  {pool.id !== activePoolId ? (
                    <button
                      type="button"
                      className="btn btn-sm"
                      onClick={() => void setActivePool(pool.id)}
                    >
                      <Icon name="arrowRight" size={13} /> 切换使用
                    </button>
                  ) : (
                    <span className="chip chip-brand">使用中</span>
                  )}
                </div>
                <div className="flex items-center gap-0.5">
                  {!pool.isDefault && (
                    <button
                      type="button"
                      className="icon-btn"
                      title="设为默认选择池"
                      aria-label="设为默认选择池"
                      onClick={() => void makeDefault(pool)}
                    >
                      <Icon name="trophy" size={15} />
                    </button>
                  )}
                  <button
                    type="button"
                    className="icon-btn"
                    title="编辑名称与描述"
                    aria-label="编辑选择池"
                    onClick={() =>
                      setPoolForm({
                        mode: 'edit',
                        id: pool.id,
                        name: pool.name,
                        description: pool.description,
                      })
                    }
                  >
                    <Icon name="pencil" size={15} />
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    title="复制选择池"
                    aria-label="复制选择池"
                    onClick={() => void copyPool(pool)}
                  >
                    <Icon name="copy" size={15} />
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    title="删除选择池"
                    aria-label="删除选择池"
                    style={{ color: 'var(--danger)' }}
                    onClick={() => setPoolToDelete(pool)}
                  >
                    <Icon name="trash" size={15} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="section-card" style={{ marginBottom: 18 }}>
        <div className="section-head">
          <div>
            <h2 className="section-title">
              <span className="section-index">01</span>
              选择项管理
            </h2>
            <p className="page-sub" style={{ marginTop: 6 }}>
              支持文字、图片或两者组合。拖动手柄排序，权重决定被抽中的比例。
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="btn btn-sm" onClick={() => setBatchOpen(true)}>
              <Icon name="grid" size={14} /> 批量添加
            </button>
            <button type="button" className="btn btn-sm" onClick={addRow}>
              <Icon name="plus" size={14} /> 添加选择项
            </button>
            <button
              type="button"
              className="btn btn-sm btn-primary"
              onClick={() => void saveItems()}
              disabled={saving || !dirty || !textValid}
            >
              {saving ? <Icon name="refresh" size={14} className="spin" /> : <Icon name="check" size={14} />}
              保存选择项
            </button>
          </div>
        </div>

        <div className="mb-3 lg:hidden">
          <div className="segmented">
            <button type="button" data-active={mobileTab === 'table'} onClick={() => setMobileTab('table')}>
              表格编辑
            </button>
            <button type="button" data-active={mobileTab === 'text'} onClick={() => setMobileTab('text')}>
              文本编辑
            </button>
          </div>
        </div>

        <div className="editor-grid">
          <div className={mobileTab === 'table' ? '' : 'hidden lg:block'}>
            <div className="mb-2 flex items-center justify-between gap-3">
              <span className="field-label" style={{ margin: 0 }}>
                可视化表格
              </span>
              <span className="chip">{items.length} 项</span>
            </div>
            <div className="items-table-shell" style={{ maxHeight: 540, overflow: 'auto' }}>
              <table className="items-table">
                <thead>
                  <tr>
                    <th style={{ width: 28 }} aria-label="排序" />
                    <th style={{ width: 38 }}>#</th>
                    <th>文字内容</th>
                    <th style={{ width: 120 }}>图片</th>
                    <th style={{ width: 76 }}>权重</th>
                    <th style={{ width: 96 }}>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, index) => (
                    <tr
                      key={index}
                      className={cn(
                        dragIndex === index && 'dragging',
                        dropIndex === index && dragIndex !== null && dragIndex !== index && 'drop-target',
                      )}
                      onDragOver={(event) => {
                        if (dragIndex === null) return
                        event.preventDefault()
                        setDropIndex(index)
                      }}
                      onDrop={(event) => {
                        event.preventDefault()
                        if (dragIndex !== null) moveItem(dragIndex, index)
                        setDragIndex(null)
                        setDropIndex(null)
                      }}
                    >
                      <td>
                        <span
                          className="row-handle"
                          draggable
                          onDragStart={(event) => {
                            event.dataTransfer.effectAllowed = 'move'
                            setDragIndex(index)
                          }}
                          onDragEnd={() => {
                            setDragIndex(null)
                            setDropIndex(null)
                          }}
                          title="拖动排序"
                          aria-label="拖动排序"
                        >
                          <Icon name="grip" size={15} />
                        </span>
                      </td>
                      <td>
                        <span className="row-num">{index + 1}</span>
                      </td>
                      <td>
                        <input
                          className="cell-input"
                          value={item.title}
                          onChange={(event) => updateItem(index, { title: event.target.value })}
                          placeholder={item.imageUrl ? '可以只放图片' : '输入名称'}
                          aria-label={`第 ${index + 1} 项名称`}
                          maxLength={120}
                        />
                      </td>
                      <td>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            className="thumb-btn"
                            onClick={() => triggerUpload(index)}
                            title={item.imageUrl ? '替换图片' : '上传图片'}
                            aria-label={item.imageUrl ? '替换图片' : '上传图片'}
                          >
                            {uploadingIndex === index ? (
                              <Icon name="refresh" size={16} className="spin" />
                            ) : item.imageUrl ? (
                              <img src={assetUrl(item.imageUrl)} alt="" />
                            ) : (
                              <Icon name="image" size={17} />
                            )}
                          </button>
                          {item.imageUrl && (
                            <button
                              type="button"
                              className="icon-btn"
                              style={{ width: 26, height: 26 }}
                              title="移除图片"
                              aria-label="移除图片"
                              onClick={() => updateItem(index, { imageUrl: '' })}
                            >
                              <Icon name="x" size={13} />
                            </button>
                          )}
                        </div>
                      </td>
                      <td>
                        <input
                          className="cell-input weight"
                          type="number"
                          min={0.1}
                          step={0.1}
                          value={Number.isFinite(item.weight) ? item.weight : ''}
                          onChange={(event) =>
                            updateItem(index, { weight: Number(event.target.value) })
                          }
                          aria-label={`第 ${index + 1} 项权重`}
                        />
                      </td>
                      <td>
                        <div className="flex items-center gap-0.5">
                          <button
                            type="button"
                            className="icon-btn"
                            style={{ width: 26, height: 26 }}
                            title="上移"
                            aria-label="上移"
                            onClick={() => moveItem(index, index - 1)}
                            disabled={index === 0}
                          >
                            <Icon name="arrowUp" size={13} />
                          </button>
                          <button
                            type="button"
                            className="icon-btn"
                            style={{ width: 26, height: 26 }}
                            title="下移"
                            aria-label="下移"
                            onClick={() => moveItem(index, index + 1)}
                            disabled={index === items.length - 1}
                          >
                            <Icon name="arrowDown" size={13} />
                          </button>
                          <button
                            type="button"
                            className="icon-btn"
                            style={{ width: 26, height: 26, color: 'var(--danger)' }}
                            title="删除"
                            aria-label="删除选择项"
                            onClick={() => setConfirmDeleteIndex(index)}
                          >
                            <Icon name="trash" size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {items.length === 0 && (
                <div className="empty-table">
                  还没有选择项。点击「添加选择项」或「批量添加」开始吧。
                </div>
              )}
            </div>
          </div>

          <div className={mobileTab === 'text' ? '' : 'hidden lg:block'}>
            <div className="mb-2 flex items-center justify-between gap-3">
              <span className="field-label" style={{ margin: 0 }}>
                文本编辑（CSV）
              </span>
              <div className="flex items-center gap-2">
                <span className="chip">{textValid ? '已同步' : '有错误'}</span>
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  onClick={resetTextFromTable}
                  title="用表格内容覆盖文本区"
                >
                  <Icon name="refresh" size={13} /> 重置
                </button>
              </div>
            </div>
            <CsvEditor value={textValue} onChange={handleTextChange} errors={parseErrors} />
            {!textValid && (
              <div className="sync-banner mt-3">
                <Icon name="alert" size={14} style={{ flexShrink: 0, marginTop: 2 }} />
                <span>
                  文本区有错误，已暂停同步到表格，保存按钮暂时关闭。修正后会自动恢复；原有数据没有被覆盖。
                </span>
              </div>
            )}
            <p className="mt-2 text-[11px] leading-relaxed" style={{ color: 'var(--text-mute)' }}>
              格式：名称,图片路径,权重,分类,标签,收藏。表头可省略；字段里包含逗号或引号时用双引号包住，
              例如 "宫保鸡丁,微辣",/uploads/a.png。新增字段只会向后追加。
            </p>
          </div>
        </div>

        {dirty && (
          <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl border px-4 py-3" style={{ borderColor: 'var(--line)' }}>
            <span className="text-[12px]" style={{ color: 'var(--text-mute)' }}>
              有未保存的修改，离开页面前记得保存。
            </span>
            <div className="flex gap-2">
              <button type="button" className="btn btn-sm" onClick={() => setConfirmDiscard(true)}>
                放弃修改
              </button>
              <button
                type="button"
                className="btn btn-sm btn-primary"
                onClick={() => void saveItems()}
                disabled={saving || !textValid}
              >
                保存
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="section-card" style={{ marginBottom: 18 }}>
        <div className="section-head">
          <div>
            <h2 className="section-title">
              <span className="section-index">02</span>
              随机配置
            </h2>
            <p className="page-sub" style={{ marginTop: 6 }}>
              这些配置只对「{activePool?.name}」生效，保存后下一轮随机立即使用。
            </p>
          </div>
          <button
            type="button"
            className="btn btn-sm btn-primary"
            onClick={() => void saveSettingsDraft()}
            disabled={savingSettings || !settingsDirty}
          >
            {savingSettings ? <Icon name="refresh" size={14} className="spin" /> : <Icon name="check" size={14} />}
            保存随机配置
          </button>
        </div>

        <div className="config-grid">
          <div className="rounded-2xl border p-4" style={{ borderColor: 'var(--line)', background: 'var(--surface-input)' }}>
            <label className="field-label" htmlFor="result-count">
              随机结果数量
            </label>
            <div className="flex items-center gap-3">
              <input
                id="result-count"
                type="number"
                className="input"
                style={{ width: 110 }}
                min={1}
                max={Math.max(1, items.length)}
                value={settings.resultCount}
                onChange={(event) => patchSettings({ resultCount: Number(event.target.value) })}
              />
              <div className="flex gap-1">
                {[1, 2, 3, 5].map((value) => (
                  <button
                    key={value}
                    type="button"
                    className="chip"
                    data-active={settings.resultCount === value}
                    onClick={() => patchSettings({ resultCount: value })}
                    style={
                      settings.resultCount === value
                        ? { borderColor: 'var(--brand)', color: 'var(--text)' }
                        : undefined
                    }
                  >
                    {value}
                  </button>
                ))}
              </div>
            </div>
            <p className="mt-2 text-[11.5px]" style={{ color: 'var(--text-mute)' }}>
              最多 {Math.max(1, items.length)} 个，同一次不会重复抽取。
            </p>
          </div>

          <div className="rounded-2xl border p-4" style={{ borderColor: 'var(--line)', background: 'var(--surface-input)' }}>
            <label className="field-label" htmlFor="result-interval">
              结果出现间隔（毫秒）
            </label>
            <div className="flex items-center gap-2">
              <input
                id="result-interval"
                type="number"
                className="input"
                style={{ width: 130 }}
                min={300}
                max={60000}
                step={100}
                value={settings.resultInterval}
                onChange={(event) => patchSettings({ resultInterval: Number(event.target.value) })}
              />
              <span className="text-[12px]" style={{ color: 'var(--text-mute)' }}>
                ≈ {(settings.resultInterval / 1000).toFixed(1)} 秒
              </span>
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {INTERVAL_PRESETS.map((value) => (
                <button
                  key={value}
                  type="button"
                  className="chip"
                  onClick={() => patchSettings({ resultInterval: value })}
                  style={
                    settings.resultInterval === value
                      ? { borderColor: 'var(--brand)', color: 'var(--text)' }
                      : undefined
                  }
                >
                  {value >= 1000 ? `${value / 1000}s` : `${value}ms`}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border p-4" style={{ borderColor: 'var(--line)', background: 'var(--surface-input)' }}>
            <span className="field-label">动画速度</span>
            <div className="segmented w-full" style={{ display: 'flex' }}>
              {(['slow', 'normal', 'fast'] as const).map((speed) => (
                <button
                  key={speed}
                  type="button"
                  data-active={settings.animationSpeed === speed}
                  onClick={() => patchSettings({ animationSpeed: speed })}
                  style={{ flex: 1 }}
                  title={SPEED_DESC[speed]}
                >
                  {SPEED_LABEL[speed]}
                </button>
              ))}
            </div>
            <p className="mt-2 text-[11.5px]" style={{ color: 'var(--text-mute)' }}>
              {SPEED_DESC[settings.animationSpeed]}
            </p>
          </div>

          <div className="rounded-2xl border p-4" style={{ borderColor: 'var(--line)', background: 'var(--surface-input)' }}>
            <span className="field-label">动画模式</span>
            <div className="flex gap-1">
              {(['direct', 'wheel', 'elimination'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  className="chip"
                  onClick={() => patchSettings({ randomMode: mode })}
                  style={
                    settings.randomMode === mode
                      ? { borderColor: 'var(--brand)', color: 'var(--text)' }
                      : undefined
                  }
                >
                  <Icon name={mode === 'wheel' ? 'wheel' : mode === 'elimination' ? 'shuffle' : 'dice'} size={12} />
                  {MODE_LABEL[mode]}
                </button>
              ))}
            </div>
            <p className="mt-2 text-[11.5px]" style={{ color: 'var(--text-mute)' }}>
              {MODE_DESC[settings.randomMode]}
            </p>
          </div>
        </div>

        <div className="mt-4 rounded-2xl border p-4" style={{ borderColor: 'var(--line)', background: 'var(--surface-input)' }}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-[13.5px] font-medium">排除最近结果</div>
              <p className="mt-1 text-[11.5px]" style={{ color: 'var(--text-mute)' }}>
                避免短时间内反复抽到相同的候选项。只统计已成功完成的轮次。
              </p>
            </div>
            <button
              type="button"
              className="toggle"
              data-on={settings.exclusionEnabled}
              onClick={() => patchSettings({ exclusionEnabled: !settings.exclusionEnabled })}
              aria-pressed={settings.exclusionEnabled}
              aria-label="启用排除最近结果"
            />
          </div>
          {settings.exclusionEnabled && (
            <div className="mt-3 flex items-center gap-2 text-[12.5px]" style={{ color: 'var(--text-dim)' }}>
              排除最近
              <input
                type="number"
                className="input"
                style={{ width: 76 }}
                min={1}
                max={50}
                value={settings.exclusionRounds}
                onChange={(event) => patchSettings({ exclusionRounds: Number(event.target.value) })}
                aria-label="排除最近轮数"
              />
              轮出现过的候选项
            </div>
          )}
          <div className="mt-3 grid gap-1 text-[11px] leading-relaxed" style={{ color: 'var(--text-mute)' }}>
            <span>· 先排除，再按权重抽取；候选项不足时会明确提示，不会悄悄放宽规则。</span>
            <span>· 权重只影响概率，不影响显示顺序。</span>
          </div>
        </div>
      </section>

      <section className="section-card">
        <div className="section-head" style={{ marginBottom: 0 }}>
          <div>
            <h2 className="section-title">
              <span className="section-index">03</span>
              模板库
            </h2>
            <p className="page-sub" style={{ marginTop: 6 }}>
              懒得一个个输入？从「今天吃什么」这类模板开始，导入后还能继续编辑。
            </p>
          </div>
          <Link to="/templates" className="btn btn-sm">
            <Icon name="grid" size={14} /> 打开模板库
          </Link>
        </div>
      </section>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        hidden
        onChange={(event) => {
          void handleFilePicked(event.target.files?.[0])
          event.target.value = ''
        }}
      />

      <Modal
        open={batchOpen}
        onClose={() => setBatchOpen(false)}
        title="批量添加选择项"
        subtitle="每行一个。可以是纯名称，也可以是「名称,图片路径」CSV。"
      >
        <textarea
          className="textarea"
          rows={9}
          value={batchText}
          onChange={(event) => setBatchText(event.target.value)}
          placeholder={'火锅\n烧烤\n日式拉面\n"宫保鸡丁,微辣",/uploads/a.png'}
          style={{ resize: 'vertical', fontFamily: '"SFMono-Regular", Menlo, monospace', fontSize: 13 }}
        />
        <div className="mt-3">
          {batchPreview.errors.length > 0 ? (
            <div className="csv-error-list">
              {batchPreview.errors.slice(0, 4).map((error) => (
                <div className="csv-error-item" key={`${error.line}-${error.message}`}>
                  第 {error.line} 行：{error.message}
                </div>
              ))}
            </div>
          ) : (
            <div className="csv-ok">
              <Icon name="check" size={13} /> 将添加 {batchPreview.items.length} 个选择项
            </div>
          )}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="btn" onClick={() => setBatchOpen(false)}>
            取消
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={applyBatch}
            disabled={batchPreview.errors.length > 0 || batchPreview.items.length === 0}
          >
            <Icon name="plus" size={15} /> 添加到当前池
          </button>
        </div>
      </Modal>

      <ConfirmDialog
        open={confirmDeleteIndex !== null}
        title="删除这个选择项？"
        message={
          confirmDeleteIndex !== null ? (
            <>
              将移除「{items[confirmDeleteIndex]?.title || '这张图片'}」。
              历史记录中的结果快照不会受影响；保存后才会真正生效。
            </>
          ) : (
            ''
          )
        }
        confirmLabel="删除"
        danger
        onCancel={() => setConfirmDeleteIndex(null)}
        onConfirm={() => {
          if (confirmDeleteIndex !== null) removeItem(confirmDeleteIndex)
          setConfirmDeleteIndex(null)
        }}
      />

      <ConfirmDialog
        open={confirmDiscard}
        title="放弃未保存的修改？"
        message="当前选择项会恢复为上次保存的版本，已编辑的内容会丢失。"
        confirmLabel="放弃修改"
        danger
        onCancel={() => setConfirmDiscard(false)}
        onConfirm={() => {
          setConfirmDiscard(false)
          if (activePoolId) void loadPool(activePoolId)
          setSettingsDirty(false)
        }}
      />

      <ConfirmDialog
        open={poolToDelete !== null}
        title={`删除「${poolToDelete?.name ?? ''}」？`}
        message="选择池里的候选项会一起删除。已经产生的历史记录会通过快照保留，不会丢失。"
        confirmLabel="删除选择池"
        danger
        busy={poolDeleteBusy}
        onCancel={() => setPoolToDelete(null)}
        onConfirm={() => void deletePool()}
      />

      <PoolFormModal
        form={poolForm}
        busy={poolFormBusy}
        onClose={() => setPoolForm(null)}
        onChange={setPoolForm}
        onSave={() => void savePoolForm()}
      />
    </div>
  )
}

function PoolFormModal({
  form,
  busy,
  onClose,
  onChange,
  onSave,
}: {
  form: PoolFormState | null
  busy: boolean
  onClose: () => void
  onChange: (form: PoolFormState) => void
  onSave: () => void
}) {
  return (
    <Modal
      open={form !== null}
      onClose={onClose}
      title={form?.mode === 'edit' ? '编辑选择池' : '新建选择池'}
      subtitle={form?.mode === 'edit' ? '名称和描述只会影响显示。' : '比如：今天吃什么、周末去哪玩。'}
    >
      {form && (
        <div className="flex flex-col gap-4">
          <div>
            <label className="field-label" htmlFor="pool-name">
              名称
            </label>
            <input
              id="pool-name"
              className="input"
              value={form.name}
              maxLength={40}
              autoFocus
              onChange={(event) => onChange({ ...form, name: event.target.value })}
              placeholder="比如：今天吃什么"
            />
          </div>
          <div>
            <label className="field-label" htmlFor="pool-desc">
              描述（可选）
            </label>
            <textarea
              id="pool-desc"
              className="textarea"
              rows={3}
              value={form.description}
              maxLength={200}
              onChange={(event) => onChange({ ...form, description: event.target.value })}
              placeholder="一句话说明这个选择池是干嘛的。"
              style={{ resize: 'vertical' }}
            />
          </div>
          <div className="mt-1 flex justify-end gap-2">
            <button type="button" className="btn" onClick={onClose} disabled={busy}>
              取消
            </button>
            <button type="button" className="btn btn-primary" onClick={onSave} disabled={busy}>
              {busy ? <Icon name="refresh" size={14} className="spin" /> : <Icon name="check" size={14} />}
              {form.mode === 'edit' ? '保存' : '创建'}
            </button>
          </div>
        </div>
      )}
    </Modal>
  )
}
