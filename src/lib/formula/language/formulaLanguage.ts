/**
 * CodeMirror 6 language support for the formula-v1 expression language.
 *
 * Registers the Lezer-generated parser with syntax highlighting tags.
 * Import `formula()` to get a LanguageSupport extension for the editor.
 */

import { LRLanguage, LanguageSupport } from '@codemirror/language'
import { styleTags, tags as t } from '@lezer/highlight'
import { parser } from './formula.grammar'

const formulaLanguage = LRLanguage.define({
  parser: parser.configure({
    props: [
      styleTags({
        Number: t.number,
        String: t.string,
        Boolean: t.bool,
        FunctionName: t.function(t.variableName),
        FieldRef: t.propertyName,
        Identifier: t.variableName,
        CompareOp: t.compareOperator,
        'AND OR NOT': t.keyword,
        '"(" ")"': t.paren,
        '"*" "/"': t.arithmeticOperator,
        '"+" "-"': t.arithmeticOperator,
        '","': t.separator,
        '"."': t.derefOperator,
      }),
    ],
  }),
  languageData: {
    closeBrackets: { brackets: ['(', "'"] },
    commentTokens: {},
  },
})

/**
 * Create a formula language extension for CodeMirror 6.
 * Use this in the editor's extension list.
 */
export function formula(): LanguageSupport {
  return new LanguageSupport(formulaLanguage)
}

export { formulaLanguage }
