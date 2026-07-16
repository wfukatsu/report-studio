import { toast } from 'sonner'
import { useRef, useState } from 'react'
import { generateStatelessPdf, generateTemplatePdf, evaluateValidate } from '@/api/reportApi'
import { downloadBlob } from '@/api/client'
import type { ReportDefinitionInput } from '@/lib/schemas/reportDefinition'
import type { OutputVariant } from '@/types'
import { useReportStore } from '@/store/reportStore'
import { exportReportToPdf, exportReportToPdfBlob, exportPageToPng, collectAutoFieldModels } from '@/lib/exportUtils'
import { runValidation } from '@/lib/validationRunner'
import { applyVariant, applyPartialMask } from '@/lib/variantApplicator'
import { resolveCurrentData } from '@/hooks/useResolvedData'

interface ExportContext {
  canvasRefs: React.RefObject<HTMLDivElement | null>[]
  reportName: string
  pages: { id: string }[]
  activePage: { id: string } | null | undefined
  setShowVariantDialog: (v: boolean) => void
  setShowValidationWarnConfirm: (v: boolean) => void
  setValidationWarnings: (msgs: string[]) => void
}

/**
 * Export/validate/preflight handlers extracted from Toolbar.tsx
 * to keep that file under the 800-line project limit.
 */
