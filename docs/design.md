# 設計書

**システム名:** Report Design Studio V2  
**作成日:** 2026-04-12  
**最終更新:** 2026-07-17

> **2026-07-17 更新:** ストアスライス構成（13 slices + dataBrowserStore）、JEXL サンドボックスの実装方式、サーバ PDF 優先のエクスポート設計、テンプレートエンベロープ/ジョブ基盤/ページネーション各仕様へのリンクを実装に追随。

---

## 1. 設計方針

### 1.1 フロントエンド設計方針

**イミュータビリティ (最重要)**  
すべてのオブジェクト更新は新しいオブジェクトを返す。既存オブジェクトの直接変更は禁止。  
Immer の `produce` を経由した Zustand ストアミューテーションのみで状態を更新する。

**要素の最小単位での責任分離**  
各要素タイプは `Renderer.tsx` と `PropertiesPanel.tsx` のみを持つ。  
共通処理は `_blocks/` ディレクトリのビルディングブロックに委譲する。

**ストア単一源泉**  
コンポーネントが独自の状態を持つのは一時的なローカルUI状態のみ（入力値・ホバー状態等）。  
帳票定義・選択状態・認証状態はすべて Zustand ストア経由。

**小さいファイル**  
1ファイル 200〜400行が標準、800行を超えないこと。  
大きなモジュールから共通処理を切り出しユーティリティ化する。

### 1.2 バックエンド設計方針

**軽量 DI**  
フレームワークの自動 DI を使用せず、`AppWiring.java` で手動依存性注入。  
テスタビリティを確保しつつ、設定の複雑化を防ぐ。

**サンドボックス式評価**  
JEXL 計算式はホワイトリスト方式のサンドボックス（`JexlPermissions.ClassPermissions` — `JexlFunctions` の独自関数と数学関数のみ許可、それ以外のクラスアクセスは全面禁止）で実行する。  
タイムアウト (500ms)、式の長さ制限 (500文字)、ネスト深さ制限 (16)、式の数制限 (50個) を設ける。  
金額計算は BigDecimal ベースで浮動小数点誤差を排除する（`CalculationEngine` / `JexlFunctions`）。

**ScalarDB 抽象化**  
全データアクセスは ScalarDB API 経由。SQLite / PostgreSQL / MySQL など任意の JDBC DB に透過的に対応する。

---

## 2. 主要コンポーネント設計

### 2.1 Zustand ストア設計

#### スライス構成

スライスは関心事ごとに分割し、`useReportStore` に合成します。

```typescript
// src/store/index.ts
export const useReportStore = create<StoreState>()(
  immer(((...a) => {
    return {
      ...createLayoutSlice(...a),    // ページ・要素・選択
      ...createHistorySlice(...a),   // Undo/Redo
      ...createUISlice(...a),        // アクティブタブ・プレビュー・ズーム・グリッド
      ...createClipboardSlice(...a), // 要素/スタイルのコピー・貼り付け
      ...createAuthSlice(...a),      // 認証
      ...createAdminSlice(...a),     // 管理タブ（ユーザー管理・サーバー設定）
      ...createTenantSlice(...a),    // テナント情報
      ...createSchemaSlice(...a),    // データスキーマ
      ...createRulesSlice(...a),     // 計算・バリデーションルール
      ...createVariantsSlice(...a),  // 出力バリアント
      ...createResponsesSlice(...a), // フォーム回答
      ...createProductSlice(...a),   // 商品マスタ
      ...createComputedSlice(...a),  // 計算結果キャッシュ
    }
  }) as ImmerStateCreator)
)
```

データブラウザタブは独立した `useDataBrowserStore`（`src/store/dataBrowserStore.ts`）を使用し、メインストアと状態を共有しない。トップナビの 6 タブ（デザイン/バインド/テンプレート管理/回答/データブラウザ/管理）は `uiSlice.activeTab` で切り替える。

#### 状態更新パターン

```typescript
// ✅ 正しい — Immer produce 経由
updateElement: (pageId, elementId, patch) => {
  set((s) => {
    const page = s.definition.pages.find((p) => p.id === pageId)
    const section = page?.sections.find((sec) =>
      sec.elements.some((el) => el.id === elementId)
    )
    const el = section?.elements.find((e) => e.id === elementId)
    if (el) Object.assign(el, patch)
  })
  get().pushHistory()
}

// ❌ 誤り — 直接変更
element.width = 100  // 絶対禁止
```

#### 履歴管理設計

