import { AfterViewInit, Component, OnDestroy, OnInit } from '@angular/core'
import { CommonModule } from '@angular/common'
import { FormsModule } from '@angular/forms'
import { ButtonModule } from 'primeng/button'
import { InputTextModule } from 'primeng/inputtext'
import { TextareaModule } from 'primeng/textarea'
import { SelectModule } from 'primeng/select'
import { CardModule } from 'primeng/card'
import { BadgeModule } from 'primeng/badge'
import { DialogModule } from 'primeng/dialog'
import { TooltipModule } from 'primeng/tooltip'
import { Subscription } from 'rxjs'
import type { Annotation, Claim, Feature, Role, SupportStatusKind, SupportStatusRecord, ValidationIssue, WorkbenchState } from './models'
import { SUPPORT_STATUS_META, summarizeParagraph, WorkbenchService } from './workbench.service'

interface SupportStatusOption { label: string; value: SupportStatusKind }

interface SupportDiffRow {
  key: string
  label: string
  beforeStatus: string
  afterStatus: string
  beforeSnapshot: string
  afterSnapshot: string
  relationChanged: boolean
  statusChanged: boolean
  snapshotChanged: boolean
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule, ButtonModule, InputTextModule, TextareaModule, SelectModule, CardModule, BadgeModule, DialogModule, TooltipModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent implements OnInit, AfterViewInit, OnDestroy {
  state: WorkbenchState
  issues: ValidationIssue[] = []
  history = { past: 0, future: 0 }
  compareA = ''
  compareB = ''
  annotationDraft = ''
  versionDialog = false
  versionName = ''
  activeIssue: ValidationIssue | null = null
  readonly statusOptions: SupportStatusOption[] = [
    { label: SUPPORT_STATUS_META.full.label, value: 'full' },
    { label: SUPPORT_STATUS_META.partial.label, value: 'partial' },
    { label: SUPPORT_STATUS_META.amendment.label, value: 'amendment' },
    { label: SUPPORT_STATUS_META.review.label, value: 'review' }
  ]
  roleOptions: Array<{ label: string; value: Role }> = [
    { label: '代理人（可编辑主数据与本人批注）', value: 'author' },
    { label: '审查员（可编辑本人批注）', value: 'examiner' },
    { label: '观察者（只读）', value: 'viewer' }
  ]
  private subscriptions = new Subscription()

  constructor(readonly service: WorkbenchService) {
    this.state = service.snapshot
  }

  ngOnInit(): void {
    this.subscriptions.add(this.service.state$.subscribe(state => {
      this.state = structuredClone(state)
      this.syncVersions()
    }))
    this.subscriptions.add(this.service.issues$.subscribe(issues => this.issues = issues))
    this.subscriptions.add(this.service.history$.subscribe(history => this.history = history))
    window.addEventListener('keydown', this.handleKeyboard)
  }

  ngAfterViewInit(): void {
    const position = this.service.readPosition()
    setTimeout(() => window.scrollTo({ top: position.scrollY || 0, behavior: 'instant' as ScrollBehavior }), 0)
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe()
    window.removeEventListener('keydown', this.handleKeyboard)
  }

  get selectedClaim(): Claim | undefined { return this.state.claims.find(item => item.id === this.state.selectedClaimId) }
  get selectedFeature(): Feature | undefined { return this.state.features.find(item => item.id === this.state.selectedFeatureId) }
  get claimFeatures(): Feature[] { return this.state.features.filter(item => item.claimId === this.state.selectedClaimId) }
  get featureAnnotations(): Annotation[] { return this.selectedFeature ? this.state.annotations.filter(item => item.featureId === this.selectedFeature?.id) : [] }
  get currentRoleLabel(): string { return this.roleOptions.find(item => item.value === this.state.role)?.label || '' }
  get errorCount(): number { return this.issues.filter(item => item.severity === 'error').length }
  get warningCount(): number { return this.issues.filter(item => item.severity === 'warning').length }
  get canEditMainData(): boolean { return this.state.role !== 'viewer' }
  get mappedFeatureCount(): number { return this.claimFeatures.filter(feature => feature.supportIds.length > 0).length }
  get pendingReviewCount(): number {
    return this.state.supportStatuses.filter(record => {
      if (record.status !== 'review') return false
      const paragraph = this.state.paragraphs.find(item => item.id === record.paragraphId)
      return !record.paragraphSnapshot || (paragraph && record.paragraphSnapshot !== paragraph.text)
    }).length
  }

  claimLabel(id: string): string { return this.state.claims.find(item => item.id === id)?.title || '未命名权利要求' }
  featureLabel(id: string): string { return this.state.features.find(item => item.id === id)?.label || id }
  paragraphLabel(id: string): string { return this.state.paragraphs.find(item => item.id === id)?.section || id }
  isMapped(feature: Feature, paragraphId: string): boolean { return feature.supportIds.includes(paragraphId) }
  isOwnAnnotation(annotation: Annotation): boolean { return annotation.authorRole === this.state.role }
  ownerLabel(role: Role): string { return ({ author: '代理人', examiner: '审查员', viewer: '观察者' })[role] }

  supportRecord(featureId: string, paragraphId: string): SupportStatusRecord | undefined {
    return this.state.supportStatuses.find(record => record.featureId === featureId && record.paragraphId === paragraphId)
  }

  supportKind(featureId: string, paragraphId: string): SupportStatusKind {
    return this.supportRecord(featureId, paragraphId)?.status || 'review'
  }

  supportTone(featureId: string, paragraphId: string): string {
    const record = this.supportRecord(featureId, paragraphId)
    if (!record) return 'idle'
    const paragraph = this.state.paragraphs.find(item => item.id === record.paragraphId)
    if (record.status === 'review' && paragraph && record.paragraphSnapshot && record.paragraphSnapshot !== paragraph.text) return 'stale'
    return SUPPORT_STATUS_META[record.status].tone
  }

  statusText(status: SupportStatusKind): string { return SUPPORT_STATUS_META[status].label }

  summarize(text: string): string { return summarizeParagraph(text) }

  setSupportStatus(featureId: string, paragraphId: string, status: SupportStatusKind): void {
    this.service.setSupportStatus(featureId, paragraphId, status)
  }

  updateSupportNote(featureId: string, paragraphId: string, event: Event): void {
    this.service.updateSupportNote(featureId, paragraphId, (event.target as HTMLTextAreaElement).value)
  }

  reviewReason(record: SupportStatusRecord): string {
    const paragraph = this.state.paragraphs.find(item => item.id === record.paragraphId)
    if (!record.paragraphSnapshot) return '新增映射，尚未标记核对结论'
    if (paragraph && record.paragraphSnapshot !== paragraph.text) return '段落正文已修改，需重新核对'
    return '待复核'
  }

  featureNeedsReview(featureId: string): boolean {
    return this.state.supportStatuses.some(record => {
      if (record.featureId !== featureId || record.status !== 'review') return false
      const paragraph = this.state.paragraphs.find(item => item.id === record.paragraphId)
      return !record.paragraphSnapshot || (!!paragraph && record.paragraphSnapshot !== paragraph.text)
    })
  }

  updateClaimField(field: 'title' | 'text' | 'number' | 'independent', event: Event): void {
    const element = event.target as HTMLInputElement
    const value = field === 'number' ? Number(element.value) : field === 'independent' ? element.checked : element.value
    this.service.updateClaim({ [field]: value })
  }

  updateFeatureField(field: 'label' | 'text', event: Event): void {
    if (!this.selectedFeature) return
    this.service.updateFeature(this.selectedFeature.id, { [field]: (event.target as HTMLInputElement | HTMLTextAreaElement).value })
  }

  updateFeatureParent(event: Event): void {
    if (!this.selectedFeature) return
    this.service.updateFeature(this.selectedFeature.id, { parentId: (event.target as HTMLSelectElement).value || null })
  }

  toggleReference(featureId: string, checked: boolean): void {
    if (!this.selectedFeature) return
    const ids = checked
      ? Array.from(new Set([...this.selectedFeature.referenceIds, featureId]))
      : this.selectedFeature.referenceIds.filter(id => id !== featureId)
    this.service.updateFeature(this.selectedFeature.id, { referenceIds: ids })
  }

  addAnnotation(): void {
    if (!this.selectedFeature) return
    this.service.addAnnotation(this.selectedFeature.id, this.annotationDraft)
    this.annotationDraft = ''
  }

  updateAnnotation(annotation: Annotation, event: Event): void {
    this.service.updateAnnotation(annotation.id, (event.target as HTMLTextAreaElement).value)
  }

  createVersion(): void {
    this.service.createVersion(this.versionName)
    this.versionName = ''
    this.versionDialog = false
  }

  restoreVersion(id: string): void {
    this.service.restoreVersion(id)
  }

  getVersion(id: string) { return this.state.versions.find(item => item.id === id) }
  compareRows(): Array<{ label: string; before: string; after: string; changed: boolean }> {
    const a = this.getVersion(this.compareA)
    const b = this.getVersion(this.compareB)
    if (!a || !b) return []
    const ids = Array.from(new Set([...a.claims.map(item => item.id), ...b.claims.map(item => item.id)]))
    return ids.map(id => {
      const before = a.claims.find(item => item.id === id)?.text || ''
      const after = b.claims.find(item => item.id === id)?.text || ''
      return { label: `权利要求 ${a.claims.find(item => item.id === id)?.number || b.claims.find(item => item.id === id)?.number || '?'}`, before, after, changed: before !== after }
    })
  }

  /** 比较两版之间特征↔段落核对状态及依据摘要的变化 */
  supportCompareRows(): SupportDiffRow[] {
    const a = this.getVersion(this.compareA)
    const b = this.getVersion(this.compareB)
    if (!a || !b) return []
    const rows: SupportDiffRow[] = []
    const keys = Array.from(new Set([
      ...(a.supportStatuses || []).map(record => `${record.featureId}::${record.paragraphId}`),
      ...(b.supportStatuses || []).map(record => `${record.featureId}::${record.paragraphId}`)
    ]))
    keys.forEach(key => {
      const before = (a.supportStatuses || []).find(record => `${record.featureId}::${record.paragraphId}` === key)
      const after = (b.supportStatuses || []).find(record => `${record.featureId}::${record.paragraphId}` === key)
      const featureId = before?.featureId || after!.featureId
      const paragraphId = before?.paragraphId || after!.paragraphId
      const featureLabel = this.state.features.find(item => item.id === featureId)?.label
        || a.features.find(item => item.id === featureId)?.label
        || b.features.find(item => item.id === featureId)?.label || featureId
      const paragraphLabel = this.state.paragraphs.find(item => item.id === paragraphId)?.section || paragraphId
      const beforeStatus = before ? SUPPORT_STATUS_META[before.status].label : '（未建立映射）'
      const afterStatus = after ? SUPPORT_STATUS_META[after.status].label : '（映射已移除）'
      const beforeSnapshot = before ? summarizeParagraph(before.paragraphSnapshot) : ''
      const afterSnapshot = after ? summarizeParagraph(after.paragraphSnapshot) : ''
      const relationChanged = !before || !after
      const statusChanged = !!before && !!after && before.status !== after.status
      const snapshotChanged = !!before && !!after && before.paragraphSnapshot !== after.paragraphSnapshot
      if (relationChanged || statusChanged || snapshotChanged) {
        rows.push({ key, label: `${featureLabel} ↔ ${paragraphLabel}`, beforeStatus, afterStatus, beforeSnapshot, afterSnapshot, relationChanged, statusChanged, snapshotChanged })
      }
    })
    return rows
  }

  versionStatusCount(versionId: string): number {
    return (this.getVersion(versionId)?.supportStatuses || []).filter(record => record.status !== 'review').length
  }

  exportFile(type: 'json' | 'csv'): void {
    const content = type === 'json' ? this.service.exportJson() : this.service.exportCsv()
    const mime = type === 'json' ? 'application/json;charset=utf-8' : 'text/csv;charset=utf-8'
    const url = URL.createObjectURL(new Blob([content], { type: mime }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `patent-claim-check-${new Date().toISOString().slice(0, 10)}.${type}`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  locateIssue(issue: ValidationIssue): void {
    this.activeIssue = issue
    if (issue.featureId) this.service.selectFeature(issue.featureId)
    this.service.setTab('mapping')
  }

  locateSupport(featureId: string): void {
    const feature = this.state.features.find(item => item.id === featureId)
    if (feature && feature.claimId !== this.state.selectedClaimId) this.service.selectClaim(feature.claimId)
    this.service.selectFeature(featureId)
    this.service.setTab('mapping')
  }

  closeIssue(): void { this.activeIssue = null }

  private syncVersions(): void {
    if (!this.state.versions.some(item => item.id === this.compareA)) this.compareA = this.state.versions[1]?.id || this.state.versions[0]?.id || ''
    if (!this.state.versions.some(item => item.id === this.compareB)) this.compareB = this.state.versions[0]?.id || ''
  }

  private handleKeyboard = (event: KeyboardEvent): void => {
    if (!(event.metaKey || event.ctrlKey)) return
    if (event.key.toLowerCase() === 'z') {
      event.preventDefault()
      event.shiftKey ? this.service.redo() : this.service.undo()
    } else if (event.key.toLowerCase() === 'y') {
      event.preventDefault()
      this.service.redo()
    } else if (event.key.toLowerCase() === 's') {
      event.preventDefault()
      this.versionDialog = true
    }
  }
}
