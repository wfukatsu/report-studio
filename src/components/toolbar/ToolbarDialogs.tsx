/**
 * All modal and confirm dialogs rendered by the Toolbar.
 * Extracted to keep Toolbar.tsx under the 800-line project limit.
 */
import type { OutputVariant } from '@/types'
import { DataBindingModal } from '@/components/modals/DataBindingModal'
import { ServerSettingsModal } from '@/components/modals/ServerSettingsModal'
import { ExportVariantDialog } from '@/components/modals/ExportVariantDialog'
import { SaveTemplateDialog } from '@/components/modals/SaveTemplateDialog'
import { TemplateManagerModal } from '@/components/modals/TemplateManagerModal'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'

interface Props {
  reportName: string
  sourceTemplateName?: string
  // Dialog open states
  showDataModal: boolean
  showServerSettings: boolean
  showSaveDialog: boolean
  showManagerModal: boolean
  showUpdateFromBuiltinConfirm: boolean
  showVariantDialog: boolean
  showValidationWarnConfirm: boolean
  showOpenLocalConfirm: boolean
  showOpenServerConfirm: boolean
  showDeleteHeaderConfirm: boolean
  showDeleteFooterConfirm: boolean
  isSavingNew: boolean
  validationWarnings: string[]
  // Callbacks
  onCloseDataModal: () => void
  onCloseServerSettings: () => void
  onSaveNew: (name: string) => void
  onCancelSave: () => void
  onCloseManagerModal: () => void
  onConfirmUpdateFromBuiltin: () => void
  onCancelUpdateFromBuiltin: () => void
  onSelectVariant: (variant: OutputVariant | null) => void
  onCancelVariantDialog: () => void
  onConfirmExportWithWarnings: () => void
  onCancelValidationWarn: () => void
  onConfirmOpenLocal: () => void
  onCancelOpenLocal: () => void
  onConfirmOpenServer: () => void
  onCancelOpenServer: () => void
  onConfirmDeleteHeader: () => void
  onCancelDeleteHeader: () => void
  onConfirmDeleteFooter: () => void
  onCancelDeleteFooter: () => void
}

export function ToolbarDialogs({
  reportName,
  sourceTemplateName,
  showDataModal,
  showServerSettings,
  showSaveDialog,
  showManagerModal,
  showUpdateFromBuiltinConfirm,
  showVariantDialog,
  showValidationWarnConfirm,
  showOpenLocalConfirm,
  showOpenServerConfirm,
  showDeleteHeaderConfirm,
  showDeleteFooterConfirm,
  isSavingNew,
  validationWarnings,
  onCloseDataModal,
  onCloseServerSettings,
  onSaveNew,
  onCancelSave,
  onCloseManagerModal,
  onConfirmUpdateFromBuiltin,
  onCancelUpdateFromBuiltin,
  onSelectVariant,
  onCancelVariantDialog,
  onConfirmExportWithWarnings,
  onCancelValidationWarn,
  onConfirmOpenLocal,
  onCancelOpenLocal,
  onConfirmOpenServer,
  onCancelOpenServer,
  onConfirmDeleteHeader,
  onCancelDeleteHeader,
  onConfirmDeleteFooter,
  onCancelDeleteFooter,
}: Props) {
  return (
    <>
      {showDataModal && <DataBindingModal open={showDataModal} onClose={onCloseDataModal} />}

      {showServerSettings && <ServerSettingsModal open={showServerSettings} onClose={onCloseServerSettings} />}

      <SaveTemplateDialog
        open={showSaveDialog}
        onSave={onSaveNew}
        onCancel={onCancelSave}
        defaultName={reportName}
        saving={isSavingNew}
      />

      <TemplateManagerModal open={showManagerModal} onClose={onCloseManagerModal} />

      <ConfirmDialog
        open={showUpdateFromBuiltinConfirm}
        title="ビルトインテンプレートから更新"
        message={sourceTemplateName
          ? `現在のレポートを最新のビルトインテンプレート「${sourceTemplateName}」の定義で上書きします。これまでの変更は失われます。続行しますか？`
          : ''}
        confirmLabel="更新"
        confirmVariant="danger"
        onConfirm={onConfirmUpdateFromBuiltin}
        onCancel={onCancelUpdateFromBuiltin}
      />

      <ExportVariantDialog
        open={showVariantDialog}
        onSelect={onSelectVariant}
        onCancel={onCancelVariantDialog}
      />

      <ConfirmDialog
        open={showValidationWarnConfirm}
        title="バリデーション警告"
        message={`以下の警告があります。エクスポートを続けますか？\n\n${validationWarnings.map((m) => `⚠️ ${m}`).join('\n')}`}
        confirmLabel="続けてエクスポート"
        onConfirm={onConfirmExportWithWarnings}
        onCancel={onCancelValidationWarn}
      />

      <ConfirmDialog
        open={showOpenLocalConfirm}
        title="未保存の変更があります"
        message="変更を破棄してファイルを開きますか？"
        confirmLabel="破棄して開く"
        confirmVariant="danger"
        onConfirm={onConfirmOpenLocal}
        onCancel={onCancelOpenLocal}
      />

      <ConfirmDialog
        open={showOpenServerConfirm}
        title="未保存の変更があります"
        message="変更を破棄してテンプレートを開きますか？"
        confirmLabel="破棄して開く"
        confirmVariant="danger"
        onConfirm={onConfirmOpenServer}
        onCancel={onCancelOpenServer}
      />

      <ConfirmDialog
        open={showDeleteHeaderConfirm}
        title="ヘッダーを削除"
        message="ヘッダーとその内容を削除しますか？"
        confirmLabel="削除"
        confirmVariant="danger"
        onConfirm={onConfirmDeleteHeader}
        onCancel={onCancelDeleteHeader}
      />

      <ConfirmDialog
        open={showDeleteFooterConfirm}
        title="フッターを削除"
        message="フッターとその内容を削除しますか？"
        confirmLabel="削除"
        confirmVariant="danger"
        onConfirm={onConfirmDeleteFooter}
        onCancel={onCancelDeleteFooter}
      />

    </>
  )
}
