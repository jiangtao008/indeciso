export type RandomMode = 'direct' | 'wheel' | 'elimination'
export type AnimationSpeed = 'slow' | 'normal' | 'fast'
export type ThemeName = 'dark' | 'light'

export interface UserDTO {
  id: string
  username: string
  createdAt: string
}

export interface UserSettingsDTO {
  theme: ThemeName
  activePoolId: string | null
}

export interface PoolSettings {
  resultCount: number
  resultInterval: number
  animationSpeed: AnimationSpeed
  randomMode: RandomMode
  exclusionEnabled: boolean
  exclusionRounds: number
}

export const DEFAULT_POOL_SETTINGS: PoolSettings = {
  resultCount: 1,
  resultInterval: 2000,
  animationSpeed: 'normal',
  randomMode: 'direct',
  exclusionEnabled: false,
  exclusionRounds: 1,
}

export interface ItemDTO {
  id: string
  poolId: string
  title: string
  imageUrl: string
  weight: number
  category: string
  tags: string[]
  isFavorite: boolean
  extraData: Record<string, unknown>
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export interface PoolSummary {
  id: string
  name: string
  description: string
  isDefault: boolean
  settings: PoolSettings
  itemCount: number
  createdAt: string
  updatedAt: string
}

export interface PoolDetail {
  pool: PoolSummary
  items: ItemDTO[]
}

export interface ResultSnapshot {
  itemId: string
  title: string
  imageUrl: string
  sortOrder: number
}

export interface HistoryRecordDTO {
  id: string
  poolId: string
  poolName: string
  randomMode: RandomMode
  resultCount: number
  results: ResultSnapshot[]
  createdAt: string
}

export interface DrawDTO {
  drawId: string
  pool: { id: string; name: string }
  mode: RandomMode
  results: ResultSnapshot[]
  eligibleItemIds: string[]
  resultInterval: number
  animationSpeed: AnimationSpeed
}

export interface TemplateItem {
  title: string
  imageUrl?: string
  weight?: number
  category?: string
  tags?: string[]
}

export interface TemplateDTO {
  id: string
  name: string
  description: string
  emoji: string
  accent: string
  items: TemplateItem[]
}

export interface BootstrapDTO {
  user: UserDTO
  settings: UserSettingsDTO
  pools: PoolSummary[]
}

export interface ApiErrorBody {
  error: {
    code: string
    message: string
    details?: unknown
  }
}

export interface ItemInput {
  id?: string
  title: string
  imageUrl: string
  weight: number
  category: string
  tags: string[]
  isFavorite: boolean
}

// Shared editable shape used by the dual-mode editor (table <-> CSV text).
export type EditableItem = ItemInput
