/**
 * All modal and confirm dialogs rendered by the Toolbar.
 * Extracted to keep Toolbar.tsx under the 800-line project limit.
 */
import { useTranslation } from 'react-i18next'
import type { OutputVariant } from '@/types'
import { DataBindingModal } from '@/components/modals/DataBindingModal'
import { ServerSettingsModal } from '@/components/modals/ServerSettingsModal'
import { ExportVariantDialog } from '@/components/modals/ExportVariantDialog'
import { SaveTemplateDialog } from '@/components/modals/SaveTemplateDialog'
import { TemplateManagerModal } from '@/components/modals/TemplateManagerModal'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'

/** Default/placeholder document names not worth pre-filling in the save dialog (#158). */
const PLACEHOLDER_TEMPLATE_NAMES = new Set(['無題の帳票', 'Untitled Report', '新しいテンプレート', ''])

interface Props {
  reportName: string
  // Dialog open states
  showDataModal: boolean
  showServerSettings: boolean
  showSaveDialog: boolean
  showManagerModal: boolean
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
  showDataModal,
  showServerSettings,
  showSaveDialog,
  showManagerModal,
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
  const { t } = useTranslation('toolbar')
  return (
    <>
      {showDataModal && <DataBindingModal open={showDataModal} onClose={onCloseDataModal} />}

      {showServerSettings && <ServerSettingsModal open={showServerSettings} onClose={onCloseServerSettings} />}

      <SaveTemplateDialog
        open={showSaveDialog}
        onSave={onSaveNew}
        onCancel={onCancelSave}
        // Don't pre-fill the placeholder name — start empty so the user gives the
        // template a real name instead of saving a wall of "Untitled Report"s (#158).
        defaultName={PLACEHOLDER_TEMPLATE_NAMES.has(reportName) ? '' : reportName}
        saving={isSavingNew}
      />

      <TemplateManagerModal open={showManagerModal} onClose={onCloseManagerModal} />

      <ExportVariantDialog
        open={showVariantDialog}
        onSelect={onSelectVariant}
        onCancel={onCancelVariantDialog}
      />

      <ConfirmDialog
        open={showValidationWarnConfirm}
        title={t('dialogs.validationWarnTitle')}
        message={t('dialogs.validationWarnMessage', {
          warnings: validationWarnings.map((m) => `⚠️ ${m}`).join('\n'),
        })}
        confirmLabel={t('dialogs.continueExport')}
        onConfirm={onConfirmExportWithWarnings}
        onCancel={onCancelValidationWarn}
      />

      <ConfirmDialog
        open={showOpenLocalConfirm}
        title={t('dialogs.unsavedTitle')}
        message={t('dialogs.discardOpenFile')}
        confirmLabel={t('dialogs.discardAndOpen')}
        confirmVariant="danger"
        onConfirm={onConfirmOpenLocal}
        onCancel={onCancelOpenLocal}
      />

      <ConfirmDialog
        open={showOpenServerConfirm}
        title={t('dialogs.unsavedTitle')}
        message={t('dialogs.discardOpenTemplate')}
        confirmLabel={t('dialogs.discardAndOpen')}
        confirmVariant="danger"
        onConfirm={onConfirmOpenServer}
        onCancel={onCancelOpenServer}
      />

      <ConfirmDialog
        open={showDeleteHeaderConfirm}
        title={t('dialogs.deleteHeaderTitle')}
        message={t('dialogs.deleteHeaderMessage')}
        confirmLabel={t('dialogs.delete')}
        confirmVariant="danger"
        onConfirm={onConfirmDeleteHeader}
        onCancel={onCancelDeleteHeader}
      />

      <ConfirmDialog
        open={showDeleteFooterConfirm}
        title={t('dialogs.deleteFooterTitle')}
        message={t('dialogs.deleteFooterMessage')}
        confirmLabel={t('dialogs.delete')}
        confirmVariant="danger"
        onConfirm={onConfirmDeleteFooter}
        onCancel={onCancelDeleteFooter}
      />

    </>
  )
}
