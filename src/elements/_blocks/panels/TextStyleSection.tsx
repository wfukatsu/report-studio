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
  /** Show furigana input (default: false) */
  showFurigana?: boolean
  furigana?: string
  onFuriganaChange?: (value: string | undefined) => void
}

export function TextStyleSection({
  style,
  onStyleChange,
  showFurigana = false,
  furigana,
  onFuriganaChange,
}: TextStyleSectionProps) {
  return (
    <PropSection title="テキストスタイル">
      <PropRow label="フォント">
        <SelectInput
          value={style.fontFamily ?? 'sans-serif'}
          onChange={(v) => onStyleChange({ fontFamily: v })}
          options={fontFamilyOptions}
        />
      </PropRow>

      <PropRow label="フォントサイズ">
        <NumInput
          value={style.fontSize ?? DEFAULT_FONT_SIZE}
          onChange={(v) => onStyleChange({ fontSize: v })}
          min={1}
          step={0.5}
          unit="mm"
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
        <ColorInput value={style.color ?? '#000000'} onChange={(v) => onStyleChange({ color: v })} />
      </PropRow>

      <PropRow label="背景色">
        <ColorInput value={style.backgroundColor ?? '#ffffff'} onChange={(v) => onStyleChange({ backgroundColor: v })} />
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
          value={style.lineHeight ?? DEFAULT_LINE_HEIGHT}
          onChange={(v) => onStyleChange({ lineHeight: v })}
          min={0.5}
          max={5}
          step={0.1}
        />
      </PropRow>

      <PropRow label="文字間隔">
        <NumInput
          value={style.letterSpacing ?? 0}
          onChange={(v) => onStyleChange({ letterSpacing: v })}
          min={-0.2}
          max={2}
          step={0.05}
          unit="em"
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