```typescript
// 変更を記録するアクション（add/update/remove/duplicate）
pushHistory: () => {
  set((s) => {
    const snapshot = snapshotPages(s.definition.pages)
    const newHistory = s.history.slice(0, s.historyIndex + 1)
    newHistory.push(snapshot)
    s.history = newHistory.slice(-50)  // 最大50件
    s.historyIndex = s.history.length - 1
  })
}

// 変更を記録しないアクション（move/resize）
// → ドラッグ中の頻繁な更新でパフォーマンスを維持
```

**追跡対象:** ページレイアウト（ページ・セクション・要素）のみ  
**非追跡:** 計算ルール・バリデーションルール・データソース・テナント情報

### 2.2 要素タイプシステム設計

#### 型定義パターン

```typescript
// src/types/index.ts
interface ElementBase {
  id: string
  type: string       // 判別子
  x: number          // mm
  y: number          // mm
  width: number      // mm
  height: number     // mm
  locked?: boolean
  visible?: boolean
  displayCondition?: DisplayCondition
  groupId?: string
}

interface TextElement extends ElementBase {
  type: 'text'
  content: string              // {{token}} を含む可能性あり
  style?: Partial<TextStyle>
  furigana?: FuriganaConfig
}

// ... 全24型が同パターンで定義

export type ReportElement =
  | TextElement
  | DataFieldElement
  | ChartElement
  | RepeatingBandElement
  // ... 24型の Union
```

#### Renderer 実装パターン

```typescript
// src/elements/text/Renderer.tsx
export const TextRenderer = memo(function TextRenderer({
  element, data, pageContext, readonly
}: RendererProps<TextElement>) {
  const resolved = useDataResolver(element.content, data, pageContext)

  return (
    <ElementFrame element={element}>
      <TextContent
        content={resolved}
        style={element.style}
        furigana={element.furigana}
      />
    </ElementFrame>
  )
})
```

#### PropertiesPanel 実装パターン

```typescript
// src/elements/text/PropertiesPanel.tsx
export function TextPropertiesPanel({ element, pageId }: PanelProps<TextElement>) {
  const updateElement = useReportStore((s) => s.updateElement)

  return (
    <div className="space-y-4">
      <TextStyleSection
        style={element.style}
        onChange={(style) => updateElement(pageId, element.id, { style })}
      />
      <BorderSection
        element={element}
        onChange={(patch) => updateElement(pageId, element.id, patch)}
      />
      <FuriganaSection
        furigana={element.furigana}
        onChange={(furigana) => updateElement(pageId, element.id, { furigana })}
      />
    </div>
  )
}
```

### 2.3 データバインディング設計

#### フィールド解決

```typescript
// src/lib/dataBinding.ts

/**
 * ドット記法でネストしたフィールドを解決する
 * "customer.address.city" → data.customer.address.city
 */
export function resolveField(
  data: Record<string, unknown>,
  fieldKey: string
): unknown {
  const parts = fieldKey.split('.')
  // プロトタイプチェーン汚染防止
  if (parts.some((p) => ['__proto__', 'constructor', 'prototype'].includes(p))) {
    return undefined
  }
  return parts.reduce<unknown>((acc, key) => {
    if (acc != null && typeof acc === 'object') {
      return (acc as Record<string, unknown>)[key]
    }
    return undefined
  }, data)
}

/**
 * テンプレート文字列内の {{token}} を解決する
 * "こんにちは {{name}} さん" → "こんにちは 田中 さん"
 */
export function interpolate(
  template: string,
  data: Record<string, unknown>,
  pageContext?: PageContext
): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (_, key) => {
    const trimmed = key.trim()
    // システム変数
    if (trimmed === '$page' && pageContext) return String(pageContext.pageNumber)
    if (trimmed === '$totalPages' && pageContext) return String(pageContext.totalPages)
    if (trimmed === '$printDate') return new Date().toLocaleDateString('ja-JP')
    // データフィールド
    const value = resolveField(data, trimmed)
    return value != null ? String(value) : ''
  })
}
```

#### useDataResolver フック

```typescript
// src/elements/_blocks/hooks/useDataResolver.ts
export function useDataResolver(
  fieldKeyOrTemplate: string,
  data: Record<string, unknown>,
  pageContext?: PageContext,
  format?: FormatConfig
): string {
  return useMemo(() => {
    const raw = interpolate(fieldKeyOrTemplate, data, pageContext)
    return format ? applyFormat(raw, format) : raw
  }, [fieldKeyOrTemplate, data, pageContext, format])
}
```

### 2.4 Canvas 設計

