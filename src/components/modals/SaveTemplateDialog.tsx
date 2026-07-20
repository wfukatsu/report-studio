/**
 * SaveTemplateDialog — name input dialog for saving a new template to backend.
 */

import { useState, useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import { CategoryCombobox } from '@/components/common/CategoryCombobox'
import { TagInput } from '@/components/common/TagInput'

interface Props {
  open: boolean
  onSave: (name: string, category?: string, tags?: string[]) => void
  onCancel: () => void
  defaultName?: string
  defaultCategory?: string
  defaultTags?: string[]
  saving?: boolean
}

export function SaveTemplateDialog({ open, ...rest }: Props) {
  // Mount the content only while open: the fields initialize from the default
  // props at mount and die on close — no props→state sync effect needed.
  if (!open) return null
  return <SaveTemplateDialogContent {...rest} />
}

function SaveTemplateDialogContent({
  onSave, onCancel, defaultName = '', defaultCategory, defaultTags = [], saving = false,
}: Omit<Props, 'open'>) {
  const [name, setName] = useState(defaultName)
  const [category, setCategory] = useState<string | undefined>(defaultCategory)
  const [tags, setTags] = useState<string[]>(defaultTags)
  const inputRef = useRef<HTMLInputElement>(null)

  // Focus the name input once the dialog content mounts (= dialog opened)
  useEffect(() => {
    requestAnimationFrame(() => inputRef.current?.select())
  }, [])

  const canSave = name.trim().length > 0 && !saving

  const handleSave = () => {
    if (canSave) onSave(name.trim(), category, tags.length > 0 ? tags : undefined)
  }

  const categoryOptions: string[] = []

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-label="テンプレートを保存"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel() }}
    >
      <div className="bg-background rounded-lg shadow-xl w-80 flex flex-col overflow-hidden">
        <header className="flex items-center justify-between px-4 py-3 border-b">
          <h2 className="text-sm font-semibold">テンプレートを保存</h2>
          <button
            onClick={onCancel}
            className="rounded hover:bg-accent p-1"
            aria-label="閉じる"
          >
            <X className="w-4 h-4" />
          </button>
        </header>

        <div className="p-4 space-y-3">
          <label className="block text-xs font-medium text-muted-foreground" htmlFor="template-name">
            テンプレート名
          </label>
          <input
            ref={inputRef}
            id="template-name"
            aria-label="テンプレート名"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing) return; if (e.key === 'Enter') handleSave()
              if (e.key === 'Escape') onCancel()
            }}
            className="w-full px-3 py-2 text-sm border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary"
            placeholder="テンプレート名を入力"
            autoFocus
          />

          <label className="block text-xs font-medium text-muted-foreground mt-3" htmlFor="template-category">
            カテゴリ
          </label>
          <CategoryCombobox
            value={category}
            options={categoryOptions}
            onChange={setCategory}
          />

          <label className="block text-xs font-medium text-muted-foreground mt-3">
            タグ
          </label>
          <TagInput value={tags} onChange={setTags} />
        </div>

        <footer className="flex justify-end gap-2 px-4 py-3 border-t">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-sm rounded-md hover:bg-accent"
            aria-label="キャンセル"
          >
            キャンセル
          </button>
          <button
            onClick={handleSave}
            disabled={!canSave}
            className="px-3 py-1.5 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label={saving ? '保存中...' : '保存'}
          >
            {saving ? '保存中...' : '保存'}
          </button>
        </footer>
      </div>
    </div>
  )
}
