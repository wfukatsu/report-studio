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
import { FONT_FAMILIES, DEFAULT_FONT_SIZE, DEFAULT_LINE_HEIGHT } from '../constants'

const fontFamilyOptions = FONT_FAMILIES.map((f) => ({ value: f, label: f }))

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
  // Helper: is the given property inherited from defaultStyle?
  const inh = <K extends keyof TextStyle>(key: K): boolean =>
    style[key] === undefined

  // Helper: reset a property back to "inherited" (undefined)
  const rst = <K extends keyof TextStyle>(key: K) =>
    defaultStyle ? () => onStyleChange({ [key]: undefined } as Partial<TextStyle>) : undefined

  return (
    <PropSection title="テキストスタイル">
      <PropRow label="フォント">
        <SelectInput
          value={style.fontFamily ?? defaultStyle?.fontFamily ?? 'sans-serif'}
          onChange={(v) => onStyleChange({ fontFamily: v })}
          options={fontFamilyOptions}
          inherited={defaultStyle ? inh('fontFamily') : undefined}
          onReset={rst('fontFamily')}
        />
      </PropRow>

      <PropRow label="フォントサイズ">
        <NumInput
          value={style.fontSize ?? defaultStyle?.fontSize ?? DEFAULT_FONT_SIZE}
          onChange={(v) => onStyleChange({ fontSize: v })}
          min={1}
          step={0.5}
          unit="mm"
          inherited={defaultStyle ? inh('fontSize') : undefined}
          onReset={rst('fontSize')}
        />
      </PropRow>

      <div>
        <span className="text-[10px] text-muted-foreground">スタイル</span>
        <div className="flex gap-1 mt-1">
          <IconToggle
            active={style.fontWeight === 'bold'}
            onClick={() => onStyleChange({ fontWeight: style.fontWeight === 'bold' ? 'normal' : 'bold' })}
            title="太字"
          >
            <Bold className="w-3.5 h-3.5" />
          </IconToggle>
          <IconToggle
            active={style.fontStyle === 'italic'}
            onClick={() => onStyleChange({ fontStyle: style.fontStyle === 'italic' ? 'normal' : 'italic' })}
            title="斜体"
          >
            <Italic className="w-3.5 h-3.5" />
          </IconToggle>
          <IconToggle
            active={style.textDecoration === 'underline'}
            onClick={() => onStyleChange({ textDecoration: style.textDecoration === 'underline' ? 'none' : 'underline' })}
            title="下線"
          >
            <Underline className="w-3.5 h-3.5" />
          </IconToggle>
          <IconToggle
            active={style.textDecoration === 'line-through'}
            onClick={() => onStyleChange({ textDecoration: style.textDecoration === 'line-through' ? 'none' : 'line-through' })}
            title="打ち消し線"
          >
            <Strikethrough className="w-3.5 h-3.5" />
          </IconToggle>
        </div>
      </div>

      <PropRow label="文字色">
        <ColorInput
          value={style.color ?? defaultStyle?.color ?? '#000000'}
          onChange={(v) => onStyleChange({ color: v })}
          inherited={defaultStyle ? inh('color') : undefined}
          onReset={rst('color')}
        />
      </PropRow>

      <PropRow label="背景色">
        <ColorInput
          value={style.backgroundColor ?? defaultStyle?.backgroundColor ?? '#ffffff'}
          onChange={(v) => onStyleChange({ backgroundColor: v })}
          inherited={defaultStyle ? inh('backgroundColor') : undefined}
          onReset={rst('backgroundColor')}
        />
      </PropRow>

      <div>
        <span className="text-[10px] text-muted-foreground">横揃え</span>
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
        <span className="text-[10px] text-muted-foreground">縦揃え</span>
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

      <PropRow label="行間">
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

      <PropRow label="文字間隔">
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
        <span className="text-[10px] text-muted-foreground">文字方向</span>
        <div className="flex gap-1 mt-1">
          <IconToggle
            active={style.writingMode !== 'vertical-rl'}
            onClick={() => onStyleChange({ writingMode: 'horizontal-tb' })}
            title="横書き"
          >
            <WritingHorizontalIcon className="w-3.5 h-3.5" />
          </IconToggle>
          <IconToggle
            active={style.writingMode === 'vertical-rl'}
            onClick={() => onStyleChange({ writingMode: 'vertical-rl' })}
            title="縦書き"
          >
            <WritingVerticalIcon className="w-3.5 h-3.5" />
          </IconToggle>
        </div>
      </div>

      {showFurigana && onFuriganaChange && (
        <PropRow label="ふりがな">
          <input
            type="text"
            className="border rounded px-2 py-1 text-xs w-full bg-background"
            value={furigana ?? ''}
            placeholder="ふりがな"
            onChange={(e) => onFuriganaChange(e.target.value || undefined)}
          />
        </PropRow>
      )}
    </PropSection>
  )
}