#### ドラッグ&ドロップ

**パレット → Canvas:**
1. `@dnd-kit/core` の `DndContext` がドロップを検知
2. ドロップ座標 → セクション特定（Y 座標でどのセクションか判別）
3. グリッドスナップ適用（1mm 精度）
4. 余白考慮の座標計算
5. `addElement(pageId, createElement(type), sectionId)` 実行

**Canvas 上での移動:**
1. `useDraggable` で要素をドラッグ可能にする
2. `onDragEnd` イベントで新座標を計算
3. `moveElement(pageId, elementId, { x, y })` 実行（履歴は記録しない）

#### リサイズ

8方向のリサイズハンドルをポインターイベントで実装。

```typescript
// src/components/canvas/CanvasElement.tsx のリサイズハンドル
const handles = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'] as const
type HandleDir = typeof handles[number]

// ポインターダウン → ムーブ → アップの3段階で変形量を計算
```

#### ズーム

CSS `transform: scale(zoom)` をキャンバス全体に適用。  
座標はすべて mm 単位で管理し、表示時のみズーム換算する。

```typescript
const MM_TO_PX = 96 / 25.4  // 1mm = 3.779px (@96dpi)
const pixelX = element.x * MM_TO_PX * zoom
```

### 2.5 エクスポート設計

**サーバーサイド PDF が正**（Issue #61）。ベクターテキスト・ページ分割・Noto フォント埋め込みに対応し、フロントエンドの全 24 要素タイプをサーバ側でネイティブ描画する。クライアントサイド PDF（html2canvas + jsPDF）はバックエンド未接続時のフォールバックとして残る。

#### サーバーサイド PDF（推奨経路）

```typescript
// src/lib/exportUtils.ts
export async function exportToServerPdf(
  definition: ReportDefinition,
  testData: Record<string, unknown> | null,
  filename = 'report.pdf',
): Promise<void> {
  const { generateStatelessPdf } = await import('@/api/reportApi')
  // POST /api/v2/pdf/generate — definition + data をそのまま送る
  const blob = await generateStatelessPdf(defJson, dataJson)
  downloadBlob(blob, filename)
}
```

サーバ側の描画エンジン構成とページ分割の仕様は [architecture.md §4.4](architecture.md) と [pagination-spec.md](pagination-spec.md) を参照。

#### クライアントサイド PDF（フォールバック）

```typescript
// src/lib/exportUtils.ts — ページ DOM を html2canvas でラスタライズし jsPDF に貼り付ける
export async function exportReportToPdf(
  pageEls: HTMLElement[],
  fileName = 'report.pdf',
  models?: AutoFieldModels,   // ページ番号・日付等の自動フィールドをモデル駆動で解決
): Promise<void>
```

出力バリアントのマスキングは両経路で共通のロジックを通る（モデル駆動の自動フィールド + 共有マスキング）。

#### 画像セキュリティフィルタ

```typescript
// 許可する画像 URL スキーム
const SAFE_IMAGE_PREFIXES = [
  'data:image/png;base64,',
  'data:image/jpeg;base64,',
  'data:image/gif;base64,',
  'data:image/webp;base64,',
  'https://',
]
const MAX_DATA_URI_SIZE = 2 * 1024 * 1024  // 2MB

function isSafeImageSrc(src: string): boolean {
  if (src.startsWith('data:')) {
    return SAFE_IMAGE_PREFIXES.some((p) => src.startsWith(p))
      && src.length <= MAX_DATA_URI_SIZE
  }
  return src.startsWith('https://')
}
```

---

## 3. バックエンドコンポーネント設計

### 3.1 ExpressionEngine 設計

```java
// サンドボックス設定 (Issue #58 で JexlPermissions 方式に強化)
// JexlFunctions のホワイトリスト以外のクラスアクセスを全面禁止
JexlPermissions permissions =
        new JexlPermissions.ClassPermissions(JexlFunctions.class);

JexlEngine jexl = new JexlBuilder()
    .permissions(permissions)
    .create();

// タイムアウト付き評価 (TIMEOUT_MS = 500)
// 追加ガード: 式長 <= 500 文字、ネスト深さ <= 16、式数 <= 50/テンプレート
```

**独自関数 (JexlFunctions):**
`sum(array)`, `count(array)`, `avg(array)`, `min(array)`, `max(array)`,  
`round(n, decimals)`, `concat(...)`, `formatDate(date, pattern)`,  
`formatNumber(n, pattern)`, `ifExpr(cond, a, b)`

