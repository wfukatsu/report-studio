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
 * Display strings are stored as i18n keys (`components` namespace,
 * `formulaCatalog.*` section, #410) and resolved with `t()` at render time so
 * they follow language switches. `ParseKeys<'components'>` makes a key typo a
 * compile error.
 *
 * Phase 1: 10 functions (existing JEXL equivalents)
 * Phase 2+: Extend to 42 functions (v1 full set)
 */

import type { ParseKeys } from 'i18next'

type CatalogKey = ParseKeys<'components'>

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
  readonly descriptionKey: CatalogKey
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
  readonly labelKey: CatalogKey
  readonly descriptionKey: CatalogKey
  readonly args: readonly FunctionArg[]
  readonly returnType: ArgType
  readonly examples: readonly FunctionExample[]
}

export const FORMULA_FUNCTIONS: readonly FunctionDef[] = [
  {
    name: 'SUM',
    jexlName: 'sum',
    category: 'aggregate',
    labelKey: 'formulaCatalog.sum.label',
    descriptionKey: 'formulaCatalog.sum.description',
    args: [{ name: 'array', type: 'array', descriptionKey: 'formulaCatalog.sum.args.array' }],
    returnType: 'number',
    examples: [{ formula: 'SUM(items)', result: '150' }],
  },
  {
    name: 'COUNT',
    jexlName: 'count',
    category: 'aggregate',
    labelKey: 'formulaCatalog.count.label',
    descriptionKey: 'formulaCatalog.count.description',
    args: [{ name: 'array', type: 'array', descriptionKey: 'formulaCatalog.count.args.array' }],
    returnType: 'number',
    examples: [{ formula: 'COUNT(items)', result: '3' }],
  },
  {
    name: 'AVG',
    jexlName: 'avg',
    category: 'aggregate',
    labelKey: 'formulaCatalog.avg.label',
    descriptionKey: 'formulaCatalog.avg.description',
    args: [{ name: 'array', type: 'array', descriptionKey: 'formulaCatalog.avg.args.array' }],
    returnType: 'number',
    examples: [{ formula: 'AVG(scores)', result: '85' }],
  },
  {
    name: 'MIN',
    jexlName: 'min',
    category: 'aggregate',
    labelKey: 'formulaCatalog.min.label',
    descriptionKey: 'formulaCatalog.min.description',
    args: [{ name: 'array', type: 'array', descriptionKey: 'formulaCatalog.min.args.array' }],
    returnType: 'number',
    examples: [{ formula: 'MIN(scores)', result: '60' }],
  },
  {
    name: 'MAX',
    jexlName: 'max',
    category: 'aggregate',
    labelKey: 'formulaCatalog.max.label',
    descriptionKey: 'formulaCatalog.max.description',
    args: [{ name: 'array', type: 'array', descriptionKey: 'formulaCatalog.max.args.array' }],
    returnType: 'number',
    examples: [{ formula: 'MAX(scores)', result: '100' }],
  },
  {
    name: 'ROUND',
    jexlName: 'round',
    category: 'arithmetic',
    labelKey: 'formulaCatalog.round.label',
    descriptionKey: 'formulaCatalog.round.description',
    args: [
      { name: 'value', type: 'number', descriptionKey: 'formulaCatalog.round.args.value' },
      { name: 'places', type: 'number', descriptionKey: 'formulaCatalog.round.args.places', optional: true },
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
    labelKey: 'formulaCatalog.if.label',
    descriptionKey: 'formulaCatalog.if.description',
    args: [
      { name: 'condition', type: 'boolean', descriptionKey: 'formulaCatalog.if.args.condition' },
      { name: 'thenValue', type: 'any', descriptionKey: 'formulaCatalog.if.args.thenValue' },
      { name: 'elseValue', type: 'any', descriptionKey: 'formulaCatalog.if.args.elseValue' },
    ],
    returnType: 'any',
    examples: [{ formula: "IF(score >= 60, '合格', '不合格')", result: '合格' }],
  },
  {
    name: 'CONCAT',
    jexlName: 'concat',
    category: 'text',
    labelKey: 'formulaCatalog.concat.label',
    descriptionKey: 'formulaCatalog.concat.description',
    args: [
      { name: 'value1', type: 'string', descriptionKey: 'formulaCatalog.concat.args.value1' },
      { name: 'value2', type: 'string', descriptionKey: 'formulaCatalog.concat.args.value2' },
    ],
    returnType: 'string',
    examples: [{ formula: "CONCAT('Hello', ' ', 'World')", result: 'Hello World' }],
  },
  {
    name: 'TEXT',
    jexlName: 'formatNumber',
    category: 'text',
    labelKey: 'formulaCatalog.text.label',
    descriptionKey: 'formulaCatalog.text.description',
    args: [
      { name: 'value', type: 'number', descriptionKey: 'formulaCatalog.text.args.value' },
      { name: 'format', type: 'string', descriptionKey: 'formulaCatalog.text.args.format', optional: true },
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
    labelKey: 'formulaCatalog.formatDate.label',
    descriptionKey: 'formulaCatalog.formatDate.description',
    args: [
      { name: 'date', type: 'date', descriptionKey: 'formulaCatalog.formatDate.args.date' },
      { name: 'format', type: 'string', descriptionKey: 'formulaCatalog.formatDate.args.format', optional: true },
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

/** Category label i18n keys (`components` namespace) */
export const CATEGORY_LABEL_KEYS: Record<FunctionCategory, CatalogKey> = {
  aggregate: 'formulaCatalog.category.aggregate',
  arithmetic: 'formulaCatalog.category.arithmetic',
  condition: 'formulaCatalog.category.condition',
  text: 'formulaCatalog.category.text',
  date: 'formulaCatalog.category.date',
}
