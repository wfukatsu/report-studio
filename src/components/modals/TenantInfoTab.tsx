import { useRef, useState } from 'react'
import { useReportStore } from '@/store/reportStore'
import type { TenantInfo } from '@/types'
import { isSafeImageSrc } from '@/lib/exportUtils'
import { PropRow } from '@/elements/_base/sharedUI'

const MAX_RASTER_SIZE = 2 * 1024 * 1024 // 2 MB
const MAX_CUSTOM_FIELDS = 20

export function TenantInfoTab() {
  const tenantInfo = useReportStore((s) => s.tenantInfo)
  const updateTenantInfo = useReportStore((s) => s.updateTenantInfo)
  const tenantLoading = useReportStore((s) => s.tenantLoading)

  // Local form state — initialized from store, saved on submit
  const [form, setForm] = useState<TenantInfo>(() => tenantInfo ?? {})
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const customEntries = Object.entries(form.custom ?? {})

  function setField<K extends keyof TenantInfo>(key: K, value: TenantInfo[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    if (file.size > MAX_RASTER_SIZE) {
      alert('ファイルサイズが 2MB を超えています。')
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result as string
      if (!isSafeImageSrc(dataUrl)) {
        alert('安全でない画像形式です。PNG/JPG/GIF/WebP を使用してください。')
        return
      }
      setField('logoBase64', dataUrl)
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  function addCustomField() {
    if (customEntries.length >= MAX_CUSTOM_FIELDS) return
    const newKey = `field${customEntries.length + 1}`
    setField('custom', { ...(form.custom ?? {}), [newKey]: '' })
  }

  function updateCustomKey(oldKey: string, newKey: string) {
    const current = { ...(form.custom ?? {}) }
    const value = current[oldKey] ?? ''
    delete current[oldKey]
    current[newKey] = value
    setField('custom', current)
  }

  function updateCustomValue(key: string, value: string) {
    setField('custom', { ...(form.custom ?? {}), [key]: value })
  }

  function removeCustomField(key: string) {
    const current = { ...(form.custom ?? {}) }
    delete current[key]
    setField('custom', current)
  }

  async function handleSave() {
    setSaving(true)
    setSaveError(null)
    setSaveSuccess(false)
    try {
      await updateTenantInfo(form)
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 3000)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : '保存に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  if (tenantLoading) {
    return <div className="p-6 text-xs text-muted-foreground">テナント情報を読み込んでいます...</div>
  }

  return (
    <div className="p-4 flex flex-col gap-6">

      {/* Basic info */}
      <section>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">基本情報</p>
        <div className="flex flex-col gap-2">
          <PropRow label="会社名">
            <input
              type="text"
              className="border rounded px-2 py-1 text-xs w-full bg-background"
              placeholder="株式会社サンプル"
              value={form.companyName ?? ''}
              onChange={(e) => setField('companyName', e.target.value)}
            />
          </PropRow>
          <PropRow label="代表者名">
            <input
              type="text"
              className="border rounded px-2 py-1 text-xs w-full bg-background"
              placeholder="山田太郎"
              value={form.representativeName ?? ''}
              onChange={(e) => setField('representativeName', e.target.value)}
            />
          </PropRow>
          <PropRow label="郵便番号">
            <input
              type="text"
              className="border rounded px-2 py-1 text-xs w-full bg-background"
              placeholder="100-0001"
              value={form.postalCode ?? ''}
              onChange={(e) => setField('postalCode', e.target.value)}
            />
          </PropRow>
          <PropRow label="住所">
            <input
              type="text"
              className="border rounded px-2 py-1 text-xs w-full bg-background"
              placeholder="東京都千代田区..."
              value={form.address ?? ''}
              onChange={(e) => setField('address', e.target.value)}
            />
          </PropRow>
          <PropRow label="電話番号">
            <input
              type="text"
              className="border rounded px-2 py-1 text-xs w-full bg-background"
              placeholder="03-1234-5678"
              value={form.phone ?? ''}
              onChange={(e) => setField('phone', e.target.value)}
            />
          </PropRow>
          <PropRow label="メール">
            <input
              type="email"
              className="border rounded px-2 py-1 text-xs w-full bg-background"
              placeholder="info@example.com"
              value={form.email ?? ''}
              onChange={(e) => setField('email', e.target.value)}
            />
          </PropRow>
        </div>
      </section>

      {/* Logo */}
      <section>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">ロゴ画像</p>
        <div className="flex flex-col gap-2">
          <button
            type="button"
            className="py-1.5 px-3 text-xs text-blue-600 hover:text-blue-800 border border-dashed rounded hover:bg-blue-50 transition-colors w-fit"
            onClick={() => fileInputRef.current?.click()}
          >
            ファイルを選択... (PNG/JPG/WebP, 最大 2MB)
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".png,.jpg,.jpeg,.gif,.webp"
            className="hidden"
            onChange={handleLogoUpload}
          />
          {form.logoBase64 && isSafeImageSrc(form.logoBase64) && (
            <div className="flex items-center gap-3">
              <div className="border rounded p-1 bg-muted/30 w-20 h-12 flex items-center justify-center">
                <img src={form.logoBase64} alt="ロゴプレビュー" className="max-w-full max-h-full object-contain" />
              </div>
              <button
                type="button"
                className="text-xs text-red-500 hover:text-red-700"
                onClick={() => setField('logoBase64', undefined)}
              >
                削除
              </button>
            </div>
          )}
        </div>
      </section>

      {/* Custom fields */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">カスタムフィールド</p>
          <button
            type="button"
            disabled={customEntries.length >= MAX_CUSTOM_FIELDS}
            onClick={addCustomField}
            className="text-xs px-2 py-0.5 bg-primary text-primary-foreground rounded hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            + 追加
          </button>
        </div>
        {customEntries.length === 0 && (
          <p className="text-[10px] text-muted-foreground">カスタムフィールドはありません。「+ 追加」ボタンで追加できます。</p>
        )}
        {customEntries.map(([key, value]) => (
          <div key={key} className="flex gap-1 mb-1 items-center">
            <input
              type="text"
              className="border rounded px-2 py-1 text-xs w-1/3 bg-background font-mono"
              placeholder="フィールド名"
              value={key}
              onChange={(e) => updateCustomKey(key, e.target.value)}
            />
            <span className="text-muted-foreground text-xs">:</span>
            <input
              type="text"
              className="border rounded px-2 py-1 text-xs flex-1 bg-background"
              placeholder="値"
              value={value}
              onChange={(e) => updateCustomValue(key, e.target.value)}
            />
            <button
              type="button"
              onClick={() => removeCustomField(key)}
              className="text-xs text-red-400 hover:text-red-600 px-1"
              aria-label="このフィールドを削除"
            >
              ✕
            </button>
          </div>
        ))}
        {customEntries.length >= MAX_CUSTOM_FIELDS && (
          <p className="text-[10px] text-muted-foreground mt-1">最大 {MAX_CUSTOM_FIELDS} フィールドまで追加できます。</p>
        )}
      </section>

      {/* Save button */}
      <div className="flex items-center gap-3 pt-2 border-t">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-1.5 text-xs bg-primary text-primary-foreground rounded hover:opacity-90 disabled:opacity-60"
        >
          {saving ? '保存中...' : '保存'}
        </button>
        {saveSuccess && <span className="text-xs text-green-600">保存しました</span>}
        {saveError && <span className="text-xs text-red-500">{saveError}</span>}
      </div>
    </div>
  )
}
