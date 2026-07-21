import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { useReportStore } from '@/store'
import type { Product, ProductCustomFieldDef, CreateProductRequest, UpdateProductPayload, CustomFieldValue } from '@/types'
import { DuplicateCodeError, VersionConflictError } from '@/api/reportApi'

interface Props {
  product: Product | null // null = new product
  onClose: () => void
}

type FormState = {
  code: string
  name: string
  unitPrice: string
  category: string
  description: string
  stockCount: string
  taxType: 'none' | 'standard' | 'reduced'
  unit: string
  manufacturer: string
  subscriptionPeriod: string
  subscriptionPriceUnit: string
  customFields: Record<string, string>
}

function toFormState(product: Product | null, defs: ProductCustomFieldDef[]): FormState {
  if (!product) {
    return {
      code: '',
      name: '',
      unitPrice: '0',
      category: '',
      description: '',
      stockCount: '0',
      taxType: 'none',
      unit: '',
      manufacturer: '',
      subscriptionPeriod: '',
      subscriptionPriceUnit: '',
      customFields: Object.fromEntries(defs.map((d) => [d.key, ''])),
    }
  }
  return {
    code: product.code,
    name: product.name,
    unitPrice: String(product.unitPrice),
    category: product.category,
    description: product.description,
    stockCount: String(product.stockCount),
    taxType: product.taxType,
    unit: product.unit,
    manufacturer: product.manufacturer,
    subscriptionPeriod: product.subscriptionPeriod ?? '',
    subscriptionPriceUnit: product.subscriptionPriceUnit ?? '',
    customFields: Object.fromEntries(
      defs.map((d) => {
        const val = product.customFields?.[d.key]
        return [d.key, val != null ? String(val) : '']
      }),
    ),
  }
}

