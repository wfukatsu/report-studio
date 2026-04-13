import { useCallback, useRef, useState } from 'react'
import { useEffect } from 'react'

/**
 * All modal/dropdown open-state management for the Toolbar.
 * Extracted to keep Toolbar.tsx under the 800-line project limit.
 */
export function useToolbarModals() {
  const [showSaveDialog, setShowSaveDialog] = useState(false)
  const [isSavingNew, setIsSavingNew] = useState(false)
  const [showUserMenu, setShowUserMenu] = useState(false)
  const [showServerSettings, setShowServerSettings] = useState(false)
  const [showOpenMenu, setShowOpenMenu] = useState(false)
  const [showSaveMenu, setShowSaveMenu] = useState(false)
  const [showZoomMenu, setShowZoomMenu] = useState(false)
  const [showAlignMenu, setShowAlignMenu] = useState(false)
  const [showZOrderMenu, setShowZOrderMenu] = useState(false)
  const [showPreviewMenu, setShowPreviewMenu] = useState(false)
  const [isPreviewingPdf, setIsPreviewingPdf] = useState(false)
  const [showDataModal, setShowDataModal] = useState(false)
  const [showManagerModal, setShowManagerModal] = useState(false)
  const [showVariantDialog, setShowVariantDialog] = useState(false)
  const [showUpdateFromBuiltinConfirm, setShowUpdateFromBuiltinConfirm] = useState(false)
  const [showOpenLocalConfirm, setShowOpenLocalConfirm] = useState(false)
  const [showOpenServerConfirm, setShowOpenServerConfirm] = useState(false)
  const [showDeleteHeaderConfirm, setShowDeleteHeaderConfirm] = useState(false)
  const [showDeleteFooterConfirm, setShowDeleteFooterConfirm] = useState(false)
  const [showValidationWarnConfirm, setShowValidationWarnConfirm] = useState(false)
  const [validationWarnings, setValidationWarnings] = useState<string[]>([])

  // Refs for dropdown dismiss detection
  const fileInputRef = useRef<HTMLInputElement>(null)
  const userMenuRef = useRef<HTMLDivElement>(null)
  const openMenuRef = useRef<HTMLDivElement>(null)
  const saveMenuRef = useRef<HTMLDivElement>(null)
  const zoomMenuRef = useRef<HTMLDivElement>(null)
  const alignMenuRef = useRef<HTMLDivElement>(null)
  const zOrderMenuRef = useRef<HTMLDivElement>(null)
  const previewMenuRef = useRef<HTMLDivElement>(null)

  const closeUserMenu = useCallback(() => setShowUserMenu(false), [])
  const closeOpenMenu = useCallback(() => setShowOpenMenu(false), [])
  const closeSaveMenu = useCallback(() => setShowSaveMenu(false), [])
  const closeZoomMenu = useCallback(() => setShowZoomMenu(false), [])
  const closeAlignMenu = useCallback(() => setShowAlignMenu(false), [])
  const closeZOrderMenu = useCallback(() => setShowZOrderMenu(false), [])
  const closePreviewMenu = useCallback(() => setShowPreviewMenu(false), [])

  // Dismiss dropdowns on outside click or Escape key
  useDropdownDismiss(userMenuRef, showUserMenu, closeUserMenu)
  useDropdownDismiss(openMenuRef, showOpenMenu, closeOpenMenu)
  useDropdownDismiss(saveMenuRef, showSaveMenu, closeSaveMenu)
  useDropdownDismiss(zoomMenuRef, showZoomMenu, closeZoomMenu)
  useDropdownDismiss(alignMenuRef, showAlignMenu, closeAlignMenu)
  useDropdownDismiss(zOrderMenuRef, showZOrderMenu, closeZOrderMenu)
  useDropdownDismiss(previewMenuRef, showPreviewMenu, closePreviewMenu)

  return {
    // States
    showSaveDialog, setShowSaveDialog,
    isSavingNew, setIsSavingNew,
    showUserMenu, setShowUserMenu,
    showServerSettings, setShowServerSettings,
    showOpenMenu, setShowOpenMenu,
    showSaveMenu, setShowSaveMenu,
    showZoomMenu, setShowZoomMenu,
    showAlignMenu, setShowAlignMenu,
    showZOrderMenu, setShowZOrderMenu,
    showPreviewMenu, setShowPreviewMenu,
    isPreviewingPdf, setIsPreviewingPdf,
    showDataModal, setShowDataModal,
    showManagerModal, setShowManagerModal,
    showVariantDialog, setShowVariantDialog,
    showUpdateFromBuiltinConfirm, setShowUpdateFromBuiltinConfirm,
    showOpenLocalConfirm, setShowOpenLocalConfirm,
    showOpenServerConfirm, setShowOpenServerConfirm,
    showDeleteHeaderConfirm, setShowDeleteHeaderConfirm,
    showDeleteFooterConfirm, setShowDeleteFooterConfirm,
    showValidationWarnConfirm, setShowValidationWarnConfirm,
    validationWarnings, setValidationWarnings,
    // Refs
    fileInputRef,
    userMenuRef,
    openMenuRef,
    saveMenuRef,
    zoomMenuRef,
    alignMenuRef,
    zOrderMenuRef,
    previewMenuRef,
    // Close callbacks
    closeSaveMenu,
    closeZoomMenu,
    closeAlignMenu,
    closeZOrderMenu,
    closePreviewMenu,
  }
}

/** Close a dropdown when clicking outside or pressing Escape. */
function useDropdownDismiss(
  ref: React.RefObject<HTMLElement | null>,
  isOpen: boolean,
  onClose: () => void,
) {
  useEffect(() => {
    if (!isOpen) return
    const handler = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent && e.key === 'Escape') { onClose(); return }
      if (e instanceof MouseEvent && ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    document.addEventListener('keydown', handler)
    return () => {
      document.removeEventListener('mousedown', handler)
      document.removeEventListener('keydown', handler)
    }
  }, [isOpen, onClose, ref])
}
