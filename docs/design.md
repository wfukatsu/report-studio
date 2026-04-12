# 設計書

**システム名:** Report Design Studio V2  
**作成日:** 2026-04-12

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
JEXL 計算式は Math 関数のみ許可するホワイトリスト方式のサンドボックスで実行する。  
タイムアウト (500ms)、式の長さ制限 (500文字)、式の数制限 (50個) を設ける。

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
      ...createUISlice(...a),        // プレビュー・ズーム・グリッド
      ...createAuthSlice(...a),      // 認証
      ...createTenantSlice(...a),    // テナント情報
      ...createSchemaSlice(...a),    // データスキーマ
      ...createRulesSlice(...a),     // 計算・バリデーションルール
      ...createVariantsSlice(...a),  // 出力バリアント
      ...createResponsesSlice(...a), // フォーム回答
      ...createComputedSlice(...a),  // 計算結果キャッシュ
    }
  }) as ImmerStateCreator)
)
```

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

// ... 全27型が同パターンで定義

export type ReportElement =
  | TextElement
  | DataFieldElement
  | ChartElement
  | RepeatingBandElement
  // ... 27型の Union
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

#### クライアントサイド PDF

```typescript
// src/lib/exportUtils.ts
async function exportReportToPdf(
  canvasRef: RefObject<HTMLDivElement>,
  definition: ReportDefinition,
  pageIndices: number[]
): Promise<void> {
  const { width, height } = definition.pageSettings
  const pdf = new jsPDF({
    unit: 'mm',
    format: [width, height],
    orientation: height > width ? 'portrait' : 'landscape'
  })

  for (const [i, pageIdx] of pageIndices.entries()) {
    const pageEl = canvasRef.current?.querySelector(`[data-page="${pageIdx}"]`)
    if (!pageEl) continue

    const canvas = await html2canvas(pageEl as HTMLElement, {
      scale: 2,           // 解像度2倍
      useCORS: true,
      backgroundColor: definition.pages[pageIdx].background ?? '#ffffff'
    })

    if (i > 0) pdf.addPage()
    pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, width, height)
  }

  pdf.save(`${definition.metadata.documentName ?? 'report'}.pdf`)
}
```

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
// サンドボックス設定
JexlSandbox sandbox = new JexlSandbox(false);  // デフォルト全禁止
sandbox.allow("java.lang.Math");               // Math のみ許可

JexlEngine jexl = new JexlBuilder()
    .sandbox(sandbox)
    .create();

// タイムアウト付き評価
ExecutorService exec = Executors.newSingleThreadExecutor();
Future<Object> future = exec.submit(() -> script.execute(ctx));
Object result = future.get(500, TimeUnit.MILLISECONDS);  // 500ms タイムアウト
```

**許可されている関数:**
`Math.abs`, `Math.ceil`, `Math.floor`, `Math.round`, `Math.max`, `Math.min`, `Math.pow`, `Math.sqrt`

**独自関数 (JexlFunctions):**
`sum(array)`, `count(array)`, `avg(array)`, `min(array)`, `max(array)`,  
`round(n, decimals)`, `concat(...)`, `formatDate(date, pattern)`,  
`formatNumber(n, pattern)`, `ifExpr(cond, a, b)`

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
interface ReportDefinition {
  id: string
  metadata: {
    documentName: string
    category?: string
    tags?: string[]
    description?: string
    createdAt: string
    updatedAt: string
  }
  pageSettings: {
    width: number        // mm (A4縦 = 210)
    height: number       // mm (A4縦 = 297)
    marginTop: number
    marginRight: number
    marginBottom: number
    marginLeft: number
    backgroundColor?: string
  }
  pages: PageDef[]
  schema?: SchemaDefinition          // データスキーマ定義
  calculationRules?: CalculationRule[]  // 計算ルール
  validationRules?: ValidationRule[]    // バリデーションルール
  outputVariants?: OutputVariant[]      // 出力バリアント
  masterHeader?: Section
  masterFooter?: Section
  defaultTextStyle?: TextStyle
  formSettings?: FormSettings
}
```

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
| Unit | Vitest | ユーティリティ関数・ストアスライス |
| Component | Vitest + @testing-library/react | レンダラー・プロパティパネル |
| Integration | Vitest | API クライアント・モーダル |

**カバレッジ閾値:** 80%（設定: `vitest.config.ts`）

```bash
# 単一ファイルのテスト
npx vitest run src/lib/dataBinding.test.ts
```

### バックエンドテスト

| テスト種別 | ツール | 対象 |
|-----------|--------|------|
| Unit | JUnit 5 + Mockito | コントローラ・エンジン |
| Integration | JUnit 5 | リポジトリ (SQLite インメモリ) |

```bash
./gradlew test
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
