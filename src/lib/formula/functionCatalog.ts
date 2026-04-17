/**
 * Formula function catalog — single source of truth for all formula-v1 functions.
 *
 * These are the UPPERCASE equivalents of the existing JEXL functions.
 * The catalog is consumed by:
 * - FormulaEditor autocomplete (formulaCompletions.ts)
 * - FieldTreePanel function list (FunctionList.tsx)
 * - FormulaToolbar quick-insert buttons
 * - formulaMetadata for calltip / help text
 *
 * Phase 1: 10 functions (existing JEXL equivalents)
 * Phase 2+: Extend to 42 functions (v1 full set)
 */

export type FunctionCategory =
  | 'aggregate'
  | 'arithmetic'
  | 'condition'
  | 'text'
  | 'date'

export type ArgType = 'number' | 'string' | 'boolean' | 'date' | 'array' | 'any'

export interface FunctionArg {
  readonly name: string
  readonly type: ArgType
  readonly descriptionJa: string
  readonly optional?: true
}

export interface FunctionExample {
  readonly formula: string
  readonly result?: string
}

export interface FunctionDef {
  readonly name: string
  readonly jexlName: string
  readonly category: FunctionCategory
  readonly labelJa: string
  readonly descriptionJa: string
  readonly args: readonly FunctionArg[]
  readonly returnType: ArgType
  readonly examples: readonly FunctionExample[]
}

export const FORMULA_FUNCTIONS: readonly FunctionDef[] = [
  {
    name: 'SUM',
    jexlName: 'sum',
    category: 'aggregate',
    labelJa: '合計',
    descriptionJa: '配列の合計値を返します',
    args: [{ name: 'array', type: 'array', descriptionJa: '数値の配列' }],
    returnType: 'number',
    examples: [{ formula: 'SUM(items)', result: '150' }],
  },
  {
    name: 'COUNT',
    jexlName: 'count',
    category: 'aggregate',
    labelJa: '個数',
    descriptionJa: '配列の要素数を返します',
    args: [{ name: 'array', type: 'array', descriptionJa: '配列' }],
    returnType: 'number',
    examples: [{ formula: 'COUNT(items)', result: '3' }],
  },
  {
    name: 'AVG',
    jexlName: 'avg',
    category: 'aggregate',
    labelJa: '平均',
    descriptionJa: '配列の平均値を返します',
    args: [{ name: 'array', type: 'array', descriptionJa: '数値の配列' }],
    returnType: 'number',
    examples: [{ formula: 'AVG(scores)', result: '85' }],
  },
  {
    name: 'MIN',
    jexlName: 'min',
    category: 'aggregate',
    labelJa: '最小値',
    descriptionJa: '配列の最小値を返します',
    args: [{ name: 'array', type: 'array', descriptionJa: '数値の配列' }],
    returnType: 'number',
    examples: [{ formula: 'MIN(scores)', result: '60' }],
  },
  {
    name: 'MAX',
    jexlName: 'max',
    category: 'aggregate',
    labelJa: '最大値',
    descriptionJa: '配列の最大値を返します',
    args: [{ name: 'array', type: 'array', descriptionJa: '数値の配列' }],
    returnType: 'number',
    examples: [{ formula: 'MAX(scores)', result: '100' }],
  },
  {
    name: 'ROUND',
    jexlName: 'round',
    category: 'arithmetic',
    labelJa: '四捨五入',
    descriptionJa: '数値を指定した小数点以下の桁数で丸めます',
    args: [
      { name: 'value', type: 'number', descriptionJa: '丸める数値' },
      { name: 'places', type: 'number', descriptionJa: '小数点以下の桁数', optional: true },
    ],
    returnType: 'number',
    examples: [
      { formula: 'ROUND(1.235, 2)', result: '1.24' },
      { formula: 'ROUND(1234.5)', result: '1235' },
    ],
  },
  {
    name: 'IF',
    jexlName: 'ifExpr',
    category: 'condition',
    labelJa: '条件分岐',
    descriptionJa: '条件が真なら thenValue、偽なら elseValue を返します',
    args: [
      { name: 'condition', type: 'boolean', descriptionJa: '条件式' },
      { name: 'thenValue', type: 'any', descriptionJa: '真の場合の値' },
      { name: 'elseValue', type: 'any', descriptionJa: '偽の場合の値' },
    ],
    returnType: 'any',
    examples: [{ formula: "IF(score >= 60, '合格', '不合格')", result: '合格' }],
  },
  {
    name: 'CONCAT',
    jexlName: 'concat',
    category: 'text',
    labelJa: '文字列結合',
    descriptionJa: '複数の文字列を連結します',
    args: [
      { name: 'value1', type: 'string', descriptionJa: '文字列1' },
      { name: 'value2', type: 'string', descriptionJa: '文字列2' },
    ],
    returnType: 'string',
    examples: [{ formula: "CONCAT('Hello', ' ', 'World')", result: 'Hello World' }],
  },
  {
    name: 'TEXT',
    jexlName: 'formatNumber',
    category: 'text',
    labelJa: '数値書式',
    descriptionJa: '数値を指定の書式で文字列に変換します',
    args: [
      { name: 'value', type: 'number', descriptionJa: '書式化する数値' },
      { name: 'format', type: 'string', descriptionJa: "書式パターン (#,##0 等)", optional: true },
    ],
    returnType: 'string',
    examples: [
      { formula: 'TEXT(1234567)', result: '1,234,567' },
      { formula: "TEXT(1234.5, '#,##0.00')", result: '1,234.50' },
    ],
  },
  {
    name: 'FORMAT_DATE',
    jexlName: 'formatDate',
    category: 'date',
    labelJa: '日付書式',
    descriptionJa: '日付を指定の書式で文字列に変換します',
    args: [
      { name: 'date', type: 'date', descriptionJa: '書式化する日付' },
      { name: 'format', type: 'string', descriptionJa: "書式パターン (yyyy/MM/dd 等)", optional: true },
    ],
    returnType: 'string',
    examples: [
      { formula: "FORMAT_DATE('2026-04-17', 'yyyy年MM月dd日')", result: '2026年04月17日' },
    ],
  },
] as const

/** Set of all function names for quick lookup */
export const FORMULA_FUNCTION_NAMES: ReadonlySet<string> = new Set(
  FORMULA_FUNCTIONS.map((f) => f.name),
)

/** Map from JEXL name to formula-v1 name */
export const JEXL_TO_FORMULA_MAP: ReadonlyMap<string, string> = new Map(
  FORMULA_FUNCTIONS.map((f) => [f.jexlName, f.name]),
)

/** Map from formula-v1 name to JEXL name */
export const FORMULA_TO_JEXL_MAP: ReadonlyMap<string, string> = new Map(
  FORMULA_FUNCTIONS.map((f) => [f.name, f.jexlName]),
)

/** Category labels in Japanese */
export const CATEGORY_LABELS_JA: Record<FunctionCategory, string> = {
  aggregate: '集計',
  arithmetic: '算術',
  condition: '条件',
  text: '文字列',
  date: '日付',
}
