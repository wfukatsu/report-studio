# ジョブ基盤(統合後アーキテクチャ)

Issue [#60](https://github.com/wfukatsu/report-studio/issues/60) で V1(ScalarDB 永続)と
V2(旧インメモリ)のジョブ基盤を**単一抽象に統合**した後の構成。

## 単一抽象

```
JobStore (interface)          ← 単一のジョブ抽象
 └── JobRepository            ← 本番実装: メタデータ = ScalarDB report_studio.jobs、
                                 成果物 = ファイルシステム data/jobs/{jobId}/
JobRecord                     ← 全スタック共通のレコード型(jobType で区別)
JobStatus (enum)              ← 統一ステータス語彙
JobConcurrencyLimiter         ← 統一同時実行制限
JobTtlReaper                  ← TTL 回収スケジューラ(60 秒周期)
```

3 つのジョブスタックすべてが `JobStore` 上で動く:

| スタック | jobType | API | 成果物 | TTL | 同時実行上限 |
|---|---|---|---|---|---|
| V1 バッチ (`JobController`) | `V1_BATCH` | `/api/v1/jobs` | `data/jobs/{id}/output/*.pdf` + `output.zip` | なし(明示 DELETE) | 20 |
| V2 単発 PDF (`V2PdfJobController`) | `V2_PDF` | `/api/v2/pdf-jobs` | `data/jobs/{id}/output.pdf` | 300 秒 | 10 |
| V2 バッチ (`V2BatchPdfController`) | `V2_BATCH` | `/api/v2/pdf-jobs/batch` | `data/jobs/{id}/output.zip` | 300 秒 | 10(統合時に新設) |

- `/api/v1/jobs` は `jobType` で V1 ジョブのみを返す(V2 ジョブはストアを共有するが V1 API には現れない)。V1 の status/cancel/download も V1 ジョブ以外は 404
- V2 API は**互換レイヤ**: エンドポイント・レスポンス形状・小文字ステータスは統合前と同一

## ステータス語彙(`JobStatus`)

`PENDING / PROCESSING / COMPLETED / FAILED / CANCELLED` の 5 値。

- V1 API は大文字(`v1Name()`)、V2 API は小文字(`v2Name()`)で表現 — 保存形は大文字
- **CANCELLED は terminal** に統一(旧 V1 では bare literal かつ非 terminal だった)。
  キャンセル済みジョブへの DELETE は削除として動作し、再起動時の reconcile 対象にもならない

## 再起動耐性

全ジョブが ScalarDB に永続化されるため、起動時の `JobRepository.reconcileOrphans()` が
**V2 ジョブも含めて** PENDING/PROCESSING のまま残ったジョブを FAILED に確定する
(旧 V2 はインメモリだったため、再起動でジョブが黙って消えていた)。

## TTL 回収

`JobRecord.expiresAt`(epoch millis、0 = 無期限)+ `JobTtlReaper`(60 秒周期、
`AppWiring` で起動/停止)。旧 V2 の「次の submit 時に lazy eviction」は廃止 —
アイドルなサーバでも孤児レコード/成果物が回収される。回収はレコードと
`data/jobs/{id}/` 以下の成果物の両方を対象とする。

## メモリ特性

- V2 単発 PDF: 結果はファイル(統合前から。temp ファイル → ジョブディレクトリに変更)
- V2 バッチ: 結果 ZIP を**ファイルへストリーミング**(旧実装はヒープ上の `byte[]` 保持)
- V1 バッチ: 従来どおりファイル

## 信頼性

- `JobRepository.save` は最大 3 回リトライ(バックオフ付き)。最終失敗は
  `ALERT:` プレフィックスで error ログ(ステータス表示が実態より遅れる旨)
- 進捗カウンタは単調増加のため、並行チェックポイントの last-write-wins は安全

## テスト

`JobStatusTest` / `JobRecordTest`(旧形式 JSON の後方互換)/ `JobConcurrencyLimiterTest` /
`V2PdfJobControllerTest` / `V2PdfJobOwnershipTest` / `V2BatchPdfControllerTest` /
`BatchPdfProcessorTest`。テストは `testsupport/InMemoryJobStore` を使用。
