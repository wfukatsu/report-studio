/**
 * AST types for the formula-v1 expression language.
 *
 * These types are used internally by the parser and linter.
 * They are NOT stored in the data model (expressions are stored as strings).
 */

export type ArithmeticOp = '+' | '-' | '*' | '/'
export type ComparisonOp = '=' | '!=' | '<' | '>' | '<=' | '>='
export type LogicalOp = 'AND' | 'OR'

export type LiteralValue =
  | { readonly kind: 'number'; readonly value: number }
  | { readonly kind: 'string'; readonly value: string }
  | { readonly kind: 'boolean'; readonly value: boolean }

export type VisualExpression =
  | { readonly type: 'literal'; readonly value: LiteralValue }
  | { readonly type: 'field_ref'; readonly path: string }
  | { readonly type: 'function'; readonly name: string; readonly args: readonly VisualExpression[] }
  | { readonly type: 'binary_op'; readonly op: ArithmeticOp; readonly left: VisualExpression; readonly right: VisualExpression }
  | { readonly type: 'comparison'; readonly op: ComparisonOp; readonly left: VisualExpression; readonly right: VisualExpression }
  | { readonly type: 'logical'; readonly op: LogicalOp; readonly left: VisualExpression; readonly right: VisualExpression }
