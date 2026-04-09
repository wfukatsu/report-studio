/**
 * Grouping utilities for RepeatingBand groupBy feature.
 */

import { resolveField } from './dataBinding'

export interface GroupedData {
  /** グループ化に使用したフィールドキー */
  groupKey: string
  /** グループフィールドの値（表示用） */
  groupValue: string
  /** グループに属するレコード */
  records: Record<string, unknown>[]
}

const UNCATEGORIZED_LABEL = '(未分類)'

/**
 * レコードを groupByField でグルーピングする。
 * グループの順序はデータ出現順を維持する。
 * null/undefined/空文字のフィールド値は「(未分類)」グループにまとめる。
 */
export function groupRecords(
  records: Record<string, unknown>[],
  groupByField: string,
): GroupedData[] {
  if (records.length === 0) return []

  const groupMap = new Map<string, Record<string, unknown>[]>()
  const groupOrder: string[] = []

  for (const record of records) {
    const raw = resolveField(record, groupByField)
    const value = raw === '' ? UNCATEGORIZED_LABEL : raw

    if (!groupMap.has(value)) {
      groupMap.set(value, [])
      groupOrder.push(value)
    }
    groupMap.get(value)!.push(record)
  }

  return groupOrder.map((value) => ({
    groupKey: groupByField,
    groupValue: value,
    records: groupMap.get(value)!,
  }))
}

/**
 * groupBy 有効時の maxItems 制限を適用する。
 * maxItems = 総表示行数（データ行 + ヘッダー行 + 小計行）。
 * グループを先頭から処理し、行数が上限に達したら残りを切り捨てる。
 *
 * @param groups - グルーピング済みデータ
 * @param maxItems - 最大表示行数 (0 = 無制限)
 * @param hasGroupSubtotals - 小計行があるかどうか
 * @returns 制限適用後のグループ配列
 */
export function applyGroupedMaxItems(
  groups: GroupedData[],
  maxItems: number,
  hasGroupSubtotals: boolean,
): GroupedData[] {
  if (maxItems <= 0) return groups

  const result: GroupedData[] = []
  let consumed = 0

  for (const group of groups) {
    // 各グループの最小行数 = 1(ヘッダー) + 1(最低1データ行) + (小計行があれば1)
    const headerRows = 1
    const subtotalRows = hasGroupSubtotals ? 1 : 0
    const minGroupRows = headerRows + 1 + subtotalRows

    // 残り行数が最小グループ行数に満たない場合は終了
    const remaining = maxItems - consumed
    if (remaining < minGroupRows) break

    // グループに割り当てられるデータ行数
    const availableDataRows = remaining - headerRows - subtotalRows
    const dataRows = Math.min(group.records.length, availableDataRows)

    result.push({
      ...group,
      records: group.records.slice(0, dataRows),
    })

    consumed += headerRows + dataRows + subtotalRows
  }

  return result
}

/**
 * グルーピング後の消費行数を計算する。
 */
export function countGroupedRows(
  groups: GroupedData[],
  hasGroupSubtotals: boolean,
): number {
  let total = 0
  for (const group of groups) {
    total += 1 // ヘッダー行
    total += group.records.length // データ行
    if (hasGroupSubtotals) total += 1 // 小計行
  }
  return total
}