export function ProductEditDialog({ product, onClose }: Props) {
  const { t } = useTranslation('modals')
  // Snapshot customFieldDefs at open time so background updates don't mutate form
  const [frozenDefs] = useState<ProductCustomFieldDef[]>(() =>
    useReportStore.getState().customFieldDefs,
  )
  const addProduct = useReportStore((s) => s.addProduct)
  const updateProduct = useReportStore((s) => s.updateProduct)
  const setProductOp = useReportStore((s) => s.setProductOp)

  const [form, setForm] = useState<FormState>(() => toFormState(product, frozenDefs))
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof FormState, string>>>({})

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
    setFieldErrors((prev) => ({ ...prev, [key]: undefined }))
  }

  function setCustomField(key: string, value: string) {
    setForm((prev) => ({
      ...prev,
      customFields: { ...prev.customFields, [key]: value },
    }))
  }

  function validate(): boolean {
    const errors: Partial<Record<keyof FormState, string>> = {}
    if (!form.code.trim()) errors.code = t('productEditDialog.codeRequired')
    if (!form.name.trim()) errors.name = t('productEditDialog.nameRequired')
    if (isNaN(Number(form.unitPrice)) || Number(form.unitPrice) < 0) {
      errors.unitPrice = t('productEditDialog.unitPriceInvalid')
    }
    if (isNaN(Number(form.stockCount)) || Number(form.stockCount) < 0) {
      errors.stockCount = t('productEditDialog.stockCountInvalid')
    }
    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }

  async function handleSave() {
    if (!validate()) return
    setIsSubmitting(true)
    setError(null)

    if (product) {
      setProductOp(product.id, 'saving')
    }

    try {
      const customFields: Record<string, CustomFieldValue> = {}
      for (const def of frozenDefs) {
        const raw = form.customFields[def.key] ?? ''
        if (def.type === 'number') {
          customFields[def.key] = raw === '' ? null : Number(raw)
        } else if (def.type === 'boolean') {
          customFields[def.key] = raw === 'true'
        } else {
          customFields[def.key] = raw === '' ? null : raw
        }
      }

      if (product) {
        // Update existing
        const patch: UpdateProductPayload = {
          code: form.code.trim(),
          name: form.name.trim(),
          unitPrice: Number(form.unitPrice),
          category: form.category.trim(),
          description: form.description.trim(),
          stockCount: Math.floor(Number(form.stockCount)),
          taxType: form.taxType,
          unit: form.unit.trim(),
          manufacturer: form.manufacturer.trim(),
          subscriptionPeriod: form.subscriptionPeriod.trim() || null,
          subscriptionPriceUnit: form.subscriptionPriceUnit.trim() || null,
          customFields,
        }
        await updateProduct(product.id, patch, product.version)
      } else {
        // Create new
        const req: CreateProductRequest = {
          code: form.code.trim(),
          name: form.name.trim(),
          unitPrice: Number(form.unitPrice),
          category: form.category.trim(),
          description: form.description.trim(),
          stockCount: Math.floor(Number(form.stockCount)),
          taxType: form.taxType,
          unit: form.unit.trim(),
          manufacturer: form.manufacturer.trim(),
          subscriptionPeriod: form.subscriptionPeriod.trim() || null,
          subscriptionPriceUnit: form.subscriptionPriceUnit.trim() || null,
          customFields,
        }
        await addProduct(req)
      }
      onClose()
    } catch (e) {
      if (e instanceof DuplicateCodeError) {
        setFieldErrors((prev) => ({ ...prev, code: t('productEditDialog.codeDuplicate') }))
      } else if (e instanceof VersionConflictError) {
        toast.error(t('productEditDialog.versionConflict'), { duration: 8000 })
        onClose()
      } else {
        setError(t('productEditDialog.saveFailed'))
      }
    } finally {
      setIsSubmitting(false)
      if (product) setProductOp(product.id, 'idle')
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40"
      role="dialog"
      aria-modal="true"
      aria-label={product ? t('productEditDialog.editTitle') : t('productEditDialog.addTitle')}
      onKeyDown={(e) => { if (e.key === 'Escape' && !isSubmitting) onClose() }}
    >
      <div className="bg-background border border-border rounded-lg shadow-xl w-[560px] max-h-[90vh] flex flex-col mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
          <h3 className="text-sm font-semibold">{product ? t('productEditDialog.editTitle') : t('productEditDialog.addTitle')}</h3>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            aria-label={t('productEditDialog.close')}
            className="text-muted-foreground hover:text-foreground text-xs px-2 py-1 rounded hover:bg-accent"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="flex flex-col gap-3">
            {/* Code + Name */}
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium">
                  {t('productEditDialog.code')} <span className="text-red-500">*</span>
                </label>
                <input
                  value={form.code}
                  onChange={(e) => setField('code', e.target.value)}
                  placeholder={t('productEditDialog.codePlaceholder')}
                  className={`border rounded px-2 py-1 text-xs bg-background font-mono ${fieldErrors.code ? 'border-red-500' : ''}`}
                />
                {fieldErrors.code && <p className="text-[10px] text-red-500">{fieldErrors.code}</p>}
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium">
                  {t('productEditDialog.name')} <span className="text-red-500">*</span>
                </label>
                <input
                  value={form.name}
                  onChange={(e) => setField('name', e.target.value)}
                  placeholder={t('productEditDialog.namePlaceholder')}
                  className={`border rounded px-2 py-1 text-xs bg-background ${fieldErrors.name ? 'border-red-500' : ''}`}
                />
                {fieldErrors.name && <p className="text-[10px] text-red-500">{fieldErrors.name}</p>}
              </div>
            </div>

            {/* Price + Tax */}
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium">{t('productEditDialog.unitPrice')}</label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={form.unitPrice}
                  onChange={(e) => setField('unitPrice', e.target.value)}
                  className={`border rounded px-2 py-1 text-xs bg-background ${fieldErrors.unitPrice ? 'border-red-500' : ''}`}
                />
                {fieldErrors.unitPrice && <p className="text-[10px] text-red-500">{fieldErrors.unitPrice}</p>}
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium">{t('productEditDialog.taxType')}</label>
                <select
                  value={form.taxType}
                  onChange={(e) => setField('taxType', e.target.value as FormState['taxType'])}
                  className="border rounded px-2 py-1 text-xs bg-background"
                >
                  <option value="none">{t('productEditDialog.taxNone')}</option>
                  <option value="standard">{t('productEditDialog.taxStandard')}</option>
                  <option value="reduced">{t('productEditDialog.taxReduced')}</option>
                </select>
              </div>
            </div>

            {/* Category + Unit */}
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium">{t('productEditDialog.category')}</label>
                <input
                  value={form.category}
                  onChange={(e) => setField('category', e.target.value)}
                  className="border rounded px-2 py-1 text-xs bg-background"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium">{t('productEditDialog.unit')}</label>
                <input
                  value={form.unit}
                  onChange={(e) => setField('unit', e.target.value)}
                  placeholder={t('productEditDialog.unitPlaceholder')}
                  className="border rounded px-2 py-1 text-xs bg-background"
                />
              </div>
            </div>

            {/* Stock + Manufacturer */}
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium">{t('productEditDialog.stockCount')}</label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={form.stockCount}
                  onChange={(e) => setField('stockCount', e.target.value)}
                  className={`border rounded px-2 py-1 text-xs bg-background ${fieldErrors.stockCount ? 'border-red-500' : ''}`}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium">{t('productEditDialog.manufacturer')}</label>
                <input
                  value={form.manufacturer}
                  onChange={(e) => setField('manufacturer', e.target.value)}
                  className="border rounded px-2 py-1 text-xs bg-background"
                />
              </div>
            </div>

            {/* Description */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium">{t('productEditDialog.description')}</label>
              <textarea
                value={form.description}
                onChange={(e) => setField('description', e.target.value)}
                rows={2}
                className="border rounded px-2 py-1 text-xs bg-background resize-none"
              />
            </div>

            {/* Subscription */}
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium">{t('productEditDialog.subscriptionPeriod')}</label>
                <input
                  value={form.subscriptionPeriod}
                  onChange={(e) => setField('subscriptionPeriod', e.target.value)}
                  placeholder={t('productEditDialog.subscriptionPeriodPlaceholder')}
                  className="border rounded px-2 py-1 text-xs bg-background"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium">{t('productEditDialog.subscriptionPriceUnit')}</label>
                <input
                  value={form.subscriptionPriceUnit}
                  onChange={(e) => setField('subscriptionPriceUnit', e.target.value)}
                  placeholder={t('productEditDialog.subscriptionPriceUnitPlaceholder')}
                  className="border rounded px-2 py-1 text-xs bg-background"
                />
              </div>
            </div>

            {/* Custom fields */}
            {frozenDefs.length > 0 && (
              <div className="flex flex-col gap-2 border-t pt-3 mt-1">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  {t('productEditDialog.customFields')}
                </p>
                {frozenDefs.map((def) => (
                  <div key={def.key} className="flex flex-col gap-1">
                    <label className="text-xs font-medium">{def.label}</label>
                    {def.type === 'boolean' ? (
                      <select
                        value={form.customFields[def.key] ?? ''}
                        onChange={(e) => setCustomField(def.key, e.target.value)}
                        className="border rounded px-2 py-1 text-xs bg-background"
                      >
                        <option value="">{t('productEditDialog.unset')}</option>
                        <option value="true">{t('productEditDialog.yes')}</option>
                        <option value="false">{t('productEditDialog.no')}</option>
                      </select>
                    ) : (
                      <input
                        type={def.type === 'number' ? 'number' : def.type === 'date' ? 'date' : 'text'}
                        value={form.customFields[def.key] ?? ''}
                        onChange={(e) => setCustomField(def.key, e.target.value)}
                        className="border rounded px-2 py-1 text-xs bg-background"
                      />
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Price history (read-only) */}
            {product && product.priceHistory.length > 0 && (
              <details className="border-t pt-3 mt-1">
                <summary className="text-xs font-medium cursor-pointer text-muted-foreground hover:text-foreground">
                  {t('productEditDialog.priceHistory', { n: product.priceHistory.length })}
                </summary>
                <table className="w-full text-[10px] mt-2" aria-label={t('productEditDialog.priceHistoryLabel')}>
                  <thead>
                    <tr>
                      <th className="text-left font-medium text-muted-foreground py-1">{t('productEditDialog.effectiveFrom')}</th>
                      <th className="text-right font-medium text-muted-foreground py-1">{t('productEditDialog.price')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {product.priceHistory.map((h, i) => (
                      <tr key={i}>
                        <td className="py-0.5 text-muted-foreground">{h.effectiveFrom}</td>
                        <td className="py-0.5 text-right">{t('productEditDialog.priceYen', { price: h.price.toLocaleString('ja-JP') })}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>
            )}

            {error && <p className="text-xs text-red-500">{error}</p>}
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-4 py-3 border-t shrink-0">
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="px-3 py-1.5 text-xs border rounded hover:bg-accent transition-colors disabled:opacity-60"
          >
            {t('productEditDialog.cancel')}
          </button>
          <button
            onClick={handleSave}
            disabled={isSubmitting}
            className="px-3 py-1.5 text-xs bg-primary text-primary-foreground rounded hover:opacity-90 disabled:opacity-60 transition-opacity"
          >
            {isSubmitting ? t('productEditDialog.saving') : t('productEditDialog.save')}
          </button>
        </div>
      </div>
    </div>
  )
}
