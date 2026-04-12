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
  // 自動フィールド系
  | 'pageNumber'
  | 'currentDate'
  // 区切り線
  | 'divider'
  // テナント情報系
  | 'tenantCompanyName'
  | 'tenantAddress'
  | 'tenantPhone'
  | 'tenantRepresentative'
  | 'tenantLogo'
  | 'tenantCustom'

// ---------------------------------------------------------------------------
// SchemaDefinition — optional data schema (master/detail groups + fields)
// ---------------------------------------------------------------------------

// Re-export ScalarDB binding primitives so consumers importing from
// `@/types` keep working without knowing about the subdivision.
export type {
  ScalarDbColumnType,
  ScalarDbKeyType,
  ScalarDbTableMeta,
} from './scalardb'
export {
  ScalarDbColumnTypeSchema,
  ScalarDbKeyTypeSchema,
} from './scalardb'

import type { ScalarDbTableMeta } from './scalardb'

export type SchemaFieldType = 'string' | 'number' | 'date' | 'boolean' | 'array' | 'image'

export interface SchemaField {
  id: string
  /** Binding key — identifier chars only (^[a-zA-Z_][a-zA-Z0-9_]*$) */
  key: string
  label: string
  type: SchemaFieldType
  /** Element type for array fields */
  itemType?: SchemaFieldType
  /**
   * Phase 1 DB binding hint: the name of the ScalarDB column this field maps
   * to. Present only when the containing group's `tableMeta` is set.
   * The column's DataType and key role are NOT stored — they are re-derived
   * from a fresh catalog fetch at render time (Phase 2).
   */
  dbColumnName?: string
  /**
   * Phase 3: computed field flag.
   * When true, the field's value is calculated from a JEXL expression
   * rather than fetched directly from a DB column.
   * Computed fields do NOT have a dbColumnName.
   */
  computed?: true
  /**
   * Phase 3: JEXL expression for computed fields.
   * Available context: all other fields in the same group (by fieldKey),
   * plus built-in functions: sum, count, avg, min, max, round,
   * concat, formatDate, formatNumber, ifExpr.
   * Example: `price * qty * 1.1`
   */
  expression?: string
}

