export type Role = 'author' | 'examiner' | 'viewer'

/** 特征与说明书段落支持关系的核对状态 */
export type SupportStatusKind = 'full' | 'partial' | 'amendment' | 'review'

export interface Claim {
  id: string
  number: number
  title: string
  text: string
  independent: boolean
}

export interface Paragraph {
  id: string
  section: string
  text: string
}

export interface Feature {
  id: string
  claimId: string
  label: string
  text: string
  parentId: string | null
  referenceIds: string[]
  supportIds: string[]
  ownerRole: Role
}

/**
 * 一条“技术特征 ↔ 说明书段落”的核对记录。
 * paragraphSnapshot 保存标记当时的段落文字摘要；段落正文一旦改动，
 * status 会被重置为 'review'（待复核）。
 */
export interface SupportStatusRecord {
  id: string
  featureId: string
  paragraphId: string
  status: SupportStatusKind
  note: string
  paragraphSnapshot: string
  /** 因段落正文变更退回待复核前的结论，用于提醒展示 */
  priorStatus?: SupportStatusKind
  updatedAt: string
}

export interface Annotation {
  id: string
  featureId: string
  authorRole: Role
  authorName: string
  text: string
  updatedAt: string
}

export interface OrphanMapping {
  id: string
  featureLabel: string
  paragraphId: string
  reason: string
}

export interface ClaimVersion {
  id: string
  name: string
  createdAt: string
  claims: Claim[]
  features: Feature[]
  /** 保存版本时的支持核对状态组（含依据摘要） */
  supportStatuses: SupportStatusRecord[]
}

export interface Position {
  tab: string
  claimId: string
  featureId: string | null
  scrollY: number
}

export interface WorkbenchState {
  claims: Claim[]
  paragraphs: Paragraph[]
  features: Feature[]
  annotations: Annotation[]
  orphanMappings: OrphanMapping[]
  supportStatuses: SupportStatusRecord[]
  versions: ClaimVersion[]
  role: Role
  selectedClaimId: string
  selectedFeatureId: string | null
  activeTab: string
  currentUserRole: Role
}

export interface ValidationIssue {
  id: string
  severity: 'error' | 'warning'
  type: 'cycle' | 'missing-support' | 'orphan-mapping' | 'empty-feature' | 'stale-support'
  featureId?: string
  paragraphId?: string
  title: string
  detail: string
}
