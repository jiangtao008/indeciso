import type {
  ApiErrorBody,
  BootstrapDTO,
  DrawDTO,
  HistoryRecordDTO,
  ItemDTO,
  ItemInput,
  PoolDetail,
  PoolSettings,
  PoolSummary,
  TemplateDTO,
  UserSettingsDTO,
} from '@shared/types'

export class ApiError extends Error {
  code: string
  status: number
  details?: unknown

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
  }
}

const UNAUTHORIZED_EVENT = 'indeciso:unauthorized'
const BASE_URL = import.meta.env.BASE_URL

/** Prefix API paths with the deployment base path, e.g. /indeciso/api/... */
function withBase(path: string): string {
  return path.startsWith('/') ? `${BASE_URL}${path.slice(1)}` : `${BASE_URL}${path}`
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers)
  if (options.body && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json')
  }
  let res: Response
  try {
    res = await fetch(withBase(path), {
      ...options,
      headers,
      credentials: 'include',
    })
  } catch {
    throw new ApiError(0, 'NETWORK', '命运暂时失联，请检查网络后再试。')
  }

  if (res.status === 204) return undefined as T

  let data: unknown = null
  try {
    data = await res.json()
  } catch {
    data = null
  }

  if (!res.ok) {
    const body = data as ApiErrorBody | null
    const error = body?.error
    if (res.status === 401 && !path.startsWith('/api/auth/')) {
      window.dispatchEvent(new Event(UNAUTHORIZED_EVENT))
    }
    throw new ApiError(
      res.status,
      error?.code ?? 'UNKNOWN',
      error?.message ?? '命运暂时失联，请稍后再试。',
      error?.details,
    )
  }
  return data as T
}

export interface HistoryListResponse {
  records: HistoryRecordDTO[]
  total: number
  hasMore: boolean
}

export interface ImportTemplateResponse {
  poolId: string
  pool?: PoolSummary
  created: boolean
  added: number
  skipped: number
}

export interface ItemsSaveResponse {
  pool: PoolSummary
  items: ItemDTO[]
}

export const onUnauthorized = (handler: () => void) => {
  window.addEventListener(UNAUTHORIZED_EVENT, handler)
  return () => window.removeEventListener(UNAUTHORIZED_EVENT, handler)
}

export const api = {
  auth: {
    me: () => request<BootstrapDTO>('/api/auth/me'),
    login: (username: string, password: string) =>
      request<BootstrapDTO>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      }),
    register: (username: string, password: string) =>
      request<BootstrapDTO>('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      }),
    logout: () => request<void>('/api/auth/logout', { method: 'POST' }),
  },
  pools: {
    list: () => request<{ pools: PoolSummary[] }>('/api/pools'),
    get: (id: string) => request<PoolDetail>(`/api/pools/${id}`),
    create: (name: string, description = '') =>
      request<{ pool: PoolSummary }>('/api/pools', {
        method: 'POST',
        body: JSON.stringify({ name, description }),
      }),
    update: (id: string, payload: { name?: string; description?: string }) =>
      request<{ pool: PoolSummary }>(`/api/pools/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }),
    remove: (id: string) => request<BootstrapDTO>(`/api/pools/${id}`, { method: 'DELETE' }),
    setDefault: (id: string) => request<BootstrapDTO>(`/api/pools/${id}/default`, { method: 'POST' }),
    copy: (id: string) =>
      request<{ pool: PoolSummary }>(`/api/pools/${id}/copy`, { method: 'POST' }),
    saveItems: (id: string, items: ItemInput[]) =>
      request<ItemsSaveResponse>(`/api/pools/${id}/items`, {
        method: 'PUT',
        body: JSON.stringify({ items }),
      }),
    saveSettings: (id: string, settings: Partial<PoolSettings>) =>
      request<{ pool: PoolSummary }>(`/api/pools/${id}/settings`, {
        method: 'PUT',
        body: JSON.stringify(settings),
      }),
  },
  draws: {
    draw: (poolId: string, resultCount?: number) =>
      request<DrawDTO>(`/api/pools/${poolId}/draw`, {
        method: 'POST',
        body: JSON.stringify(resultCount ? { resultCount } : {}),
      }),
    redraw: (drawId: string, index: number) =>
      request<{ item: DrawDTO['results'][number]; index: number; results: DrawDTO['results'] }>(
        `/api/draws/${drawId}/redraw`,
        { method: 'POST', body: JSON.stringify({ index }) },
      ),
    complete: (drawId: string) =>
      request<{ history: HistoryRecordDTO; alreadySaved: boolean }>(
        `/api/draws/${drawId}/complete`,
        { method: 'POST' },
      ),
  },
  history: {
    list: (params: { poolId?: string; limit?: number; offset?: number } = {}) => {
      const query = new URLSearchParams()
      if (params.poolId) query.set('poolId', params.poolId)
      if (params.limit) query.set('limit', String(params.limit))
      if (params.offset) query.set('offset', String(params.offset))
      const qs = query.toString()
      return request<HistoryListResponse>(`/api/history${qs ? `?${qs}` : ''}`)
    },
    get: (id: string) => request<{ record: HistoryRecordDTO }>(`/api/history/${id}`),
    remove: (id: string) => request<{ ok: true }>(`/api/history/${id}`, { method: 'DELETE' }),
    clear: (poolId?: string) =>
      request<{ ok: true; deleted: number }>(
        `/api/history${poolId ? `?poolId=${encodeURIComponent(poolId)}` : ''}`,
        { method: 'DELETE' },
      ),
  },
  templates: {
    list: () => request<{ templates: TemplateDTO[] }>('/api/templates'),
    import: (templateId: string, payload: { poolId?: string | null; name?: string; dedupe?: boolean }) =>
      request<ImportTemplateResponse>(`/api/templates/${templateId}/import`, {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
  },
  settings: {
    get: () => request<{ settings: UserSettingsDTO }>('/api/settings'),
    update: (payload: { theme?: 'dark' | 'light'; activePoolId?: string | null }) =>
      request<{ settings: UserSettingsDTO }>('/api/settings', {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }),
  },
  uploads: {
    upload: async (file: File | Blob) => {
      const form = new FormData()
      const name = file instanceof File ? file.name : 'image.webp'
      form.append('image', file, name)
      return request<{ url: string }>('/api/uploads', { method: 'POST', body: form })
    },
  },
}

export function isUnauthorized(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401
}
