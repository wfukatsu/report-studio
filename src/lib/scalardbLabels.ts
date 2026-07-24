/**
 * Plain-language labels for ScalarDB technical vocabulary shown to non-engineer
 * designers in the binding UI (#128). Keeps the raw identifier available but
 * softens the jargon (`partition` → `パーティションキー`, `master` → `マスター`).
 * Labels are resolved with `i18n.t()` at call time (#410) so they follow the
 * active language.
 */
import type { ParseKeys } from 'i18next'
import i18n from '@/i18n/config'
import type { ScalarDbKeyType } from '@/types/scalardb'

const KEY_TYPE_LABEL_KEYS: Record<ScalarDbKeyType, ParseKeys<'components'>> = {
  partition: 'scalardbLabels.partitionKey',
  clustering: 'scalardbLabels.clusteringKey',
  index: 'scalardbLabels.index',
}

/** Localized label for a column's key role, e.g. "partition" → "パーティションキー". */
export function keyTypeLabel(keyType: ScalarDbKeyType | undefined | null): string | null {
  if (!keyType) return null
  const key = KEY_TYPE_LABEL_KEYS[keyType]
  if (!key) return keyType
  return i18n.getFixedT(null, 'components')(key)
}

/** Localized label for a schema group role. */
export function groupRoleLabel(role: 'master' | 'detail'): string {
  const t = i18n.getFixedT(null, 'components')
  return role === 'master' ? t('scalardbLabels.roleMaster') : t('scalardbLabels.roleDetail')
}
