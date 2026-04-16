/**
 * Parse error with source position information.
 * Used by the tokenizer, parser, and validator to report errors
 * with exact character offsets for CodeMirror diagnostic mapping.
 */
export class ParseError extends Error {
  readonly offset: number
  readonly line: number
  readonly column: number
  readonly snippet: string

  constructor(message: string, offset: number, source: string) {
    const { line, column } = offsetToLineCol(source, offset)
    const snippet = buildSnippet(source, offset)
    super(`${message} (${line}:${column})\n\n${snippet}`)
    this.name = 'ParseError'
    this.offset = offset
    this.line = line
    this.column = column
    this.snippet = snippet
  }
}

function offsetToLineCol(source: string, offset: number): { readonly line: number; readonly column: number } {
  let line = 1
  let column = 1
  for (let i = 0; i < offset && i < source.length; i++) {
    if (source[i] === '\n') { line++; column = 1 }
    else { column++ }
  }
  return { line, column }
}

function buildSnippet(source: string, offset: number): string {
  const lineStart = source.lastIndexOf('\n', offset - 1) + 1
  const lineEnd = source.indexOf('\n', offset)
  const line = source.slice(lineStart, lineEnd === -1 ? undefined : lineEnd)
  const col = offset - lineStart
  return `  ${line}\n  ${' '.repeat(col)}^`
}
