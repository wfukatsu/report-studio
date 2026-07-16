/**
 * Zod schemas for ReportDefinition API boundary validation.
 *
 * Structural limits come from schemas/report-definition-limits.json via
 * REPORT_DEFINITION_LIMITS — the single source shared with the server-side
 * validator (issue #52).
 *
 * Uses .passthrough() so unknown future fields aren't rejected (forward compat).
 */
import { z } from 'zod'
import { REPORT_DEFINITION_LIMITS as LIMITS } from './limits'

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

const PositionSchema = z.object({ x: z.number(), y: z.number() })
const SizeSchema = z.object({ width: z.number(), height: z.number() })

const TextStyleSchema = z.object({
  fontSize: z.number().optional(),
  fontFamily: z.string().optional(),
  fontWeight: z.enum(['normal', 'bold']).optional(),
  fontStyle: z.enum(['normal', 'italic']).optional(),
  textDecoration: z.enum(['none', 'underline', 'line-through']).optional(),
  color: z.string().optional(),
  backgroundColor: z.string().optional(),
  textAlign: z.enum(['left', 'center', 'right', 'justify']).optional(),
  verticalAlign: z.enum(['top', 'middle', 'bottom']).optional(),
  letterSpacing: z.number().optional(),
  lineHeight: z.number().optional(),
  paddingTop: z.number().optional(),
  paddingRight: z.number().optional(),
  paddingBottom: z.number().optional(),
  paddingLeft: z.number().optional(),
  writingMode: z.enum(['horizontal-tb', 'vertical-rl']).optional(),
}).passthrough()

// ---------------------------------------------------------------------------
// SchemaDefinition — optional data schema
// ---------------------------------------------------------------------------

const SchemaFieldTypeSchema = z.enum(['string', 'number', 'date', 'boolean', 'array', 'image'])

/** Field keys that could escape the prototype chain — blocked at import boundary (SEC-01) */
const FORBIDDEN_FIELD_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

const SchemaFieldSchema = z.object({
  id: z.string(),
  key: z.string()
    .max(128)
    .regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/, '識別子文字（英数字・_）のみ使用できます')
    .refine(
      (k) => !FORBIDDEN_FIELD_KEYS.has(k),
      { message: 'このキー名は予約されており使用できません' },
    ),
  label: z.string().max(200),
  type: SchemaFieldTypeSchema,
  itemType: SchemaFieldTypeSchema.optional(),
})

const SchemaGroupSchema = z.object({
  id: z.string(),
  label: z.string().max(200),
  role: z.enum(['master', 'detail']),
  dataKey: z.string().max(128),
  fields: z.array(SchemaFieldSchema).max(200),
})

const SchemaDefinitionSchema = z.object({
  groups: z.array(SchemaGroupSchema).max(20),
})

// ---------------------------------------------------------------------------
// ConditionalDisplay — structured AND/OR visibility conditions
// ---------------------------------------------------------------------------

const NullaryConditionSchema = z.object({
  id: z.string(),
  fieldPath: z.string().max(256),
  operator: z.enum(['empty', 'not_empty']),
})

const ValuedConditionSchema = z.object({
  id: z.string(),
  fieldPath: z.string().max(256),
  operator: z.enum(['equals', 'not_equals', 'greater_than', 'less_than', 'contains', 'not_contains']),
  value: z.union([z.string().max(500), z.number()]),
})

const DisplayConditionSchema = z.union([NullaryConditionSchema, ValuedConditionSchema])

const ConditionalDisplaySchema = z.object({
  logic: z.enum(['and', 'or']),
  conditions: z.array(DisplayConditionSchema).max(20),
})

// ---------------------------------------------------------------------------
// Element base — all elements share these fields
// ---------------------------------------------------------------------------

const ElementBaseSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  position: PositionSchema,
  size: SizeSchema,
  zIndex: z.number().int(),
  locked: z.boolean(),
  visible: z.boolean(),
  name: z.string().optional(),
  conditionalDisplay: ConditionalDisplaySchema.optional(),
  printable: z.boolean().optional(),
}).passthrough()

// Accept any element that satisfies ElementBase — individual type fields are
// validated in the app layer. Unknown element types from new API versions pass
// through without rejection.
const ReportElementSchema = ElementBaseSchema

// ---------------------------------------------------------------------------
// Section
// ---------------------------------------------------------------------------

const SectionSchema = z.object({
  id: z.string().min(1),
  sectionType: z.enum(['header', 'body', 'footer', 'custom']),
  height: z.number().positive(),
  elements: z.array(ReportElementSchema).max(LIMITS.maxElementsPerSection),
}).passthrough()

// ---------------------------------------------------------------------------
// LayerGroup
// ---------------------------------------------------------------------------

const LayerGroupSchema = z.object({
  id: z.string().min(1).max(100),
  name: z.string().max(200),
  elementIds: z.array(z.string().min(1).max(100)).max(500),
  collapsed: z.boolean(),
  visible: z.boolean(),
  locked: z.boolean(),
})

