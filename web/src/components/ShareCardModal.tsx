import { useEffect, useMemo, useRef, useState } from 'react'
import type { ResultSnapshot } from '@shared/types'
import { Modal } from './Modal'
import { Icon } from './icons'
import { useToast } from '../context/ToastContext'
import {
  canvasToBlob,
  renderShareCard,
  shareCardFilename,
  shareCardText,
} from '../lib/shareCard'
import { copyText, downloadBlob } from '../lib/utils'

interface ShareCardModalProps {
  open: boolean
  onClose: () => void
  poolName: string
  results: ResultSnapshot[]
  headline?: string
  line?: string
}

export function ShareCardModal({
  open,
  onClose,
  poolName,
  results,
  headline,
  line,
}: ShareCardModalProps) {
  const toast = useToast()
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [sharing, setSharing] = useState(false)
  const blobRef = useRef<Blob | null>(null)
  const urlRef = useRef<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  const signature = useMemo(
    () => `${poolName}|${headline ?? ''}|${line ?? ''}|${results.map((r) => r.itemId).join(',')}`,
    [poolName, headline, line, results],
  )

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setBusy(true)
    setError('')
    setPreviewUrl(null)
    blobRef.current = null
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current)
      urlRef.current = null
    }

    renderShareCard({ poolName, results, headline, line })
      .then(async (canvas) => {
        const blob = await canvasToBlob(canvas)
        if (cancelled) return
        const url = URL.createObjectURL(blob)
        urlRef.current = url
        blobRef.current = blob
        setPreviewUrl(url)
      })
      .catch(() => {
        if (!cancelled) setError('图片生成失败了，再试一次吧。')
      })
      .finally(() => {
        if (!cancelled) setBusy(false)
      })

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, signature, attempt])

  useEffect(() => {
    return () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current)
    }
  }, [])

  const filename = shareCardFilename(poolName)

  const download = () => {
    const blob = blobRef.current
    if (!blob) return
    downloadBlob(blob, filename)
    toast.success('图片已保存，去分享命运吧。')
  }

  const systemShare = async () => {
    const blob = blobRef.current
    if (!blob) return
    const file = new File([blob], filename, { type: 'image/png' })
    try {
      if (navigator.canShare?.({ files: [file] })) {
        setSharing(true)
        await navigator.share({
          files: [file],
          title: '别纠结 Indeciso',
          text: shareCardText(poolName, results),
        })
        toast.success('已唤起系统分享。')
      } else {
        downloadBlob(blob, filename)
        toast.show('当前浏览器不支持直接分享，图片已为你下载。')
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      toast.error('分享没有成功，试试保存图片吧。')
    } finally {
      setSharing(false)
    }
  }

  const copyShareText = async () => {
    try {
      await copyText(shareCardText(poolName, results))
      toast.success('结果文字已复制。')
    } catch {
      toast.error('复制失败了，再试一次。')
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="生成分享卡片"
      subtitle="1080 × 1920 · PNG · 9:16 竖版，独立渲染，不是截屏。"
      wide
    >
      <div
        style={{
          display: 'grid',
          placeItems: 'center',
          minHeight: 260,
          borderRadius: 22,
          background:
            'radial-gradient(ellipse 70% 70% at 50% 30%, rgba(168,85,247,.14), transparent 70%), var(--surface-input)',
          border: '1px solid var(--line)',
          padding: 16,
          overflow: 'hidden',
        }}
      >
        {busy && (
          <div className="w-full max-w-[220px]">
            <div className="skeleton" style={{ aspectRatio: '9 / 16', borderRadius: 18 }} />
            <p className="mt-3 text-center text-[12px]" style={{ color: 'var(--text-mute)' }}>
              正在排版命运的结果……
            </p>
          </div>
        )}
        {!busy && previewUrl && (
          <img
            src={previewUrl}
            alt="分享卡片预览"
            style={{
              maxHeight: '54vh',
              width: 'auto',
              maxWidth: '100%',
              borderRadius: 16,
              boxShadow: '0 30px 60px -30px rgba(0,0,0,.8)',
            }}
          />
        )}
        {!busy && error && (
          <div className="text-center">
            <p className="text-[13px]" style={{ color: 'var(--danger)' }}>
              {error}
            </p>
            <button
              type="button"
              className="btn btn-sm mt-3"
              onClick={() => setAttempt((value) => value + 1)}
            >
              <Icon name="refresh" size={13} /> 重试
            </button>
          </div>
        )}
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
        <button
          type="button"
          className="btn btn-primary"
          onClick={download}
          disabled={!blobRef.current || busy}
        >
          <Icon name="download" size={15} />
          保存图片
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => void systemShare()}
          disabled={!blobRef.current || busy || sharing}
        >
          {sharing ? <Icon name="refresh" size={15} className="spin" /> : <Icon name="share" size={15} />}
          分享图片
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => void copyShareText()}
        >
          <Icon name="copy" size={15} />
          复制文字
        </button>
      </div>
      <p className="mt-4 text-center text-[11px] leading-relaxed" style={{ color: 'var(--text-mute)' }}>
        分享图片只包含选择池名称与最终结果，不会展示你的账号信息。
      </p>
    </Modal>
  )
}