金額を扱う集計・丸めは **BigDecimal ベース**で実装されている（Issue #57 — 浮動小数点の 2 進誤差による 1 円ズレを排除）。

### 3.2 RateLimiter 設計

固定窓アルゴリズムで実装します。

```java
// デフォルト: 5回/5分/IP
public class RateLimiter {
    private final int maxAttempts;
    private final long windowMs;
    private final ConcurrentHashMap<String, Window> windows;

    public boolean isAllowed(String key) {
        long now = System.currentTimeMillis();
        Window current = windows.compute(key, (k, existing) -> {
            if (existing == null || now - existing.windowStart() >= windowMs) {
                return new Window(1, now);          // 新しい窓を開始
            }
            return new Window(existing.count() + 1, existing.windowStart());
        });
        return current.count() <= maxAttempts;
    }
}
```

**設定 (環境変数):**
- `LOGIN_RATE_LIMIT_MAX`: 試行上限 (デフォルト: 5)
- `LOGIN_RATE_LIMIT_WINDOW_MS`: 窓の長さ ms (デフォルト: 300000)

### 3.3 ScalarDB リポジトリパターン

```java
// TemplateRepository のパターン例
public class TemplateRepository {
    private final DistributedTransactionManager manager;

    public Optional<TemplateRecord> findById(String id) {
        try (DistributedTransaction tx = manager.start()) {
            Get get = Get.newBuilder()
                .namespace(NAMESPACE)
                .table(TABLE)
                .partitionKey(Key.ofText("id", id))
                .build();
            Optional<Result> result = tx.get(get);
            tx.commit();
            return result.map(this::toRecord);
        }
    }

    public void save(TemplateRecord record) {
        try (DistributedTransaction tx = manager.start()) {
            Upsert upsert = Upsert.newBuilder()
                .namespace(NAMESPACE)
                .table(TABLE)
                .partitionKey(Key.ofText("id", record.id()))
                .textValue("definition", record.definitionJson())
                .bigIntValue("updated_at", record.updatedAt())
                .build();
            tx.upsert(upsert);
            tx.commit();
        }
    }
}
```

JSON ドキュメントを保持する多くのテーブル（`v2_definitions`, `tenant`, `products`, `webhooks` 等）は、この形の実装を共通化した `JsonBlobRepository` を経由する。

### 3.4 テンプレートエンベロープ設計

テンプレートの交換・永続化は正準エンベロープ `{ formatVersion: 2, definition }` に統一されている（Issue #52）。サーバは `TemplateEnvelope.unwrap()` で旧形式をマイグレーションラダーで引き上げ、保存境界では `ReportDefinitionValidator` が構造上限値（`schemas/report-definition-limits.json` — フロント Zod と共有の単一ソース）を検証する。

詳細仕様は **[template-envelope-spec.md](template-envelope-spec.md)** が正。

### 3.5 PDF レンダラー構成

サーバ PDF は 2 段のレジストリで構成される:

- `SectionPdfRendererRegistry` — セクション種別（`page_base` / `detail_table` / `multi_row_table` / `free`）ごとのページ計画と描画。ページ分割・繰越小計・グループ改ページ・押し下げ自動改ページ・V2 バンドフローの仕様は **[pagination-spec.md](pagination-spec.md)** が正
- `ElementPdfRendererRegistry` — 要素種別ごとの描画。フロントエンドの全 24 要素タイプをカバーし、`V2ElementParityMatrixTest` がパリティを保証（Issue #53）

和文タイポグラフィ（Issue #56）は `FontProvider` が同梱の Noto Sans JP Regular/Bold・Noto Serif JP を埋め込み、折返し・縦書き・ふりがな・太字描画をサーバ側で行う。システム変数（ページ番号・日付・和暦）とテナント情報は `SystemValueResolver` / `TenantInfoProvider` がサーバ側で解決する（Issue #54）。

### 3.6 ジョブ基盤設計

V1/V2 のジョブスタックは単一の `JobStore` 抽象（実装 `JobRepository` = ScalarDB メタデータ + ファイルシステム成果物）に統合されている（Issue #60）。統一ステータス語彙・TTL 回収・再起動時 reconcile・同時実行制限を含む詳細は **[job-infrastructure.md](job-infrastructure.md)** が正。

ジョブは投入 Principal を所有者として記録し、状態参照・結果ダウンロードを所有者に限定する（Issue #58）。

---

## 4. セクション構造設計

帳票の1ページは複数のセクションで構成されます。

