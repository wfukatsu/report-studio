/**
 * SaveTemplateDialog — name input dialog for saving a new template to backend.
 */

import { useState, useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import { BUILTIN_TEMPLATES } from '@/templates/builtinTemplates'
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

export function SaveTemplateDialog({ open, onSave, onCancel, defaultName = '', defaultCategory, defaultTags = [], saving = false }: Props) {
  const [name, setName] = useState(defaultName)
  const [category, setCategory] = useState<string | undefined>(defaultCategory)
  const [tags, setTags] = useState<string[]>(defaultTags)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setName(defaultName)
      setCategory(defaultCategory)
      setTags(defaultTags)
      // Focus input after dialog opens
      requestAnimationFrame(() => inputRef.current?.select())
    }
  }, [open, defaultName, defaultCategory, defaultTags])

  if (!open) return null

  const canSave = name.trim().length > 0 && !saving

  const handleSave = () => {
    if (canSave) onSave(name.trim(), category, tags.length > 0 ? tags : undefined)
  }

  const categoryOptions = [...new Set(BUILTIN_TEMPLATES.map((t) => t.category).filter(Boolean) as string[])]

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
              if (e.key === 'Enter') handleSave()
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
