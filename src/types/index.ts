// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

export interface Position {
  x: number
  y: number
}

export interface Size {
  width: number
  height: number
}

// ---------------------------------------------------------------------------
// TextStyle — 16 props (all optional → CSS inherit model)
// ---------------------------------------------------------------------------

export interface TextStyle {
  // フォント
  fontSize?: number               // mm 単位
  fontFamily?: string
  fontWeight?: 'normal' | 'bold'
  fontStyle?: 'normal' | 'italic'
  textDecoration?: 'none' | 'underline' | 'line-through'
  // 色・背景
  color?: string                  // '#RRGGBB'
  backgroundColor?: string        // 'transparent' or '#RRGGBB'
  // 配置
  textAlign?: 'left' | 'center' | 'right' | 'justify'
  verticalAlign?: 'top' | 'middle' | 'bottom'
  // 余白・行間・文字間
  letterSpacing?: number          // em 単位
  lineHeight?: number             // 倍率 (例: 1.5)
  paddingTop?: number             // mm
  paddingRight?: number           // mm
  paddingBottom?: number          // mm
  paddingLeft?: number            // mm
  // 日本語
  writingMode?: 'horizontal-tb' | 'vertical-rl'
}

// ---------------------------------------------------------------------------
// Format types (DataFieldElement / CalculationRule で使用)
// ---------------------------------------------------------------------------

export type NumberFormatType =
  | 'integer'
  | 'decimal'
  | 'currency_jpy'
  | 'currency_usd'
  | 'percent'
  | 'comma'
  | 'kanji_numeral'   // 大字: 金壱百万円也
  | 'custom'

export type DateFormatType =
  | 'yyyy/MM/dd'
  | 'yyyy年MM月dd日'
  | 'MM/dd/yyyy'
  | 'wareki_full'     // 令和8年4月1日
  | 'wareki_short'    // R8.04.01
  | 'custom'

export interface CalculationFormat {
  type: NumberFormatType | DateFormatType
  decimalPlaces?: number
  customPattern?: string
}

// ---------------------------------------------------------------------------
// CalculationRule / TemplateVariable
// ---------------------------------------------------------------------------

export type CalculationResultType = 'number' | 'string' | 'boolean'
export type OnErrorBehavior = 'zero' | 'empty' | 'error_text'

export interface CalculationRule {
  /** Stable UUID — never changes, used as React list key. */
  id: string
  key: string
  label: string
  description?: string
  expression: string
  format?: CalculationFormat
  resultType: CalculationResultType
  onError: OnErrorBehavior
}

export interface TemplateVariable {
  key: string
  label: string
  description?: string
  defaultValue: string
}

// ---------------------------------------------------------------------------
// ElementType
// ---------------------------------------------------------------------------

export type ElementType =
  // テキスト系
  | 'text'
  | 'label'
  // データ表示系
  | 'dataField'
  | 'table'
  | 'chart'
  // 繰り返し系
  | 'repeatingBand'
  | 'repeatingList'
  // 図形・画像系
  | 'shape'
  | 'image'
  | 'barcode'
  // 記入欄系
  | 'manualEntry'
  // 日本語帳票専用
  | 'hanko'
  | 'approvalStampRow'
  | 'revenueStamp'
  // 帳票専用テーブル
  | 'formTable'
  // チェックボックス
  | 'checkbox'
  // 和暦元号選択
  | 'eraSelect'

// ---------------------------------------------------------------------------
// SchemaDefinition — optional data schema (master/detail groups + fields)
// ---------------------------------------------------------------------------

export type SchemaFieldType = 'string' | 'number' | 'date' | 'boolean' | 'array' | 'image'

export interface SchemaField {
  id: string
  /** Binding key — identifier chars only (^[a-zA-Z_][a-zA-Z0-9_]*$) */
  key: string
  label: string
  type: SchemaFieldType
  /** Element type for array fields */
  itemType?: SchemaFieldType
}

export interface SchemaGroup {
  id: string
  label: string
  role: 'master' | 'detail'
  /** Key in the runtime data object (e.g. "items") — used for detail-row binding paths */
  dataKey: string
  fields: SchemaField[]
}

export interface SchemaDefinition {
  groups: SchemaGroup[]
}

// ---------------------------------------------------------------------------
// ConditionalDisplay — structured AND/OR visibility conditions
// ---------------------------------------------------------------------------