```
PageDef {
  id, name, width, height, background
  sections: Section[]
}

Section {
  id
  sectionType: 'header' | 'body' | 'footer' | 'custom'
  height: number (mm)
  elements: ReportElement[]
}
```

**マスターヘッダー/フッター:**  
ページをまたいで同じヘッダー/フッターを表示するマスターセクション。  
`definition.masterHeader`, `definition.masterFooter` に格納。

**H/F 編集モード:**  
ツールバーの「H/F 編集」ボタンでヘッダー・フッターのセクション高さを変更可能。

---

## 5. テンプレート構造設計

### ReportDefinition の主要フィールド

```typescript
// src/types/index.ts (現行)
interface ReportDefinition {
  id: string
  metadata: Metadata                 // documentName / category / tags / ...
  pageSettings: PageSettings         // width / height / margin* / clipToMargins
  defaultTextStyle: TextStyle
  templateVariables: TemplateVariable[]
  calculationRules: CalculationRule[]
  dataSources: DataSourceDefinition[]
  outputVariants: OutputVariant[]
  submissionModels: SubmissionModel[]
  validationRules: ValidationRule[]
  pages: PageDef[]
  schema?: SchemaDefinition          // データスキーマ定義
  masterHeader?: Section             // addPage 時に全ページへ複製
  masterFooter?: Section
  formulaLanguage?: FormulaLanguage  // 'jexl' (レガシー) | 'formula-v1'
}
```

ファイル・API・ストレージ間の受け渡しは常にエンベロープ `{ formatVersion: 2, definition }` で行う（→ [template-envelope-spec.md](template-envelope-spec.md)）。

---

## 6. 条件表示設計

要素単位で表示条件を設定できます。

```typescript
interface DisplayCondition {
  operator: 'and' | 'or'
  conditions: SingleCondition[]
}

interface SingleCondition {
  fieldKey: string
  comparator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'empty' | 'not_empty'
  value?: string | number | boolean
}
```

`ElementRenderer` がレンダリング前に `conditionEvaluator.ts` で評価し、条件が偽なら要素を非表示にします。

---

## 7. テスト設計方針

### フロントエンドテスト

| テスト種別 | ツール | 対象 |
|-----------|--------|------|
| Unit | Vitest 3 | ユーティリティ関数・ストアスライス |
| Component | Vitest 3 + @testing-library/react | レンダラー・プロパティパネル |
| Integration | Vitest 3 | API クライアント・モーダル |

**カバレッジ閾値:** 80%（設定: `vitest.config.ts`）  
**CI:** GitHub Actions（`.github/workflows/ci.yml`）が push/PR ごとに lint・型チェック・フロント/バックエンドテストを実行（CI では threads プールで実行）

```bash
# 単一ファイルのテスト
npx vitest run src/lib/dataBinding.test.ts
```

### バックエンドテスト

| テスト種別 | ツール | 対象 |
|-----------|--------|------|
| Unit | JUnit 5 + Mockito | コントローラ・エンジン |
| Integration | JUnit 5 | リポジトリ (SQLite インメモリ) |
| PDF 検証 | JUnit 5 | パースバックテスト（生成 PDF を解析して座標・文言を検証）+ ゴールデンテンプレート・パリティマトリクス（`V2ElementParityMatrixTest`） |

```bash
npm run test:backend   # (= ./gradlew test)
```

---

## 8. エラー処理設計

### フロントエンド

**要素レベル:** `ElementErrorBoundary` がキャッチし、要素単位でエラー表示（帳票全体はクラッシュしない）

**API エラー:** `apiFetch` が全 non-2xx を `ApiError` にラップ。コンポーネントで `catch` して toast 表示。

**テナント情報:** ネットワークエラーや 401 は無視（ベストエフォート）。要素は fallback テキストを表示。

### バックエンド

**グローバルハンドラ:** Javalin の `app.exception()` で全例外をキャッチし、統一 JSON 形式でレスポンス。

```java
app.exception(Exception.class, (e, ctx) -> {
    log.error("Unhandled exception", e);
    ctx.status(500).json(Map.of("error", "Internal server error"));
});
```

**ValidationException → 400、NotFoundException → 404、AuthException → 401**

---

## 9. ローカリゼーション設計

現在 UI は日本語固定です。テキストは各コンポーネントにハードコードされています。  
将来の多言語対応を考慮し、文字列定数ファイルへの分離を推奨します。

**日本語専用機能:**
- ふりがな (Ruby テキスト)
- 縦書き
- 元号 (Wareki) 表示
- 漢数字フォーマット
- 印鑑・承認欄・収入印紙要素
