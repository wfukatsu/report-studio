import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import {
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
  Bold, Italic, Underline, Strikethrough,
} from 'lucide-react'
import type { TextStyle } from '@/types'
import { PropSection, PropRow, NumInput, ColorInput, SelectInput, IconToggle } from '@/elements/_base/sharedUI'
import {
  TextAlignTopIcon, TextAlignMiddleIcon, TextAlignBottomIcon,
  WritingHorizontalIcon, WritingVerticalIcon,
} from '@/elements/_base/TextVerticalAlignIcons'
import { FONT_FAMILIES, FONT_FAMILY_LABEL_KEYS, DEFAULT_FONT_SIZE, DEFAULT_LINE_HEIGHT } from '../constants'

// `as const satisfies` keeps `labelKey` literal so `t(o.labelKey)` type-checks
// against the typed i18next catalog (#329). `value` stays the textFit enum.
const TEXT_FIT_OPTIONS = [
  { value: 'clip', labelKey: 'blocks.textStyle.fitClip' },
  { value: 'shrinkText', labelKey: 'blocks.textStyle.fitShrink' },
  { value: 'expandFrame', labelKey: 'blocks.textStyle.fitExpand' },
] as const satisfies readonly { value: string; labelKey: string }[]

interface TextStyleSectionProps {
  style: TextStyle
  onStyleChange: (patch: Partial<TextStyle>) => void
  /**
   * Template-level default style (from report.defaultTextStyle).
   * When provided, inputs for properties where style[prop] === undefined
   * will show an "inherited" visual state with a reset (✕) button.
   */
  defaultStyle?: TextStyle
  /** Show furigana input (default: false) */
  showFurigana?: boolean
  furigana?: string
  onFuriganaChange?: (value: string | undefined) => void
}

