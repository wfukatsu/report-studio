import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { ProductMasterTab } from '@/components/modals/ProductMasterTab'

interface Props {
  onClose: () => void
}

/**
 * 商品マスター専用エディタ（ProductMasterTab）をモーダルで開くラッパー。
 * DataBrowser の商品マスターノードから編集フロー（追加/編集/削除/CSV 取込/
 * カスタム項目/重複検知/楽観排他/90日削除警告）へ直接アクセスするための導線。
 * 編集ロジックは ProductMasterTab をそのまま流用し挙動差を作らない（#331）。
 */
export function ProductMasterModal({ onClose }: Props) {
  const { t } = useTranslation('components')
  const modalRef = useRef<HTMLDivElement>(null)
  const openerRef = useRef<HTMLElement | null>(null)

  // Focus management: remember opener, focus the close button on mount,
  // restore focus on unmount.
  useEffect(() => {
    openerRef.current = document.activeElement as HTMLElement | null
    const opener = openerRef.current
    modalRef.current?.querySelector<HTMLElement>('[data-close-button]')?.focus()
    return () => opener?.focus()
  }, [])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="product-master-modal-title"
      onKeyDown={(e) => { if (e.key === 'Escape') onClose() }}
      onClick={onClose}
    >
      <div
        ref={modalRef}
        className="bg-background border border-border rounded-lg shadow-xl w-[75vw] max-w-4xl h-[80vh] flex flex-col mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b shrink-0">
          <h2 id="product-master-modal-title" className="text-sm font-semibold">
            {t('dataBrowser.productMasterModal.title')}
          </h2>
          <button
            data-close-button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground text-xs px-2 py-1 rounded hover:bg-accent transition-colors"
            aria-label={t('dataBrowser.productMasterModal.close')}
          >
            ✕
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          <ProductMasterTab />
        </div>
      </div>
    </div>
  )
}