export type NullaryOperator = 'empty' | 'not_empty'
export type ValuedOperator =
  | 'equals' | 'not_equals'
  | 'greater_than' | 'less_than'
  | 'contains' | 'not_contains'
export type ConditionOperator = NullaryOperator | ValuedOperator

interface DisplayConditionBase {
  id: string
  fieldPath: string
}

export interface NullaryDisplayCondition extends DisplayConditionBase {
  operator: NullaryOperator
}

export interface ValuedDisplayCondition extends DisplayConditionBase {
  operator: ValuedOperator
  value: string | number
}

export type DisplayCondition = NullaryDisplayCondition | ValuedDisplayCondition

export interface ConditionalDisplay {
  logic: 'and' | 'or'
  conditions: DisplayCondition[]
}

// ---------------------------------------------------------------------------
// ElementBase
// ---------------------------------------------------------------------------

export interface ElementBase {
  id: string
  type: ElementType
  /** Section 相対座標 (mm) */
  position: Position
  /** サイズ (mm) */
  size: Size
  zIndex: number
  locked: boolean
  visible: boolean
  /** レイヤーパネル表示名 */
  name?: string
  /** 構造化表示条件 (AND/OR ロジック) */
  conditionalDisplay?: ConditionalDisplay
  /** 印刷対象か (default: true) */
  printable?: boolean
}

// ---------------------------------------------------------------------------
// Element interfaces
// ---------------------------------------------------------------------------

export interface TextElement extends ElementBase {
  type: 'text'
  content: string
  style: TextStyle
  /** ふりがな (ruby テキスト) */
  furigana?: string
  /** ふりがなフォントサイズ倍率 (default: 0.5) */
  furiganaScale?: number
}

export interface LabelElement extends ElementBase {
  type: 'label'
  /** 静的テキスト (トークン置換なし) */
  text: string
  style: TextStyle
}

export interface ImageElement extends ElementBase {
  type: 'image'
  src: string
  alt: string
  objectFit: 'contain' | 'cover' | 'fill' | 'none'
  opacity?: number
}

export interface ShapeElement extends ElementBase {
  type: 'shape'
  shape: 'rectangle' | 'circle' | 'line'
  fill?: string
  stroke?: string
  strokeWidth?: number
  borderRadius?: number
  strokeDash?: 'solid' | 'dashed' | 'dotted'
}

export interface TableElement extends ElementBase {
  type: 'table'
  rows: number
  columns: number
  data: string[][]
  headerRow: boolean
  dataBinding?: string
  /** 列ごとの消費税率 (軽減税率マーカー ※ 表示用, same length as columns) */
  columnTaxRates?: (8 | 10 | null)[]
}

export interface ChartElement extends ElementBase {
  type: 'chart'
  chartType: 'bar' | 'line' | 'pie' | 'donut'
  dataBinding?: string
  title?: string
}

export interface DataFieldElement extends ElementBase {
  type: 'dataField'
  fieldKey: string
  label?: string
  style: TextStyle
  format?: CalculationFormat
  fallbackText?: string
}

export type ManualEntryDisplayMode = 'line' | 'box' | 'grid' | 'none'

export interface ManualEntryField extends ElementBase {
  type: 'manualEntry'
  label: string
  labelPosition: 'top' | 'left' | 'none'
  displayMode: ManualEntryDisplayMode
  lineColor: string
  gridCount?: number
  placeholder?: string
  style: TextStyle
  /** フリガナゾーンを表示する (デフォルト: false) */
  furiganaEnabled?: boolean
  /** フリガナのデータプレビュー値 — resolveField で解決するキー */
  furiganaDataSource?: string
  /** フリガナ行の高さ割合 0〜1 (デフォルト: 0.35) */
  furiganaRatio?: number
}

export interface HankoElement extends ElementBase {
  type: 'hanko'
  /** 印鑑内テキスト (通常は姓) */
  text: string
  shape: 'circle' | 'rectangle'
  borderColor: string
  textColor: string
  fontSize: number   // mm
  writingMode: 'vertical-rl' | 'horizontal-tb'
  doubleBorder: boolean
  /** データソースフィールドからテキストを自動入力 */
  binding?: string
}

export type CheckmarkStyle = '✓' | '×' | '●'

export type CheckboxLabelPosition = 'left' | 'right' | 'top' | 'bottom'