export function TextStyleSection({
  style,
  onStyleChange,
  defaultStyle,
  showFurigana = false,
  furigana,
  onFuriganaChange,
}: TextStyleSectionProps) {
  const { t } = useTranslation('elements')
  const fontFamilyOptions = useMemo(
    () => FONT_FAMILIES.map((f) => ({ value: f, label: t(FONT_FAMILY_LABEL_KEYS[f]) })),
    [t],
  )
  // Helper: is the given property inherited from defaultStyle?
  const inh = <K extends keyof TextStyle>(key: K): boolean =>
    style[key] === undefined

  // Helper: reset a property back to "inherited" (undefined)
  const rst = <K extends keyof TextStyle>(key: K) =>
    defaultStyle ? () => onStyleChange({ [key]: undefined } as Partial<TextStyle>) : undefined

  return (
    <PropSection title={t('blocks.textStyle.title')}>
      <PropRow label={t('blocks.textStyle.font')}>
        <SelectInput
          value={style.fontFamily ?? defaultStyle?.fontFamily ?? 'sans-serif'}
          onChange={(v) => onStyleChange({ fontFamily: v })}
          options={fontFamilyOptions}
          inherited={defaultStyle ? inh('fontFamily') : undefined}
          onReset={rst('fontFamily')}
        />
      </PropRow>

      <PropRow label={t('blocks.textStyle.fontSize')}>
        <NumInput
          value={style.fontSize ?? defaultStyle?.fontSize ?? DEFAULT_FONT_SIZE}
          onChange={(v) => onStyleChange({ fontSize: v })}
          min={1}
          step={0.5}
          unit="pt"
          inherited={defaultStyle ? inh('fontSize') : undefined}
          onReset={rst('fontSize')}
        />
      </PropRow>

      <div>
        <span className="text-[10px] text-muted-foreground">{t('blocks.textStyle.style')}</span>
        <div className="flex gap-1 mt-1">
          <IconToggle
            active={style.fontWeight === 'bold'}
            onClick={() => onStyleChange({ fontWeight: style.fontWeight === 'bold' ? 'normal' : 'bold' })}
            title={t('blocks.textStyle.bold')}
          >
            <Bold className="w-3.5 h-3.5" />
          </IconToggle>
          <IconToggle
            active={style.fontStyle === 'italic'}
            onClick={() => onStyleChange({ fontStyle: style.fontStyle === 'italic' ? 'normal' : 'italic' })}
            title={t('blocks.textStyle.italic')}
          >
            <Italic className="w-3.5 h-3.5" />
          </IconToggle>
          <IconToggle
            active={style.textDecoration === 'underline'}
            onClick={() => onStyleChange({ textDecoration: style.textDecoration === 'underline' ? 'none' : 'underline' })}
            title={t('blocks.textStyle.underline')}
          >
            <Underline className="w-3.5 h-3.5" />
          </IconToggle>
          <IconToggle
            active={style.textDecoration === 'line-through'}
            onClick={() => onStyleChange({ textDecoration: style.textDecoration === 'line-through' ? 'none' : 'line-through' })}
            title={t('blocks.textStyle.strikethrough')}
          >
            <Strikethrough className="w-3.5 h-3.5" />
          </IconToggle>
        </div>
      </div>

      <PropRow label={t('blocks.textStyle.color')}>
        <ColorInput
          value={style.color ?? defaultStyle?.color ?? '#000000'}
          onChange={(v) => onStyleChange({ color: v })}
          inherited={defaultStyle ? inh('color') : undefined}
          onReset={rst('color')}
        />
      </PropRow>

      <PropRow label={t('blocks.textStyle.backgroundColor')}>
        <ColorInput
          value={style.backgroundColor ?? defaultStyle?.backgroundColor ?? '#ffffff'}
          onChange={(v) => onStyleChange({ backgroundColor: v })}
          inherited={defaultStyle ? inh('backgroundColor') : undefined}
          onReset={rst('backgroundColor')}
        />
      </PropRow>

      <div>
        <span className="text-[10px] text-muted-foreground">{t('blocks.textStyle.horizontalAlign')}</span>
        <div className="flex gap-1 mt-1">
          {(['left', 'center', 'right', 'justify'] as const).map((a) => (
            <IconToggle key={a} active={style.textAlign === a} onClick={() => onStyleChange({ textAlign: a })} title={a}>
              {a === 'left' && <AlignLeft className="w-3.5 h-3.5" />}
              {a === 'center' && <AlignCenter className="w-3.5 h-3.5" />}
              {a === 'right' && <AlignRight className="w-3.5 h-3.5" />}
              {a === 'justify' && <AlignJustify className="w-3.5 h-3.5" />}
            </IconToggle>
          ))}
        </div>
      </div>

      <div>
        <span className="text-[10px] text-muted-foreground">{t('blocks.textStyle.verticalAlign')}</span>
        <div className="flex gap-1 mt-1">
          {(['top', 'middle', 'bottom'] as const).map((va) => (
            <IconToggle key={va} active={style.verticalAlign === va} onClick={() => onStyleChange({ verticalAlign: va })} title={va}>
              {va === 'top' && <TextAlignTopIcon className="w-3.5 h-3.5" />}
              {va === 'middle' && <TextAlignMiddleIcon className="w-3.5 h-3.5" />}
              {va === 'bottom' && <TextAlignBottomIcon className="w-3.5 h-3.5" />}
            </IconToggle>
          ))}
        </div>
      </div>

      <PropRow label={t('blocks.textStyle.lineHeight')}>
        <NumInput
          value={style.lineHeight ?? defaultStyle?.lineHeight ?? DEFAULT_LINE_HEIGHT}
          onChange={(v) => onStyleChange({ lineHeight: v })}
          min={0.5}
          max={5}
          step={0.1}
          inherited={defaultStyle ? inh('lineHeight') : undefined}
          onReset={rst('lineHeight')}
        />
      </PropRow>

      <PropRow label={t('blocks.textStyle.letterSpacing')}>
        <NumInput
          value={style.letterSpacing ?? defaultStyle?.letterSpacing ?? 0}
          onChange={(v) => onStyleChange({ letterSpacing: v })}
          min={-0.2}
          max={2}
          step={0.05}
          unit="em"
          inherited={defaultStyle ? inh('letterSpacing') : undefined}
          onReset={rst('letterSpacing')}
        />
      </PropRow>

      <div>
        <span className="text-[10px] text-muted-foreground">{t('blocks.textStyle.textDirection')}</span>
        <div className="flex gap-1 mt-1">
          <IconToggle
            active={style.writingMode !== 'vertical-rl'}
            onClick={() => onStyleChange({ writingMode: 'horizontal-tb' })}
            title={t('blocks.textStyle.horizontalWriting')}
          >
            <WritingHorizontalIcon className="w-3.5 h-3.5" />
          </IconToggle>
          <IconToggle
            active={style.writingMode === 'vertical-rl'}
            onClick={() => onStyleChange({ writingMode: 'vertical-rl' })}
            title={t('blocks.textStyle.verticalWriting')}
          >
            <WritingVerticalIcon className="w-3.5 h-3.5" />
          </IconToggle>
        </div>
      </div>

      <PropRow label={t('blocks.textStyle.textFit')}>
        <SelectInput
          value={style.textFit ?? 'clip'}
          onChange={(v) => onStyleChange({ textFit: v === 'clip' ? undefined : v as 'shrinkText' | 'expandFrame' })}
          options={TEXT_FIT_OPTIONS.map((o) => ({ value: o.value, label: t(o.labelKey) }))}
        />
      </PropRow>

      {showFurigana && onFuriganaChange && (
        <PropRow label={t('blocks.textStyle.furigana')}>
          <input
            type="text"
            className="border rounded px-2 py-1 text-xs w-full bg-background"
            value={furigana ?? ''}
            placeholder={t('blocks.textStyle.furiganaPlaceholder')}
            onChange={(e) => onFuriganaChange(e.target.value || undefined)}
          />
        </PropRow>
      )}
    </PropSection>
  )
}
