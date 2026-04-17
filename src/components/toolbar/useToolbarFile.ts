import { toast } from 'sonner'
import type { Section } from '@/types'
import { useReportStore } from '@/store/reportStore'
import { createReport, saveReport } from '@/api/reportApi'
import { loadBuiltinTemplate } from '@/lib/templateUtils'
import { exportToJSON } from '@/lib/exportUtils'

interface FileContext {
  reportName: string
  backendConnected: boolean
  hasUnsavedChanges: boolean
  sourceTemplateId: string | null | undefined
  masterHeader: Section | null | undefined
  masterFooter: Section | null | undefined
  headerEditMode: boolean
  containerRef?: React.RefObject<HTMLElement | null>
  fileInputRef: React.RefObject<HTMLInputElement | null>
  // Modal setters
  setShowSaveDialog: (v: boolean) => void
  setIsSavingNew: (v: boolean) => void
  setShowManagerModal: (v: boolean) => void
  setShowOpenLocalConfirm: (v: boolean) => void
  setShowOpenServerConfirm: (v: boolean) => void
  setShowUpdateFromBuiltinConfirm: (v: boolean) => void
  setShowDeleteHeaderConfirm: (v: boolean) => void
  setShowDeleteFooterConfirm: (v: boolean) => void
  setShowSaveMenu: (v: boolean) => void
}

/**
 * File/save/template handlers extracted from Toolbar.tsx
 * to keep that file under the 800-line project limit.
 */
export function useToolbarFile({
  reportName,
  backendConnected,
  hasUnsavedChanges,
  sourceTemplateId,
  masterHeader,
  masterFooter,
  headerEditMode,
  containerRef,
  fileInputRef,
  setShowSaveDialog,
  setIsSavingNew,
  setShowManagerModal,
  setShowOpenLocalConfirm,
  setShowOpenServerConfirm,
  setShowUpdateFromBuiltinConfirm,
  setShowDeleteHeaderConfirm,
  setShowDeleteFooterConfirm,
  setShowSaveMenu,
}: FileContext) {
  const importReportJSON = useReportStore((s) => s.importReportJSON)
  const loadReport = useReportStore((s) => s.loadReport)
  const setCurrentTemplateId = useReportStore((s) => s.setCurrentTemplateId)
  const setMasterHeader = useReportStore((s) => s.setMasterHeader)
  const setMasterFooter = useReportStore((s) => s.setMasterFooter)
  const toggleHeaderEditMode = useReportStore((s) => s.toggleHeaderEditMode)

  const handleNew = (onRequestTemplateModal?: () => void) => {
    onRequestTemplateModal?.()
  }

  const handleUpdateFromBuiltin = () => {
    if (!sourceTemplateId) return
    const definition = loadBuiltinTemplate(sourceTemplateId)
    if (!definition) {
      toast.error('ビルトインテンプレートが見つかりませんでした', { duration: 8000 })
      setShowUpdateFromBuiltinConfirm(false)
      return
    }
    loadReport(definition)
    setCurrentTemplateId(null)
    setShowUpdateFromBuiltinConfirm(false)
  }

  const handleOpenLocal = () => {
    if (hasUnsavedChanges) { setShowOpenLocalConfirm(true); return }
    fileInputRef.current?.click()
  }

  const handleOpenServer = () => {
    if (hasUnsavedChanges) { setShowOpenServerConfirm(true); return }
    setShowManagerModal(true)
  }

  const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > MAX_FILE_SIZE) {
      toast.error('ファイルサイズが大きすぎます（10MB以下にしてください）', { duration: 8000 })
      e.target.value = ''
      return
    }
    try {
      const text = await file.text()
      const result = importReportJSON(text)
      if (!result.ok) {
        toast.error(result.error ?? '読み込みに失敗しました', { duration: 8000 })
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '読み込みに失敗しました', { duration: 8000 })
    }
    e.target.value = ''
  }

  const createMasterSection = (role: 'header' | 'footer'): Section => ({
    id: crypto.randomUUID?.() || Math.random().toString(36).slice(2),
    sectionType: role === 'header' ? 'header' : 'footer',
    height: role === 'header' ? 20 : 15,
    elements: [],
  })

  const handleToggleMasterHeader = () => {
    if (masterHeader) {
      setShowDeleteHeaderConfirm(true)
    } else {
      setMasterHeader(createMasterSection('header'))
      if (!headerEditMode) toggleHeaderEditMode()
    }
  }

  const handleToggleMasterFooter = () => {
    if (masterFooter) {
      setShowDeleteFooterConfirm(true)
    } else {
      setMasterFooter(createMasterSection('footer'))
      if (!headerEditMode) toggleHeaderEditMode()
      requestAnimationFrame(() => {
        containerRef?.current?.scrollTo({ top: containerRef.current.scrollHeight, behavior: 'smooth' })
      })
    }
  }

  const handleDownloadJson = () => {
    try {
      const definition = useReportStore.getState().definition
      const json = exportToJSON(definition)
      const blob = new Blob([json], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const date = new Date().toISOString().slice(0, 10)
      a.download = `${reportName}-${date}.rds2.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'ダウンロードに失敗しました', { duration: 8000 })
    }
    setShowSaveMenu(false)
  }

  const handleSave = async () => {
    const { currentTemplateId, definition, setSaveState } = useReportStore.getState()

    if (!backendConnected) {
      toast.error('バックエンドに接続されていません。「npm run dev:backend」でバックエンドを起動してから再試行してください。', { duration: 8000 })
      return
    }

    if (currentTemplateId) {
      try {
        setSaveState('saving')
        await saveReport(currentTemplateId, definition)
        setSaveState('saved')
        toast.success('保存しました')
      } catch (err) {
        setSaveState('error')
        toast.error(err instanceof Error ? err.message : '保存に失敗しました', { duration: 8000 })
      }
    } else {
      setShowSaveDialog(true)
    }
  }

  const handleSaveNew = async (name: string) => {
    const { definition, setCurrentTemplateId: setId, setSaveState } = useReportStore.getState()
    setIsSavingNew(true)
    try {
      setSaveState('saving')
      const created = await createReport(name)
      await saveReport(created.id, definition)
      setId(created.id)
      setShowSaveDialog(false)
      setSaveState('saved')
      toast.success('テンプレートを保存しました')
    } catch (err) {
      setSaveState('error')
      toast.error(err instanceof Error ? err.message : '保存に失敗しました', { duration: 8000 })
    } finally {
      setIsSavingNew(false)
    }
  }

  return {
    handleNew,
    handleUpdateFromBuiltin,
    handleOpenLocal,
    handleOpenServer,
    handleFileChange,
    handleToggleMasterHeader,
    handleToggleMasterFooter,
    handleDownloadJson,
    handleSave,
    handleSaveNew,
  }
}