export function useToolbarExport({
  canvasRefs,
  reportName,
  pages,
  activePage,
  setShowVariantDialog,
  setShowValidationWarnConfirm,
  setValidationWarnings,
}: ExportContext) {
  const [isExporting, setIsExporting] = useState(false)
  const [isPreviewingPdf, setIsPreviewingPdf] = useState(false)
  const [isValidating, setIsValidating] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  const runPreflight = async (): Promise<boolean> => {
    const { definition, testData } = useReportStore.getState()
    if (definition.validationRules.length === 0) return true
    const result = await runValidation(definition.validationRules, testData)
    if (result.hasErrors) {
      result.violations.forEach((v) => toast.error(v.message, { duration: 8000 }))
      return false
    }
    if (result.hasWarnings) {
      setValidationWarnings(result.violations.map((v) => v.message))
      setShowValidationWarnConfirm(true)
      return false
    }
    return true
  }

  const doExportPdf = async (variant: OutputVariant | null) => {
    setIsExporting(true)
    const { definition } = useReportStore.getState()
    const filename = variant ? `${reportName}_${variant.name}.pdf` : `${reportName}.pdf`

    try {
      const maskedDefinition = { ...definition, pages: applyVariant(definition.pages, variant) }
      const defJson = JSON.parse(JSON.stringify(maskedDefinition)) as Record<string, unknown>
      const dataJson = resolveCurrentData()
      const blob = await generateStatelessPdf(defJson, dataJson)
      downloadBlob(blob, filename)
      return
    } catch {
      console.warn('Server-side PDF failed, falling back to client-side rendering')
    }

    const hiddenNodes: HTMLElement[] = []
    const maskedNodes: Array<{ node: HTMLElement; original: string }> = []
    if (variant) {
      for (const id of variant.hiddenElementIds) {
        const node = document.querySelector<HTMLElement>(`[data-element-id="${id}"]`)
        if (node) { node.style.visibility = 'hidden'; hiddenNodes.push(node) }
      }
      for (const rule of variant.maskingRules) {
        const node = document.querySelector<HTMLElement>(`[data-element-id="${rule.targetElementId}"]`)
        if (node) {
          const original = node.innerText
          maskedNodes.push({ node, original })
          // Reuse the shared masking algorithm — defined once in variantApplicator (issue #61)
          if (rule.type === 'fullReplace') {
            node.innerText = rule.replaceValue ?? ''
          } else if (rule.type === 'partial') {
            node.innerText = applyPartialMask(original, rule.keepFirst, rule.keepLast)
          }
        }
      }
    }
    try {
      const els = canvasRefs.map((r) => r.current).filter((el): el is HTMLDivElement => el !== null)
      // Auto-field values come from the (masked) element models, not DOM reverse-mapping (issue #61)
      const maskedDef = { ...definition, pages: applyVariant(definition.pages, variant) }
      await exportReportToPdf(els, filename, collectAutoFieldModels(maskedDef))
      toast.warning('ローカル生成（品質低下）でエクスポートしました')
    } catch (_err) {
      toast.error('エクスポートに失敗しました。もう一度お試しください。', { duration: 8000 })
    } finally {
      for (const node of hiddenNodes) { node.style.visibility = '' }
      for (const { node, original } of maskedNodes) { node.innerText = original }
      setIsExporting(false)
    }
  }

  const handleExportPdf = async (skipPreflight = false) => {
    if (isExporting) return
    if (!skipPreflight) {
      const ok = await runPreflight()
      if (!ok) return
    }
    const { definition } = useReportStore.getState()
    const variants = definition.outputVariants as OutputVariant[]
    if (variants.length > 0) {
      setShowVariantDialog(true)
      return
    }
    await doExportPdf(null)
  }

  const handleFullPreviewPdf = async () => {
    if (isPreviewingPdf) return
    setIsPreviewingPdf(true)
    const { definition } = useReportStore.getState()

    const openBlobUrl = (blob: Blob): boolean => {
      const url = URL.createObjectURL(blob)
      const newTab = window.open(url, '_blank')
      if (!newTab) {
        URL.revokeObjectURL(url)
        toast.error('ポップアップがブロックされました。ブラウザの設定でポップアップを許可してください。', { duration: 8000 })
        return false
      }
      setTimeout(() => URL.revokeObjectURL(url), 1_000)
      return true
    }

    try {
      const defJson = JSON.parse(JSON.stringify(definition)) as Record<string, unknown>
      const dataJson = resolveCurrentData()
      const blob = await generateStatelessPdf(defJson, dataJson)
      openBlobUrl(blob)
    } catch {
      try {
        const els = canvasRefs.map((r) => r.current).filter((el): el is HTMLDivElement => el !== null)
        const blob = await exportReportToPdfBlob(els, collectAutoFieldModels(definition))
        if (openBlobUrl(blob)) {
          toast.warning('クライアントレンダリングでプレビューを生成しました（品質が低下している場合があります）')
        }
      } catch (_err) {
        toast.error('PDFプレビューの生成に失敗しました', { duration: 8000 })
      }
    } finally {
      setIsPreviewingPdf(false)
    }
  }

  const handleBackendPdf = async () => {
    if (isExporting) return
    const { currentTemplateId, testData, definition } = useReportStore.getState()
    if (!currentTemplateId) return
    setIsExporting(true)
    try {
      const tdRecord = testData as Record<string, unknown>
      const blob = await generateTemplatePdf(currentTemplateId, tdRecord)
      downloadBlob(blob, `${definition.metadata.documentName}.pdf`)
    } catch (_err) {
      toast.error('バックエンドPDF生成に失敗しました', { duration: 8000 })
    } finally {
      setIsExporting(false)
    }
  }

  const handleExportPng = async () => {
    if (isExporting) return
    const ok = await runPreflight()
    if (!ok) return
    setIsExporting(true)
    try {
      const el = canvasRefs[0]?.current
      if (el) {
        const { definition } = useReportStore.getState()
        const pageIdx = activePage ? pages.findIndex((p) => p.id === activePage.id) + 1 : 1
        await exportPageToPng(el, `${reportName}.png`, pageIdx, pages.length, collectAutoFieldModels(definition))
      }
    } catch (_err) {
      toast.error('エクスポートに失敗しました。もう一度お試しください。', { duration: 8000 })
    } finally {
      setIsExporting(false)
    }
  }

  const handleValidate = async () => {
    if (isValidating) return
    const { definition, testData, currentTemplateId } = useReportStore.getState()
    if (!currentTemplateId) return

    useReportStore.getState().setComputedViolations([])
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setIsValidating(true)
    try {
      const result = await evaluateValidate(
        currentTemplateId,
        definition as unknown as ReportDefinitionInput,
        testData,
        controller.signal,
      )
      if (controller.signal.aborted) return
      useReportStore.getState().setComputedViolations(result.violations)
    } catch (_err) {
      if (controller.signal.aborted) return
      toast.error('バリデーションに失敗しました', { duration: 8000 })
    } finally {
      if (!controller.signal.aborted) setIsValidating(false)
    }
  }

  return {
    isExporting,
    isPreviewingPdf,
    isValidating,
    doExportPdf,
    handleExportPdf,
    handleFullPreviewPdf,
    handleBackendPdf,
    handleExportPng,
    handleValidate,
  }
}
