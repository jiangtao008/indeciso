import { useMemo, useRef, type ReactNode } from 'react'
import type { CsvRowError } from '@shared/csv'
import { Icon } from './icons'

interface CsvEditorProps {
  value: string
  onChange: (value: string) => void
  errors: CsvRowError[]
}

function fieldClass(index: number): string {
  if (index === 0) return 'csv-hl-title'
  if (index === 1) return 'csv-hl-image'
  if (index === 2) return 'csv-hl-weight'
  return 'csv-hl-other'
}

function highlightLine(line: string, lineNumber: number, hasError: boolean): ReactNode[] {
  const nodes: ReactNode[] = []
  let field = 0
  let buffer = ''
  let inQuotes = false
  let key = 0

  const flush = () => {
    if (buffer) {
      nodes.push(
        <span key={`f${key++}`} className={fieldClass(field)}>
          {buffer}
        </span>,
      )
      buffer = ''
    }
  }

  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    if (char === '"') {
      inQuotes = !inQuotes
      buffer += char
      continue
    }
    if (char === ',' && !inQuotes) {
      flush()
      nodes.push(
        <span key={`p${key++}`} className="csv-hl-punct">
          ,
        </span>,
      )
      field += 1
      continue
    }
    buffer += char
  }
  flush()

  return [
    <div
      key={lineNumber}
      className={hasError ? 'csv-error-line' : undefined}
      style={{ minHeight: 22 }}
    >
      {nodes.length ? nodes : ' '}
    </div>,
  ]
}

export function CsvEditor({ value, onChange, errors }: CsvEditorProps) {
  const gutterRef = useRef<HTMLDivElement | null>(null)
  const highlightRef = useRef<HTMLPreElement | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  const lines = useMemo(() => value.split('\n'), [value])
  const errorLines = useMemo(() => new Set(errors.map((error) => error.line)), [errors])

  const syncScroll = () => {
    const textarea = textareaRef.current
    if (!textarea) return
    if (gutterRef.current) gutterRef.current.scrollTop = textarea.scrollTop
    if (highlightRef.current) {
      highlightRef.current.scrollTop = textarea.scrollTop
      highlightRef.current.scrollLeft = textarea.scrollLeft
    }
  }

  const jumpToLine = (line: number) => {
    const textarea = textareaRef.current
    if (!textarea) return
    const rows = value.split('\n')
    let offset = 0
    for (let i = 0; i < Math.min(line - 1, rows.length); i++) {
      offset += rows[i].length + 1
    }
    textarea.focus()
    textarea.setSelectionRange(offset, offset + (rows[line - 1]?.length ?? 0))
    const lineHeight = 22
    textarea.scrollTop = Math.max(0, (line - 3) * lineHeight)
    syncScroll()
  }

  return (
    <div>
      <div className="csv-shell">
        <div className="csv-gutter" ref={gutterRef} aria-hidden="true">
          {lines.map((_, index) => {
            const lineNumber = index + 1
            return (
              <span
                key={lineNumber}
                className={`lnum${errorLines.has(lineNumber) ? ' error' : ''}`}
              >
                {lineNumber}
              </span>
            )
          })}
        </div>
        <div className="csv-code-wrap">
          <pre className="csv-highlight" ref={highlightRef} aria-hidden="true">
            {lines.map((line, index) =>
              highlightLine(line, index + 1, errorLines.has(index + 1)),
            )}
          </pre>
          <textarea
            ref={textareaRef}
            className="csv-textarea"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onScroll={syncScroll}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            wrap="off"
            aria-label="选择项文本编辑区"
            placeholder={'名称,图片路径\n西红柿炒鸡蛋,\n红烧肉,/uploads/pork.png'}
          />
        </div>
      </div>

      {errors.length > 0 ? (
        <div className="csv-error-list">
          {errors.slice(0, 8).map((error) => (
            <div className="csv-error-item" key={`${error.line}-${error.message}`}>
              <span>第 {error.line} 行：{error.message}</span>
              <button type="button" onClick={() => jumpToLine(error.line)}>
                定位
              </button>
            </div>
          ))}
          {errors.length > 8 && (
            <div className="csv-error-item">还有 {errors.length - 8} 处问题，修正后自动同步。</div>
          )}
        </div>
      ) : (
        <div className="mt-2 flex items-center gap-2 text-[12px]" style={{ color: 'var(--text-mute)' }}>
          <Icon name="check" size={12} style={{ color: 'var(--ok)' }} />
          解析正常，已实时同步到左侧表格
        </div>
      )}
    </div>
  )
}