export interface CheckboxElement extends ElementBase {
  type: 'checkbox'
  /** 静的 checked 状態（デザインプレビュー用） */
  checked: boolean
  /** チェックマーク記号 */
  checkmark: CheckmarkStyle
  /** ラベルテキスト（空文字なら非表示） */
  label: string
  /** ラベル位置 (default: 'right') */
  labelPosition?: CheckboxLabelPosition
  /** データバインドモード: resolveField(data, dataSource) !== '' なら checked */
  dataSource?: string
  style?: TextStyle
}

export type EraSelectLayout = 'column' | 'row' | 'grid-2col'

export interface EraSelectElement extends ElementBase {
  type: 'eraSelect'
  /** 選択中の元号 — resolveField で解決。空文字/未設定なら未選択（全て ○） */
  dataSource?: string
  /** レイアウト: column（縦1列）、row（横1行）、grid-2col（2列グリッド） */
  layout?: EraSelectLayout
  /** 表示する元号リスト。未設定時は ['明','大','昭','平','令'] */
  eras?: string[]
}

export type BarcodeKind = 'qr' | 'code128' | 'code39' | 'jan13'

export interface BarcodeElement extends ElementBase {
  type: 'barcode'
  kind: BarcodeKind
  /** エンコード値 ({{token}} 可) */
  value: string
  errorCorrection?: 'L' | 'M' | 'Q' | 'H'
  darkColor?: string
  lightColor?: string
  showText?: boolean
}

export interface ApprovalStampCell {
  role: string
  stampSrc?: string
  width: number   // mm
}

export interface ApprovalStampRowElement extends ElementBase {
  type: 'approvalStampRow'
  cells: ApprovalStampCell[]
  labelPosition: 'top' | 'bottom'
  borderColor: string
  borderWidth: number   // mm
  cellHeight: number    // mm
}

export interface RevenueStampElement extends ElementBase {
  type: 'revenueStamp'
  amount?: string
  borderColor: string
  borderWidth: number   // mm
  showLabel: boolean
  showCancellationGuide: boolean
}

// ---------------------------------------------------------------------------
// Repeating Band (Detail Band — FastReport / JasperReports / DevExpress style)
// ---------------------------------------------------------------------------

export interface RepeatingBandField {
  /** データソース配列内の各レコードのフィールドキー */
  key: string
  /** 列ヘッダーテキスト */
  label: string
  /** 列幅 (mm) */
  width: number
  /** テキスト横揃え */
  align?: 'left' | 'center' | 'right'
  /** 書式 */
  format?: CalculationFormat
}

export type RepeatingBandTotalFormula = 'sum' | 'count' | 'avg' | 'min' | 'max'

export interface RepeatingBandTotal {
  fieldKey: string
  formula: RepeatingBandTotalFormula
  label?: string
}

export interface RepeatingBandElement extends ElementBase {
  type: 'repeatingBand'
  /** バインドするデータ配列のフィールドキー (e.g. "items") */
  dataSource: string
  /** 1レコードあたりの行高さ (mm) */
  itemHeight: number
  /** 表示列定義 */
  fields: RepeatingBandField[]
  /** ヘッダー行を表示するか */
  showHeader: boolean
  /** フッター（合計行）を表示するか */
  showFooter: boolean
  /** フッター集計定義 */
  totals: RepeatingBandTotal[]
  /** ページブレーク */
  pageBreak: 'none' | 'before' | 'after'
  /** 最大表示件数 (0=無制限) */
  maxItems: number
  /** 奇数行背景色 */
  oddRowColor: string
  /** 偶数行背景色 */
  evenRowColor: string
  /** 枠線色 */
  borderColor: string
  /** 枠線幅 (mm) */
  borderWidth: number
  /** ソートフィールドキー */
  sortBy?: string
  /** ソート順 */
  sortOrder?: 'asc' | 'desc'
  /** グループ化フィールドキー */
  groupBy?: string
  /** データ行数が maxItems 未満のとき空行罫線を描画する */
  showEmptyRowLines?: boolean
  /** テキストスタイル（ボディ行） */
  style?: TextStyle
  /** ヘッダーテキストスタイル */
  headerStyle?: TextStyle
}

// ---------------------------------------------------------------------------
// Repeating List (Card / Label style — horizontal / grid layout)
// ---------------------------------------------------------------------------