// ---------------------------------------------------------------------------
// PageDef
// ---------------------------------------------------------------------------

const PageDefSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  width: z.number().positive(),
  height: z.number().positive(),
  background: z.string(),
  sections: z.array(SectionSchema).max(LIMITS.maxSectionsPerPage),
  groups: z.array(LayerGroupSchema).max(100).optional(),
}).passthrough()

// ---------------------------------------------------------------------------
// PageSettings
// ---------------------------------------------------------------------------

const MarginsSchema = z.object({
  top: z.number(),
  right: z.number(),
  bottom: z.number(),
  left: z.number(),
})

const PageSettingsSchema = z.object({
  paperSize: z.enum(['A3', 'A4', 'A5', 'A6', 'B4', 'B5', 'JIS-B4', 'JIS-B5', 'Letter', 'Legal', 'Tabloid', 'Hagaki', 'custom']),
  orientation: z.enum(['portrait', 'landscape']),
  margins: MarginsSchema,
  unit: z.literal('mm'),
}).passthrough()

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

const MetadataSchema = z.object({
  documentName: z.string(),
  version: z.string(),
  reportType: z.string(),
  applicableRegulation: z.string().optional(),
  effectiveFrom: z.string().optional(),
  effectiveTo: z.string().optional(),
  description: z.string().optional(),
  category: z.string().max(50).optional(),
  tags: z.array(z.string().max(50)).max(20).optional(),
}).passthrough()

// ---------------------------------------------------------------------------
// CalculationRule
// ---------------------------------------------------------------------------

const CalculationRuleSchema = z.object({
  /** Stable UUID — optional for backward compat with older saved reports. */
  id: z.string().optional(),
  key: z.string().min(1).max(100).regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/, 'キーは英数字とアンダースコアのみ使用できます'),
  label: z.string().max(200),
  description: z.string().optional(),
  expression: z.string().max(500),
  resultType: z.enum(['number', 'string', 'boolean']),
  onError: z.enum(['zero', 'empty', 'error_text']),
  format: z.object({
    type: z.string(),
    decimalPlaces: z.number().optional(),
    customPattern: z.string().optional(),
  }).passthrough().optional(),
}).passthrough()

// ---------------------------------------------------------------------------
// ValidationRule
// ---------------------------------------------------------------------------

const ValidationRuleSchema = z.object({
  id: z.string().min(1).max(100),
  condition: z.string().max(500),
  message: z.string().max(500),
  severity: z.enum(['error', 'warning']),
}).passthrough()

// ---------------------------------------------------------------------------
// TemplateVariable
// ---------------------------------------------------------------------------

const TemplateVariableSchema = z.object({
  key: z.string().min(1).max(100),
  label: z.string().max(200),
  description: z.string().optional(),
  defaultValue: z.string(),
}).passthrough()

// ---------------------------------------------------------------------------
// ReportDefinition — top-level schema
// ---------------------------------------------------------------------------

export const ReportDefinitionSchema = z.object({
  id: z.string().min(1),
  metadata: MetadataSchema,
  pageSettings: PageSettingsSchema,
  defaultTextStyle: TextStyleSchema,
  templateVariables: z.array(TemplateVariableSchema).max(LIMITS.maxTemplateVariables),
  calculationRules: z.array(CalculationRuleSchema).max(LIMITS.maxCalculationRules),
  dataSources: z.array(z.object({
    id: z.string().min(1),
    name: z.string(),
    fields: z.record(z.string(), z.unknown()),
  }).passthrough()).max(LIMITS.maxDataSources),
  outputVariants: z.array(z.union([
    // New typed format
    z.object({
      id: z.string(),
      name: z.string().max(200),
      targetAudience: z.string().max(200).optional(),
      hiddenElementIds: z.array(z.string()).max(500),
      maskingRules: z.array(z.union([
        z.object({
          id: z.string(),
          targetElementId: z.string(),
          type: z.literal('fullReplace'),
          replaceValue: z.string().max(500),
        }),
        z.object({
          id: z.string(),
          targetElementId: z.string(),
          type: z.literal('partial'),
          keepFirst: z.number().int().min(0).max(100).optional(),
          keepLast: z.number().int().min(0).max(100).optional(),
        }),
      ])).max(200),
    }),
    // Legacy / unknown format — passthrough
    z.record(z.string(), z.unknown()),
  ])).max(LIMITS.maxOutputVariants),
  schema: SchemaDefinitionSchema.optional(),
  submissionModels: z.array(z.record(z.string(), z.unknown())).max(LIMITS.maxSubmissionModels),
  validationRules: z.array(ValidationRuleSchema).max(LIMITS.maxValidationRules),
  pages: z.array(PageDefSchema).min(1).max(LIMITS.maxPages),
  masterHeader: SectionSchema.optional(),
  masterFooter: SectionSchema.optional(),
  formulaLanguage: z.enum(['jexl', 'formula-v1']).optional(),
}).passthrough()

export type ReportDefinitionInput = z.input<typeof ReportDefinitionSchema>
