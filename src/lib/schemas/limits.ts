/**
 * ReportDefinition structural limits.
 *
 * The values live in schemas/report-definition-limits.json — the single source
 * shared with the server-side validator (ReportDefinitionValidator loads the
 * same file as a bundled resource). Do not hard-code these numbers elsewhere.
 */
import limits from '../../../schemas/report-definition-limits.json'

export const REPORT_DEFINITION_LIMITS = {
  maxPages: limits.maxPages,
  maxSectionsPerPage: limits.maxSectionsPerPage,
  maxElementsPerSection: limits.maxElementsPerSection,
  maxCalculationRules: limits.maxCalculationRules,
  maxValidationRules: limits.maxValidationRules,
  maxOutputVariants: limits.maxOutputVariants,
  maxTemplateVariables: limits.maxTemplateVariables,
  maxDataSources: limits.maxDataSources,
  maxSubmissionModels: limits.maxSubmissionModels,
} as const