export interface RepeatingListField {
  key: string
  label?: string
  /** カード内の相対 X 座標 (mm) */
  x: number
  /** カード内の相対 Y 座標 (mm) */
  y: number
  width: number
  height: number
  style?: TextStyle
  isLabel?: boolean   // true = ラベルとして固定表示 (keyはラベルテキスト)
}

export interface RepeatingListElement extends ElementBase {
  type: 'repeatingList'
  /** バインドするデータ配列のフィールドキー */
  dataSource: string
  /** レイアウト方向 */
  layout: 'vertical' | 'horizontal' | 'grid'
  /** グリッドレイアウト時の列数 */
  gridColumns: number
  /** 1アイテムの幅 (mm) */
  itemWidth: number
  /** 1アイテムの高さ (mm) */
  itemHeight: number
  /** アイテム間のギャップ (mm) */
  gap: number
  /** アイテム内のフィールド定義 */
  fields: RepeatingListField[]
  /** 最大表示件数 (0=無制限) */
  maxItems: number
  /** アイテムの枠線色 */
  borderColor?: string
  /** アイテムの枠線幅 (mm) */
  borderWidth?: number
  /** アイテムの背景色 */
  itemBackground?: string
  /** 角丸 (mm) */
  borderRadius?: number
  /** ページブレーク */
  pageBreak: 'none' | 'before' | 'after'
}

// ---------------------------------------------------------------------------
// FormTableElement — 帳票専用テーブル (固定レイアウト + データバインド両対応)
// ---------------------------------------------------------------------------

export type FormTableCellType = 'label' | 'input' | 'dataField'

export interface FormTableCell {
  /** UUID — 変更不可。行複製時は新 UUID を生成する */
  id: string
  type: FormTableCellType
  /** type='label' | 'input' で使用 */
  text?: string
  placeholder?: string
  /** type='dataField' で使用 */
  fieldKey?: string
  format?: CalculationFormat
  /** fieldKey が未解決・null 時のフォールバック表示テキスト */
  fallbackText?: string
  /**
   * セルレベルスタイル。
   * 優先順位（高→低）: cell.style > column.style > row-role style (headerStyle/bodyStyle)
   */
  style?: TextStyle
}

export type FormTableRowRole = 'header' | 'body' | 'footer'

export interface FormTableRow {
  /** UUID */
  id: string
  role: FormTableRowRole
  /** 行高さ (mm) */
  height: number
  /**
   * セル配列。cells.length は必ず columns.length と等しくなければならない。
   * 不一致時は描画エンジンが末尾を空セルで補完、または余剰を無視する。
   */
  cells: FormTableCell[]
}

export interface FormTableColumn {
  /** UUID */
  id: string
  /** 列幅 (mm, 絶対値) — 最小値 3mm */
  width: number
  align?: 'left' | 'center' | 'right'
  /** 列レベルスタイル。cell.style より低優先度 */
  style?: TextStyle
}

export interface FormTableElement extends ElementBase {
  type: 'formTable'
  columns: FormTableColumn[]
  rows: FormTableRow[]
  /** データバインドモード: body 行をこの配列で展開 */
  dataSource?: string
  /**
   * 最大展開件数。0 = 無制限（既存 RepeatingBandElement と同一セマンティクス）。
   * undefined は 0 と等価。
   */
  maxItems?: number
  /** 枠線色 */
  borderColor: string
  /** 枠線幅 (mm) */
  borderWidth: number
  /** header 行スタイル（column.style / cell.style より低優先度）*/
  headerStyle?: TextStyle
  /** body / footer 行スタイル（column.style / cell.style より低優先度）*/
  bodyStyle?: TextStyle
  /** body 行奇数行背景色（cell/column スタイルの backgroundColor が優先）*/
  oddRowColor?: string
  /** body 行偶数行背景色（同上）*/
  evenRowColor?: string
}

// ---------------------------------------------------------------------------
// ReportElement union
// ---------------------------------------------------------------------------

export type ReportElement =
  | TextElement
  | LabelElement
  | ImageElement
  | ShapeElement
  | TableElement
  | ChartElement
  | DataFieldElement
  | ManualEntryField
  | HankoElement
  | BarcodeElement
  | ApprovalStampRowElement
  | RevenueStampElement
  | RepeatingBandElement
  | RepeatingListElement
  | FormTableElement
  | CheckboxElement
  | EraSelectElement

