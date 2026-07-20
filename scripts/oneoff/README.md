# scripts/oneoff/

一過性のメンテナンススクリプト置き場。過去の一括変換の記録として残しているだけで、
再実行は想定していない（対象だったコードベースの状態が既に変わっているため、
再実行すると壊れる可能性がある）。

| スクリプト | 用途（当時） |
|---|---|
| `add-layer-groups.mjs` / `add-layer-groups-remaining.mjs` | 旧テンプレート JSON へのレイヤーグループ一括付与 |
| `add-element-names.mjs` | 要素への表示名一括付与 |
| `fix-ime-guard.sh` | IME composition guard (`isComposing`) の一括挿入 |
