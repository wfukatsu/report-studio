#!/usr/bin/env bash
#
# fix-ime-guard.sh
# -------------------------------------------------------------------
# 日本語IMEの変換確定Enterが「送信/改行/コミット」として誤検知される問題を一括修正する。
#
# 各テキスト入力の Enter ハンドラ内、`if (e.key === 'Enter' ...)` の直前に
# `if (e.nativeEvent.isComposing) return;` を差し込む。
# （既存の正しい実装 src/components/layout/TopNavigation.tsx と同じ記法）
#
# - 複数行ハンドラ / 1行インラインハンドラの両方に対応
# - 再実行しても二重挿入されない（冪等）
# - 非入力要素（role=button の Enter+Space 起動）と Ctrl/Cmd+Enter は対象外
#
# 使い方:
#   bash scripts/fix-ime-guard.sh          # 修正を適用
#   bash scripts/fix-ime-guard.sh --check   # 変更せず、未ガード箇所を一覧表示のみ
# -------------------------------------------------------------------
set -euo pipefail

# リポジトリのルート（このスクリプトの1つ上の階層）を基準にする
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT"

GUARD='if (e.nativeEvent.isComposing) return; '

# 修正対象（テキスト入力の確定/コミット系ハンドラ）
TARGETS=(
  "src/components/common/TagInput.tsx"
  "src/components/common/CategoryCombobox.tsx"
  "src/components/common/ZoomControl.tsx"
  "src/components/dataBrowser/DataGrid.tsx"
  "src/components/sidebar/LayerRow.tsx"
  "src/components/sidebar/LayerGroupRow.tsx"
  "src/components/modals/TemplateManagerModal.tsx"
  "src/components/modals/TemplateSelectionModal.tsx"
  "src/components/modals/VariantsModal.tsx"
  "src/components/modals/SaveTemplateDialog.tsx"
  "src/components/toolbar/Toolbar.tsx"
  "src/components/bindingEditor/internals/SchemaGroupBlock.tsx"
  "src/elements/_base/BrandColorManagerModal.tsx"   # 3箇所
  "src/elements/_base/ColorPickerPopover.tsx"
)

# 意図的に対象外（変更しない）
#   src/components/bindingEditor/panels/DbPanel.tsx   -> role=button 起動 (Enter||Space)。IMEは発生しない
#   src/components/canvas/CanvasElement.tsx           -> role=button 起動 (Enter||Space)。IMEは発生しない
#   src/components/bindingEditor/internals/ComputedFieldDialog.tsx -> Ctrl/Cmd+Enter のため既にIME安全
SKIPPED=(
  "src/components/bindingEditor/panels/DbPanel.tsx|role=button 起動 (Enter||Space)"
  "src/components/canvas/CanvasElement.tsx|role=button 起動 (Enter||Space)"
  "src/components/bindingEditor/internals/ComputedFieldDialog.tsx|Ctrl/Cmd+Enter で既にIME安全"
)

if [[ "${1:-}" == "--check" ]]; then
  echo "== 未ガードの Enter ハンドラ（対象ファイル）=="
  for f in "${TARGETS[@]}"; do
    # ガードが直前に無い 'Enter' 判定行を抽出
    matches=$(grep -nE "key === 'Enter'" "$f" | grep -v 'isComposing' || true)
    if [[ -n "$matches" ]]; then
      echo "--- $f"
      echo "$matches"
    fi
  done
  exit 0
fi

changed=0
for f in "${TARGETS[@]}"; do
  if [[ ! -f "$f" ]]; then
    echo "⚠ 見つかりません(スキップ): $f" >&2
    continue
  fi
  before="$(shasum "$f" | awk '{print $1}')"

  # `if (e.key === 'Enter'` の直前にガードを挿入。
  # 直前が既に `) return; `（=ガード済み）の場合は挿入しない（冪等）。
  perl -i -pe "s/(?<!\\) return; )if \\(e\\.key === 'Enter'/${GUARD}if (e.key === 'Enter'/g" "$f"

  after="$(shasum "$f" | awk '{print $1}')"
  if [[ "$before" != "$after" ]]; then
    n=$(grep -cE "nativeEvent\.isComposing\) return; if \(e\.key === 'Enter'" "$f" || true)
    echo "✅ 修正: $f (ガード挿入: ${n}箇所)"
    changed=$((changed+1))
  else
    echo "・変更なし(既に対応済み): $f"
  fi
done

echo
echo "== 対象外（意図的に未変更）=="
for entry in "${SKIPPED[@]}"; do
  echo "  - ${entry%%|*}  … ${entry##*|}"
done

echo
echo "完了: ${changed} ファイルを修正しました。"
echo "次の確認を推奨:"
echo "  npx tsc --noEmit          # 型チェック"
echo "  npm test                  # テスト（TopNavigation.test.tsx に既存IMEテストあり）"
echo "  git diff                  # 差分レビュー"
