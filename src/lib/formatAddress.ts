import type { AddressDisplayMode } from '@/types'

export interface AddressFields {
  postalCode?: string
  address1?: string
  address2?: string
  /** 後方互換フォールバック: address1 が未定義のとき address を address1 として扱う */
  address?: string
}

/**
 * 住所フィールドを指定モードでフォーマットする。
 *
 * - `single`: `〒{postalCode} {address1}{address2}` の1行表示
 * - `multiLine`: 郵便番号 / address1 / address2 を改行で区切る（空行は省略）
 *
 * address1 が未定義で address がある場合は address を address1 として扱う（後方互換）。
 */
export function formatAddress(
  fields: AddressFields,
  mode: AddressDisplayMode = 'single',
): string {
  const { postalCode, address2, address } = fields
  const addr1 = fields.address1 ?? address ?? ''
  const addr2 = address2 ?? ''

  if (!addr1 && !addr2 && !postalCode) {
    return ''
  }

  if (mode === 'multiLine') {
    const lines: string[] = []
    if (postalCode) lines.push(`〒${postalCode}`)
    if (addr1) lines.push(addr1)
    if (addr2) lines.push(addr2)
    return lines.join('\n')
  }

  // single mode
  const postalPrefix = postalCode ? `〒${postalCode} ` : ''
  return `${postalPrefix}${addr1}${addr2}`
}
