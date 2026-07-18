/**
 * Plain-Japanese labels for ScalarDB technical vocabulary shown to non-engineer
 * designers in the binding UI (#128). Keeps the raw identifier available but
 * softens the jargon (`partition` → `パーティションキー`, `master` → `マスター`).
 */
import type { ScalarDbKeyType } from '@/types/scalardb'

const KEY_TYPE_LABELS: Record<ScalarDbKeyType, string> = {
  partition: 'パーティションキー',
  clustering: 'クラスタリングキー',
  index: '索引',
}

/** Japanese label for a column's key role, e.g. "partition" → "パーティションキー". */
export function keyTypeLabel(keyType: ScalarDbKeyType | undefined | null): string | null {
  if (!keyType) return null
  return KEY_TYPE_LABELS[keyType] ?? keyType
}

/** Japanese label for a schema group role. */
export function groupRoleLabel(role: 'master' | 'detail'): string {
  return role === 'master' ? 'マスター' : '明細'
}
