/**
 * SchemaLibraryModal — Browse, apply, and manage saved schema definitions.
 *
 * Opened from BindingEditor's "ライブラリから適用" button.
 * Lists own + shared schemas. Click "適用" to copy schema into current template.
 */

import { useCallback, useEffect, useState } from 'react'
import { Database, Globe, Lock, Loader2, Trash2 } from 'lucide-react'
import {
  listSchemaLibrary,
  getSchemaLibraryItem,
  deleteSchemaLibraryItem,
} from '@/api/reportApi'
import type { SchemaLibraryItem } from '@/api/reportApi'
import { useReportStore } from '@/store/reportStore'

interface Props {
  open: boolean
  onClose: () => void
}

export function SchemaLibraryModal({ open, onClose }: Props) {
  const [items, setItems] = useState<SchemaLibraryItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [applying, setApplying] = useState<string | null>(null)

  const setSchema = useReportStore((s) => s.setSchema)
  const currentUser = useReportStore((s) => s.currentUser)

  const fetchList = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await listSchemaLibrary()
      setItems(result.items)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'スキーマ一覧の取得に失敗しました')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (open) fetchList()
  }, [open, fetchList])

  const handleApply = useCallback(async (id: string) => {
    setApplying(id)
    try {
      const def = await getSchemaLibraryItem(id)
      if (def.schema) {
        setSchema(def.schema)
      }
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'スキーマの適用に失敗しました')
    } finally {
      setApplying(null)
    }
  }, [setSchema, onClose])

  const handleDelete = useCallback(async (id: string) => {
    try {
      await deleteSchemaLibraryItem(id)
      setItems((prev) => prev.filter((item) => item.id !== id))
    } catch (e) {
      setError(e instanceof Error ? e.message : '削除に失敗しました')
    }
  }, [])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="bg-background border rounded-lg shadow-xl w-full max-w-lg mx-4 max-h-[70vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-3 border-b shrink-0">
          <Database className="w-4 h-4 text-[#6366f1]" />
          <h3 className="text-sm font-medium flex-1">スキーマライブラリ</h3>
          <button
            className="text-muted-foreground hover:text-foreground text-lg leading-none"
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {loading && (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          )}

          {error && (
            <div className="px-4 py-3 text-xs text-destructive">
              {error}
              <button className="ml-2 text-primary hover:underline" onClick={fetchList}>
                再試行
              </button>
            </div>
          )}

          {!loading && !error && items.length === 0 && (
            <div className="flex flex-col items-center justify-center h-32 gap-2 text-center">
              <Database className="w-8 h-8 text-muted-foreground/30" />
              <p className="text-xs text-muted-foreground">
                保存済みスキーマがありません。
                <br />
                バインドタブで「ライブラリに保存」してください。
              </p>
            </div>
          )}

          {!loading && items.map((item) => {
            const isOwner = currentUser?.userId === item.createdBy
            return (
              <div
                key={item.id}
                className="flex items-center gap-3 px-4 py-3 border-b last:border-b-0 hover:bg-muted/30 transition-colors"
              >
                {/* Visibility icon */}
                {item.visibility === 'shared' ? (
                  <Globe className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                ) : (
                  <Lock className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                )}

                {/* Name + meta */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{item.name}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {item.visibility === 'shared' ? '共有' : 'プライベート'}
                    {!isOwner && item.createdBy && ` · ${item.createdBy}`}
                  </p>
                </div>

                {/* Actions */}
                <button
                  className="px-3 py-1 text-xs bg-primary text-primary-foreground rounded hover:opacity-90 transition-opacity shrink-0"
                  onClick={() => handleApply(item.id)}
                  disabled={applying !== null}
                >
                  {applying === item.id ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    '適用'
                  )}
                </button>

                {isOwner && (
                  <button
                    className="p-1 text-muted-foreground hover:text-destructive shrink-0"
                    onClick={() => handleDelete(item.id)}
                    title="削除"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