export interface SchemaGroup {
  id: string
  label: string
  role: 'master' | 'detail'
  /** Key in the runtime data object (e.g. "items") — used for detail-row binding paths */
  dataKey: string
  fields: SchemaField[]
  /**
   * Phase 1 DB binding: the ScalarDB table this group is bound to.
   * `undefined` means "unlinked". No status enum.
   */
  tableMeta?: ScalarDbTableMeta
  /**
   * Phase 3.5: links this detail group to a master group for automatic FK resolution.
   * When set, the detail group's partition key values are copied from the linked master group.
   */
  linkedMasterGroupId?: string
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

/** Phase 2: スキーマフィールドとのバインド（SchemaField.id を参照） */
export interface ElementSchemaBinding {
  /** SchemaGroup.fields[x].id を指す UUID */
  fieldId: string
}

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
  /**
   * Phase 2: ScalarDB スキーマフィールドへのバインド。
   * NOTE: `dataBinding?: string` (TableElement/ChartElement の raw データキー) とは別フィールド。
   * このフィールドは SchemaField.id (UUID) を指す。
   */
  schemaBinding?: ElementSchemaBinding
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
  /** X軸に使うデータキー (default: 'name') */
  xAxisKey?: string
  /** Y軸に使うデータキー (複数系列対応) */
  yAxisKeys?: string[]
  /** カスタムカラーパレット */
  colors?: string[]
  /** 凡例表示 (default: true) */
  showLegend?: boolean
  /** グリッド表示 (default: true) */
  showGrid?: boolean
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
  /** グループ小計行を表示するか (default: false) */
  showGroupSubtotals?: boolean
  /** グループ小計行のスタイル */
  groupStyle?: TextStyle
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

export type FormTableCellType = 'label' | 'input' | 'dataField' | 'checkbox' | 'eraSelect'

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
  /** type='checkbox' で使用: チェック状態 */
  checked?: boolean
  /** type='checkbox' で使用: チェックマーク記号 */
  checkmark?: CheckmarkStyle
  /** type='checkbox' で使用: データバインド（resolveField !== '' なら checked） */
  checkboxDataSource?: string
  /** type='eraSelect' で使用: 選択中の元号データソース */
  eraDataSource?: string
  /** type='eraSelect' で使用: レイアウト */
  eraLayout?: EraSelectLayout
  /** セル内フリガナ（type='input' で使用） */
  furiganaEnabled?: boolean
  /** フリガナのデータソース */
  furiganaDataSource?: string
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
// PageNumberElement — auto page number
// ---------------------------------------------------------------------------

export type PageNumberFormat =
  | '{{page}}'               // 1
  | '{{page}} / {{pages}}'   // 1 / 3
  | '{{page}}/{{pages}}'     // 1/3
  | 'Page {{page}} of {{pages}}'  // Page 1 of 3
  | '{{page}}ページ'          // 1ページ
  | 'custom'

export interface PageNumberElement extends ElementBase {
  type: 'pageNumber'
  /** Display format — {{page}} = current, {{pages}} = total */
  format: PageNumberFormat
  /** Custom format string (used when format === 'custom') */
  customFormat?: string
  style: TextStyle
}

// ---------------------------------------------------------------------------
// CurrentDateElement — auto current date
// ---------------------------------------------------------------------------

export type CurrentDateFormat =
  | 'yyyy/MM/dd'
  | 'yyyy年MM月dd日'
  | 'yyyy-MM-dd'
  | 'MM/dd/yyyy'
  | 'wareki_full'       // 令和8年4月10日
  | 'wareki_short'      // R8.04.10
  | 'yyyy年MM月dd日 (ddd)' // 2026年04月10日 (木)
  | 'custom'

export interface CurrentDateElement extends ElementBase {
  type: 'currentDate'
  format: CurrentDateFormat
  /** Custom format string (used when format === 'custom') */
  customFormat?: string
  style: TextStyle
}

// ---------------------------------------------------------------------------
// DividerElement — horizontal/vertical rule
// ---------------------------------------------------------------------------

export type DividerDirection = 'horizontal' | 'vertical'

export interface DividerElement extends ElementBase {
  type: 'divider'
  direction: DividerDirection
  color: string
  thickness: number       // mm
  dashStyle: 'solid' | 'dashed' | 'dotted'
}

// ---------------------------------------------------------------------------
// TenantInfo — organization-wide shared information
// ---------------------------------------------------------------------------

export interface TenantInfo {
  companyName?: string
  postalCode?: string
  address?: string
  phone?: string
  email?: string
  representativeName?: string
  /** Base64 data-URI image (data:image/...) */
  logoBase64?: string
  /** Arbitrary custom key/value fields */
  custom?: Record<string, string>
}

// ---------------------------------------------------------------------------
// Product Master — tenant-wide product catalog
// ---------------------------------------------------------------------------

export type TaxType = 'none' | 'standard' | 'reduced'

/** Valid value types for user-defined custom fields */
export type CustomFieldValue = string | number | boolean | null

/** Price history entry — append-only, never updated or deleted */
export interface PriceHistoryEntry {
  price: number
  /** ISO 8601 date string (YYYY-MM-DD) — when this price became effective */
  effectiveFrom: string
}

/** Definition of a user-defined custom field on products */
export interface ProductCustomFieldDef {
  /** Alphanumeric key (no __proto__ etc.) */
  key: string
  label: string
  type: 'text' | 'number' | 'date' | 'boolean'
}

export interface Product {
  id: string
  /** Unique within the tenant (enforced server-side) */
  code: string
  name: string
  /** Current unit price (base value) */
  unitPrice: number
  category: string
  description: string
  stockCount: number
  taxType: TaxType
  /** Display unit, e.g. "個", "本", "kg" */
  unit: string
  manufacturer: string
  /** null = not a subscription product */
  subscriptionPeriod: string | null
  subscriptionPriceUnit: string | null
  customFields: Record<string, CustomFieldValue>
  /** Price change history, descending order, max 365 entries */
  priceHistory: PriceHistoryEntry[]
  /** Soft-delete timestamp; null = active */
  deletedAt: string | null
  createdAt: string
  updatedAt: string
  /** Optimistic concurrency version number */
  version: number
}

export interface ProductMasterDefinition {
  customFieldDefs: ProductCustomFieldDef[]
  products: Product[]
}

export type CreateProductRequest = Omit<Product,
  'id' | 'createdAt' | 'updatedAt' | 'deletedAt' | 'priceHistory' | 'version'>

export type UpdateProductPayload = Partial<Pick<Product,
  | 'name' | 'code' | 'unitPrice' | 'category' | 'description'
  | 'stockCount' | 'taxType' | 'unit' | 'manufacturer'
  | 'subscriptionPeriod' | 'subscriptionPriceUnit' | 'customFields'>>

// ---------------------------------------------------------------------------
// Tenant elements — resolved from TenantInfo at render time
// ---------------------------------------------------------------------------

export interface TenantCompanyNameElement extends ElementBase {
  type: 'tenantCompanyName'
  style: TextStyle
  /** Shown when tenant info is not configured */
  fallback?: string
}

export interface TenantAddressElement extends ElementBase {
  type: 'tenantAddress'
  style: TextStyle
  fallback?: string
}

export interface TenantPhoneElement extends ElementBase {
  type: 'tenantPhone'
  style: TextStyle
  fallback?: string
}

export interface TenantRepresentativeElement extends ElementBase {
  type: 'tenantRepresentative'
  style: TextStyle
  fallback?: string
}

export interface TenantLogoElement extends ElementBase {
  type: 'tenantLogo'
  objectFit: 'contain' | 'cover' | 'fill' | 'none'
  opacity?: number
}

export interface TenantCustomElement extends ElementBase {
  type: 'tenantCustom'
  /** Key in TenantInfo.custom to display */
  fieldKey: string
  style: TextStyle
  fallback?: string
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
  | PageNumberElement
  | CurrentDateElement
  | DividerElement
  | TenantCompanyNameElement
  | TenantAddressElement
  | TenantPhoneElement
  | TenantRepresentativeElement
  | TenantLogoElement
  | TenantCustomElement

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

export type PaperSize =
  // ISO A 系列
  | 'A3' | 'A4' | 'A5' | 'A6'
  // ISO B 系列
  | 'B4' | 'B5'
  // JIS B 系列（日本固有）
  | 'JIS-B4' | 'JIS-B5'
  // 北米
  | 'Letter' | 'Legal' | 'Tabloid'
  // 日本固有
  | 'Hagaki'
  // カスタム
  | 'custom'

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
  /** paperSize='custom' 時の幅 (mm) */
  customWidth?: number
  /** paperSize='custom' 時の高さ (mm) */
  customHeight?: number
}

export interface Metadata {
  documentName: string
  version: string
  reportType: string
  applicableRegulation?: string
  effectiveFrom?: string
  effectiveTo?: string
  description?: string
  category?: string
  tags?: string[]
  /**
   * ID of the built-in template this report was created from.
   * When set, the user can refresh the report with the latest built-in template definition.
   */
  sourceTemplateId?: string
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
  category?: string
  tags?: string[]
  pages: Page[]
  settings: ReportSettings
  /** Optional data schema carried through to the ReportDefinition */
  schema?: SchemaDefinition
  /** Optional sample data sources carried through to the ReportDefinition */
  dataSources?: DataSourceDefinition[]
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
