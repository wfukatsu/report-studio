import { useRef } from 'react'
import { toast } from 'sonner'
import { isSafeImageSrc } from '@/lib/exportUtils'

const MAX_RASTER_SIZE = 2 * 1024 * 1024 // 2 MB

interface TenantLogoFieldProps {
  /** Current logo as a data URI (from `TenantInfo.logoBase64`). */
  value: string | undefined
  /** Called with the new data URI, or `undefined` when the logo is removed. */
  onChange: (dataUrl: string | undefined) => void
}

/**
 * Logo upload control shared by the admin テナント情報 panel
 * (`TenantSettings`) and the データ設定 modal (`TenantInfoTab`) so both editors
 * offer the same capability (issue #183). Validates size (≤2MB) and format
 * (`isSafeImageSrc`) before emitting the data URI.
 */
export function TenantLogoField({ value, onChange }: TenantLogoFieldProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    if (file.size > MAX_RASTER_SIZE) {
      toast.error('ファイルサイズが 2MB を超えています。')
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result as string
      if (!isSafeImageSrc(dataUrl)) {
        toast.error('安全でない画像形式です。PNG/JPG/GIF/WebP を使用してください。')
        return
      }
      onChange(dataUrl)
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        className="py-1.5 px-3 text-xs text-blue-600 hover:text-blue-800 border border-dashed rounded hover:bg-blue-50 transition-colors w-fit"
        onClick={() => fileInputRef.current?.click()}
      >
        ファイルを選択... (PNG/JPG/GIF/WebP, 最大 2MB)
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept=".png,.jpg,.jpeg,.gif,.webp"
        className="hidden"
        onChange={handleLogoUpload}
      />
      {value && isSafeImageSrc(value) && (
        <div className="flex items-center gap-3">
          <div className="border rounded p-1 bg-muted/30 w-20 h-12 flex items-center justify-center">
            <img src={value} alt="ロゴプレビュー" className="max-w-full max-h-full object-contain" />
          </div>
          <button
            type="button"
            className="text-xs text-red-500 hover:text-red-700"
            onClick={() => onChange(undefined)}
          >
            削除
          </button>
        </div>
      )}
    </div>
  )
}
