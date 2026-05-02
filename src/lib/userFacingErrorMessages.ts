/**
 * userFacingErrorMessages — Japanese strings for `UserFacingErrorCode`.
 *
 * Keep this file flat and string-only so it stays trivial to extend with
 * additional locales later (one map per locale).
 */
import type { UserFacingErrorCode } from './userFacingError'

export interface UserFacingErrorCopy {
  title: string
  hint: string
}

export const ERROR_MESSAGES_JA: Record<UserFacingErrorCode, UserFacingErrorCopy> = {
  unauthorized: {
    title: 'ログインが必要です',
    hint: '再度ログインしてからお試しください。',
  },
  forbidden: {
    title: 'この操作の権限がありません',
    hint: '管理者にお問い合わせください。',
  },
  not_found: {
    title: '対象が見つかりません',
    hint: 'すでに削除されたか、未公開の可能性があります。',
  },
  conflict: {
    title: 'すでに存在します',
    hint: '別の名前でお試しください。',
  },
  invalid_request: {
    title: '入力内容に誤りがあります',
    hint: '内容を確認してから再送信してください。',
  },
  rate_limited: {
    title: 'リクエストが多すぎます',
    hint: 'しばらく待ってから再試行してください。',
  },
  unreachable: {
    title: 'バックエンドに接続できません',
    hint: 'しばらく待ってから再試行してください。',
  },
  server_error: {
    title: '一時的なエラーが発生しました',
    hint: '時間をおいて再試行してください。',
  },
  network: {
    title: 'ネットワークに接続できません',
    hint: '接続状態を確認してから再試行してください。',
  },
  unknown: {
    title: '予期しないエラーが発生しました',
    hint: 'ページを再読み込みしてお試しください。',
  },
}

export function getErrorCopy(code: UserFacingErrorCode | string): UserFacingErrorCopy {
  // Tolerate stray code strings (e.g. a Node-style `code: 'ECONNREFUSED'` slipping
  // through `InlineErrorBanner.isClassified`) by falling back to the unknown copy.
  return ERROR_MESSAGES_JA[code as UserFacingErrorCode] ?? ERROR_MESSAGES_JA.unknown
}