// ---------------------------------------------------------------------------
// Domain model — ReportDefinition hierarchy (Phase 1)
// ---------------------------------------------------------------------------

export type SectionType = 'header' | 'body' | 'footer' | 'custom'

export interface Section {
  id: string
  sectionType: SectionType
  /** Section 高さ (mm) */
  height: number
  elements: ReportElement[]
}

/** Display-only group for LayersPanel. Stored in PageDef.groups (history-tracked). */
export interface LayerGroup {
  id: string
  name: string
  /** IDs of elements in this group (same-page only) */
  elementIds: readonly string[]
  collapsed: boolean
  /** When false, overrides all member elements' visible=false at render time */
  visible: boolean
  /** When true, overrides all member elements' locked=true at render time */
  locked: boolean
}

export interface PageDef {
  id: string
  name: string
  width: number    // mm
  height: number   // mm
  background: string
  sections: Section[]
  /** Display-only layer groups for LayersPanel (optional, backward-compatible) */
  groups?: LayerGroup[]
}

export type PaperSize = 'A4' | 'A3' | 'Letter' | 'Legal' | 'custom'

export interface Margins {
  top: number
  right: number
  bottom: number
  left: number
}

export interface PageSettings {
  paperSize: PaperSize
  orientation: 'portrait' | 'landscape'
  margins: Margins
  unit: 'mm'
}

export interface Metadata {
  documentName: string
  version: string
  reportType: string
  applicableRegulation?: string
  effectiveFrom?: string
  effectiveTo?: string
  description?: string
}

export interface DataSourceDefinition {
  id: string
  name: string
  fields: Record<string, unknown>
}

export type SubmissionModel = Record<string, unknown>

// ---------------------------------------------------------------------------
// OutputVariant — per-audience PDF variants with masking rules
// ---------------------------------------------------------------------------

export type MaskingRule =
  | { id: string; targetElementId: string; type: 'fullReplace'; replaceValue: string }
  | { id: string; targetElementId: string; type: 'partial'; keepFirst?: number; keepLast?: number }

export interface OutputVariant {
  id: string
  name: string
  targetAudience?: string
  /** Element IDs hidden in this variant (checked at export time) */
  hiddenElementIds: string[]
  /** Text masking rules — fullReplace or partial character masking */
  maskingRules: MaskingRule[]
}

export type ValidationSeverity = 'error' | 'warning'

export interface ValidationRule {
  id: string
  /** JEXL expression — fires (violation reported) when evaluates to truthy */
  condition: string
  message: string
  severity: ValidationSeverity
}

export interface ReportDefinition {
  id: string
  metadata: Metadata
  pageSettings: PageSettings
  defaultTextStyle: TextStyle
  templateVariables: TemplateVariable[]
  calculationRules: CalculationRule[]
  dataSources: DataSourceDefinition[]
  outputVariants: OutputVariant[]
  submissionModels: SubmissionModel[]
  validationRules: ValidationRule[]
  pages: PageDef[]
  /** Optional data schema (master/detail groups + fields) */
  schema?: SchemaDefinition
  /** Master header section — cloned to all pages on addPage */
  masterHeader?: Section
  /** Master footer section — cloned to all pages on addPage */
  masterFooter?: Section
}

// ---------------------------------------------------------------------------
// Legacy types (backward compat with existing store API)
// ---------------------------------------------------------------------------

/** @deprecated Use PageDef instead */
export interface Page {
  id: string
  name: string
  /** @deprecated Use sections[0].elements (or appropriate section). This field is ignored by the renderer. */
  elements?: ReportElement[]
  background: string
  width: number    // mm
  height: number   // mm
  sections: Section[]
}

/** @deprecated Use PageSettings instead */
export interface ReportSettings {
  paperSize: PaperSize
  orientation: 'portrait' | 'landscape'
  margin: { top: number; right: number; bottom: number; left: number }
  unit: 'px' | 'mm' | 'in'
}

export interface DataSource {
  id: string
  name: string
  fields: Record<string, unknown>
}

export interface Template {
  id: string
  name: string
  description?: string
  thumbnail?: string
  pages: Page[]
  settings: ReportSettings
}

/** @deprecated Use ReportDefinition instead */
export interface Report {
  id: string
  name: string
  pages: Page[]
  settings: ReportSettings
  dataSource: DataSource | null
  createdAt: string
  updatedAt: string
}
