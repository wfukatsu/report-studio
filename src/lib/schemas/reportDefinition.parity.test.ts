/**
 * #424: compile-time key parity between the store types (src/types) and the
 * Zod import-boundary schemas (reportDefinition.ts).
 *
 * SchemaFieldSchema / SchemaGroupSchema etc. are strict objects (NOT
 * .passthrough()) — a field added to the TS type but not to the Zod schema is
 * silently stripped on template import (built-in load, API round-trip). Until
 * now the only guard was a CLAUDE.md note; these assertions fail `npm run
 * build` (which type-checks tests) the moment the key sets drift.
 *
 * Runtime behavior is also pinned by a strip-demonstration test at the bottom,
 * so the failure mode itself stays documented.
 */
import { describe, it, expect, expectTypeOf } from 'vitest'
import type { z } from 'zod'
import {
  SchemaFieldSchema,
  SchemaGroupSchema,
  ScalarDbTableMetaSchema,
  SchemaRelationSchema,
  SchemaDefinitionSchema,
} from './reportDefinition'
import type {
  SchemaField,
  SchemaGroup,
  SchemaRelation,
  SchemaDefinition,
  ScalarDbTableMeta,
} from '@/types'

describe('Zod ⇔ TS 型キーパリティ (#424)', () => {
  it('SchemaField のキー集合が一致する', () => {
    expectTypeOf<keyof z.infer<typeof SchemaFieldSchema>>().toEqualTypeOf<keyof SchemaField>()
  })

  it('SchemaGroup のキー集合が一致する', () => {
    expectTypeOf<keyof z.infer<typeof SchemaGroupSchema>>().toEqualTypeOf<keyof SchemaGroup>()
  })

  it('ScalarDbTableMeta のキー集合が一致する', () => {
    expectTypeOf<keyof z.infer<typeof ScalarDbTableMetaSchema>>()
      .toEqualTypeOf<keyof ScalarDbTableMeta>()
  })

  it('SchemaRelation のキー集合が一致する（ネストの on も含む）', () => {
    expectTypeOf<keyof z.infer<typeof SchemaRelationSchema>>().toEqualTypeOf<keyof SchemaRelation>()
    expectTypeOf<keyof z.infer<typeof SchemaRelationSchema>['on']>()
      .toEqualTypeOf<keyof SchemaRelation['on']>()
  })

  it('SchemaDefinition のキー集合が一致する', () => {
    expectTypeOf<keyof z.infer<typeof SchemaDefinitionSchema>>()
      .toEqualTypeOf<keyof SchemaDefinition>()
  })

  it('（実挙動の記録）strict object は未知キーを黙って strip する', () => {
    // This is WHY the assertions above exist: parse() drops anything the schema
    // does not model, with no error.
    const parsed = SchemaFieldSchema.parse({
      id: 'f1',
      key: 'price',
      label: 'Price',
      type: 'number',
      notInSchema: 'gone after parse',
    })
    expect('notInSchema' in parsed).toBe(false)
  })
})
