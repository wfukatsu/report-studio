---
title: "feat: テナント情報要素と一元管理（Tenant Info Elements）"
type: feat
status: completed
date: 2026-04-12
origin: docs/brainstorms/2026-04-12-tenant-info-elements-brainstorm.md
---

# feat: テナント情報要素と一元管理

## Overview

テナント（組織）全体で共有する情報（会社名・住所・電話番号・ロゴ・代表者名など）を
バックエンドに永続化し、帳票テンプレートに専用要素として配置・印刷できる機能を追加する。

`pageNumber` / `currentDate` と同じ専用要素タイプのパターンで 6 種類の要素を追加し、
「データ設定」ダイアログに新タブ「テナント情報」を設けて一元管理する。

---

## Problem Statement

現状、帳票に会社名・住所・ロゴを入れるには毎回テキスト要素に直接入力するか、
サンプルデータのフィールドとして定義する必要がある。
テナント情報は全帳票で共通なので、

- 住所変更時に全帳票を再編集しなければならない
- ブランドロゴの差し替えが全テンプレートに波及する
- 新規テンプレート作成のたびに同じ情報を手で入力する

---

## Proposed Solution

(see brainstorm: docs/brainstorms/2026-04-12-tenant-info-elements-brainstorm.md)

| 決定事項 | 選択 |
|----------|------|
| 要素設計 | 複数専用タイプ（pageNumber / currentDate と同パターン） |
| 保存場所 | バックエンドAPI（JsonBlobRepository で DB 保存） |
| 管理UI | データ設定ダイアログの新タブ「テナント情報」 |
| ロゴ | ファイルアップロード（Base64形式でDB保存、`isSafeImageSrc` で安全性検証） |
| 認可 | 全ログインユーザーが編集可能（ロール判定不要） |
| カスタムフィールド | `tenantCustom` 要素 + キー指定（最大 20 フィールド） |

---

## New Element Types

パレット「テナント情報」カテゴリ（新規追加）に配置：

| 要素名（表示） | type | 内容 | 流用ブロック |
|---------------|------|------|-------------|
| 会社名 | `tenantCompanyName` | 会社名テキスト | `ElementFrame`, `TextContent` |
| 住所 | `tenantAddress` | 郵便番号＋住所テキスト | `ElementFrame`, `TextContent` |
| 電話番号 | `tenantPhone` | 電話番号テキスト | `ElementFrame`, `TextContent` |
| 代表者名 | `tenantRepresentative` | 代表者名テキスト | `ElementFrame`, `TextContent` |
| ロゴ | `tenantLogo` | 画像（Base64） | `ElementFrame`, `<img>` |
| カスタムフィールド | `tenantCustom` | 指定キーの値をテキスト表示 | `ElementFrame`, `TextContent` |

---

## Technical Approach

### バックエンド API

```
GET  /api/v2/tenant    # テナント情報取得（未設定なら空オブジェクト）
PUT  /api/v2/tenant    # テナント情報更新（全フィールド置換）
```

**テナント情報スキーマ（JSON）:**
```json
{
  "companyName": "株式会社サンプル",
  "postalCode": "100-0001",
  "address": "東京都千代田区...",
  "phone": "03-1234-5678",
  "email": "info@example.com",
  "representativeName": "山田太郎",
  "logoBase64": "data:image/png;base64,...",
  "custom": {
    "taxRegistrationNumber": "T1234567890123"
  }
}
```

シングルトン永続化: `JsonBlobRepository`（table: `"tenant"`, id: `"singleton"`）。
この手法は既存の `schemas` / `binding_trees` テーブルと完全に同じパターン。

### フロントエンド型定義

`src/types/index.ts` に追加:

```typescript
// テナント情報データ型
export interface TenantInfo {
  companyName?: string
  postalCode?: string
  address?: string
  phone?: string
  email?: string
  representativeName?: string
  logoBase64?: string  // data:image/... 形式
  custom?: Record<string, string>
}

// 各要素インターフェース（ElementBase を継承）
export interface TenantCompanyNameElement extends ElementBase {
  type: 'tenantCompanyName'
  style: TextStyle
  fallback?: string          // テナント情報未設定時の表示テキスト
}

export interface TenantAddressElement extends ElementBase {
  type: 'tenantAddress'
  style: TextStyle
  fallback?: string
}

export interface TenantPhoneElement extends ElementBase {
  type: 'tenantPhone'
  style: TextStyle
  fallback?: string
}

export interface TenantRepresentativeElement extends ElementBase {
  type: 'tenantRepresentative'
  style: TextStyle
  fallback?: string
}

export interface TenantLogoElement extends ElementBase {
  type: 'tenantLogo'
  objectFit: 'contain' | 'cover' | 'fill' | 'none'
  opacity?: number
}

export interface TenantCustomElement extends ElementBase {
  type: 'tenantCustom'
  fieldKey: string           // custom オブジェクトのキー
  style: TextStyle
  fallback?: string
}
```

`ReportElement` ユニオンに 6 型を追加。

### Zustand Store スライス

`src/store/tenantSlice.ts`（新規作成）:

```typescript
export type TenantSlice = {
  tenantInfo: TenantInfo | null
  tenantLoading: boolean
  fetchTenantInfo: () => Promise<void>
  updateTenantInfo: (info: TenantInfo) => Promise<void>
}
```

- `fetchTenantInfo()`: アプリ起動時（`App.tsx`）に呼ぶ
- `updateTenantInfo()`: テナント情報タブの「保存」ボタンで呼ぶ
- スライスを `src/store/index.ts` に追加（`createTenantSlice` をスプレッド）

### フロントエンド API クライアント

`src/api/reportApi.ts` に追加:

```typescript
const TenantInfoSchema = z.object({
  companyName: z.string().optional(),
  postalCode: z.string().optional(),
  address: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  representativeName: z.string().optional(),
  logoBase64: z.string().optional(),
  custom: z.record(z.string()).optional(),
})

export async function getTenantInfo(): Promise<TenantInfo> {
  return apiFetch('/api/v2/tenant', TenantInfoSchema)
}

export async function putTenantInfo(info: TenantInfo): Promise<TenantInfo> {
  return apiFetch('/api/v2/tenant', TenantInfoSchema, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(info),
  })
}
```

### 要素レンダラーのデータ取得

各テナントテキスト要素 Renderer で `useStore` を直接使い、フィールド単位の selector で不要な再レンダリングを防ぐ:

```tsx
// src/elements/tenantCompanyName/Renderer.tsx
export const TenantCompanyNameRenderer = memo(function TenantCompanyNameRenderer({ element }: Props) {
  const tenantInfo = useStore(s => s.tenantInfo)
  const value = tenantInfo?.companyName ?? element.fallback ?? '（会社名未設定）'
  return (
    <ElementFrame element={element}>
      <TextContent text={value} style={element.style} />
    </ElementFrame>
  )
})
```

`tenantLogo` は `ImageRenderer` と同様の `<img>` パターン + `isSafeImageSrc()` で検証。

---

## Implementation Phases

### Phase 1: バックエンド（V2TenantController）

**ゴール:** `GET/PUT /api/v2/tenant` が動作し、ScalarDB/SQLite にデータが永続化される。

**タスク:**

1. `server/src/main/java/com/report/server/V2TenantController.java` を新規作成
   - `get(Context ctx)`: JsonBlobRepository で `"singleton"` キーを取得、なければ空の JSON を返す
   - `put(Context ctx)`: リクエストボディを JSON として受け取り保存（認証済みユーザーのみ）
   - `POST /api/v2/tenant/logo` は不要 — Base64 を PUT ボディに含める

2. `server/src/main/java/com/report/server/AppWiring.java` を更新
   - `JsonBlobRepository tenantRepo = new JsonBlobRepository(factory, NAMESPACE, "tenant")` を追加（~line 110）
   - `tenantRepo.ensureTable()` を追加
   - `V2TenantController v2TenantCtrl = new V2TenantController(tenantRepo)` を追加

3. `server/src/main/java/com/report/server/ApiRoutes.java` を更新
   - `registerV2Routes()` 内に追加:
     ```java
     app.get("/api/v2/tenant", w.v2TenantCtrl::get);
     app.put("/api/v2/tenant", w.v2TenantCtrl::put);
     ```

**テスト:** `V2TenantControllerTest.java` を新規作成
- `GET /api/v2/tenant` → 初期は `{}` を返す
- `PUT /api/v2/tenant` → 保存後に `GET` で同じ値が返る
- 未認証の `PUT` → 401

---

### Phase 2: フロントエンド基盤（型・Store・API クライアント）

**ゴール:** フロントエンドがバックエンドからテナント情報を取得・更新できる。

**タスク:**

1. `src/types/index.ts` に `TenantInfo` 型と 6 つの要素インターフェースを追加
   - `ReportElement` ユニオンに追加（line ~721）

2. `src/store/tenantSlice.ts` を新規作成
   - `TenantSlice` 型定義 + `createTenantSlice` 関数

3. `src/store/index.ts` を更新
   - `createTenantSlice` をインポートしてスプレッドで合成

4. `src/api/reportApi.ts` に `getTenantInfo` / `putTenantInfo` を追加
   - Zod スキーマ定義も追加（`TenantInfoSchema`）

5. `src/App.tsx`（または初期化フック）で `fetchTenantInfo()` を起動時に呼ぶ

**テスト:** `src/store/tenantSlice.test.ts` を新規作成
- `fetchTenantInfo()` が API を呼んで store を更新する
- `updateTenantInfo()` が `PUT` を呼んで store を更新する
- API エラー時の挙動

---

### Phase 3: 管理UI（データ設定ダイアログ「テナント情報」タブ）

**ゴール:** ユーザーがダイアログからテナント情報を編集・保存できる。

**タスク:**

1. `src/components/modals/TenantInfoTab.tsx` を新規作成
   - フォームフィールド: 会社名、郵便番号、住所、電話番号、メール、代表者名
   - ロゴ: `<input type="file" accept="image/*">` → FileReader で Base64 変換 → プレビュー表示
     - `isSafeImageSrc()` でアップロード後に検証（`src/lib/exportUtils.ts:101`）
   - カスタムフィールド: key/value リスト（データ設定の既存フォームパターンを流用）
     - 最大 20 フィールドで追加ボタンを無効化
   - 「保存」ボタン → `updateTenantInfo()` を呼ぶ → 成功トーストを表示

2. `src/components/modals/DataBindingModal.tsx` を更新（lines 10-18）
   - `type TabId` に `'tenantinfo'` を追加
   - `TABS` 配列に `{ id: 'tenantinfo', label: 'テナント情報' }` を追加
   - コンテンツ部分に `{activeTab === 'tenantinfo' && <TenantInfoTab />}` を追加

**テスト:** `TenantInfoTab.test.tsx` を新規作成
- フォーム入力が store に反映される
- ロゴアップロードが Base64 変換・プレビューを行う
- 20フィールド上限で「追加」ボタンが無効化される
- 保存ボタンが `updateTenantInfo` を呼ぶ

---

### Phase 4: テキスト系要素（4種類）

**ゴール:** 会社名・住所・電話番号・代表者名 要素がキャンバスに配置・選択・印刷できる（各要素完了ごとに動作確認可能）。

各要素の作業内容は共通パターン。`tenantCompanyName` を例に示す（他3つも同様）:

**タスク（要素ごとに繰り返し）:**

1. `src/elements/tenantCompanyName/Renderer.tsx` を新規作成
   - `useStore(s => s.tenantInfo?.companyName)` で値を取得
   - `resolveValues=false` 時: `{{会社名}}` プレースホルダー（エディタ表示）
   - `resolveValues=true` 時: 実際の値（プレビュー・エクスポート）
   - 値がない場合は `element.fallback` or `'（会社名未設定）'`

2. `src/elements/tenantCompanyName/PropertiesPanel.tsx` を新規作成
   - `TextStyleSection` でフォント・サイズ・色・配置を設定
   - `fallback` テキスト入力フィールド

3. `src/lib/elementFactories.ts` に `createTenantCompanyNameElement()` を追加

4. **ワイヤリング（各要素完了時に実施）:**
   - `src/components/canvas/ElementRenderer.tsx` に Renderer をインポート・追加
   - `src/components/sidebar/PropertiesPanel.tsx` に PropertiesPanel をインポート・追加

4 要素まとめて作成: `tenantAddress`, `tenantPhone`, `tenantRepresentative` も同パターン（各 Renderer の selector は `.address` / `.phone` / `.representativeName`）。

**テスト:** `src/elements/tenantCompanyName/Renderer.test.tsx`
- テナント情報あり: 実際の値を表示
- テナント情報なし: fallback を表示
- `resolveValues=false`: プレースホルダーを表示

---

### Phase 5: ロゴ要素（tenantLogo）

**ゴール:** ロゴ画像がキャンバスに配置・印刷できる。

**タスク:**

1. `src/elements/tenantLogo/Renderer.tsx` を新規作成
   - `useStore(s => s.tenantInfo?.logoBase64)` で値を取得
   - `ImageRenderer` と同じ `<img>` パターン、`isSafeImageSrc()` で検証
   - 未設定時: `📷 ロゴ未設定` プレースホルダー

2. `src/elements/tenantLogo/PropertiesPanel.tsx` を新規作成
   - `objectFit` 選択（contain / cover / fill / none）
   - `opacity` スライダー
   - 「テナント設定でロゴを変更 →」リンク（クリックでデータ設定ダイアログを開く）

3. `src/lib/elementFactories.ts` に `createTenantLogoElement()` を追加

4. **ワイヤリング:**
   - `src/components/canvas/ElementRenderer.tsx` に `TenantLogoRenderer` をインポート・追加
   - `src/components/sidebar/PropertiesPanel.tsx` に `TenantLogoPropertiesPanel` をインポート・追加

**テスト:** `src/elements/tenantLogo/Renderer.test.tsx`
- Base64 ロゴを正しく表示
- 未設定時のプレースホルダー
- 不正な画像データを弾く（`isSafeImageSrc` が false を返すケース）

---

### Phase 6: カスタムフィールド要素（tenantCustom）

**ゴール:** 任意のカスタムキーの値を要素として配置できる。

**タスク:**

1. `src/elements/tenantCustom/Renderer.tsx` を新規作成
   - `useStore(s => s.tenantInfo?.custom?.[element.fieldKey])` で値を取得
   - `resolveValues=false` 時: `{{fieldKey}}` プレースホルダー

2. `src/elements/tenantCustom/PropertiesPanel.tsx` を新規作成
   - `fieldKey` テキスト入力（カスタムフィールドのキーを指定）
   - `TextStyleSection` でスタイル設定
   - `fallback` テキスト入力

3. `src/lib/elementFactories.ts` に `createTenantCustomElement()` を追加

4. **ワイヤリング:**
   - `src/components/canvas/ElementRenderer.tsx` に `TenantCustomRenderer` をインポート・追加
   - `src/components/sidebar/PropertiesPanel.tsx` に `TenantCustomPropertiesPanel` をインポート・追加

---

### Phase 7: パレット統合（最終仕上げ）

**ゴール:** すべての要素がパレットの「テナント情報」カテゴリからドラッグ&ドロップで追加できる。

（ElementRenderer / PropertiesPanel への追加は Phase 4-6 で各要素完了時に実施済み）

**タスク:**

1. `src/components/sidebar/paletteData.tsx` を更新
   - 「テナント情報」カテゴリを新規追加:
     ```typescript
     {
       category: 'tenant',
       label: 'テナント情報',
       items: [
         { label: '会社名', icon: <Building2 />, createElement: createTenantCompanyNameElement },
         { label: '住所', icon: <MapPin />, createElement: createTenantAddressElement },
         { label: '電話番号', icon: <Phone />, createElement: createTenantPhoneElement },
         { label: '代表者名', icon: <User />, createElement: createTenantRepresentativeElement },
         { label: 'ロゴ', icon: <Image />, createElement: createTenantLogoElement },
         { label: 'カスタムフィールド', icon: <Tag />, createElement: createTenantCustomElement },
       ],
     }
     ```

---

## System-Wide Impact

### Interaction Graph

```
App.tsx 起動
  → fetchTenantInfo() [tenantSlice]
    → GET /api/v2/tenant [V2TenantController.get]
      → JsonBlobRepository.get("singleton") [tenant テーブル]
    → store.tenantInfo を更新

DataBindingModal「テナント情報」タブ「保存」
  → updateTenantInfo(info) [tenantSlice]
    → PUT /api/v2/tenant [V2TenantController.put]
      → JsonBlobRepository.upsert("singleton", json) [tenant テーブル]
    → store.tenantInfo を更新
    → テナント要素レンダラーが自動再レンダリング（Zustand リアクティビティ）
```

### Error & Failure Propagation

- `GET /api/v2/tenant` 失敗時: `store.tenantInfo = null` のまま。要素は `fallback` を表示。エラーはコンソールにログ（トースト表示は低優先）
- `PUT /api/v2/tenant` 失敗時: store を更新しない。`ApiError` を catch してトースト通知
- ロゴアップロード: ファイルサイズ上限（推奨 2MB）を UI 側でチェック。`isSafeImageSrc()` で安全性検証

### State Lifecycle Risks

- テナント情報は単一の Zustand スライスが管理するシングルトン。楽観的更新は行わず、PUT 成功後に store を更新するため不整合は発生しない
- `logoBase64` が大きいと（数MB）ストア・API の両方に負荷。2MB 制限を UI で強制

### API Surface Parity

- 既存の `evaluate` / `validate` エンドポイントはテナント情報を参照しない（テナント要素はクライアント側でのみ解決）
- 将来的に `$tenant.xxx` 変数展開が必要な場合は `ExpressionEngine` への注入が必要（スコープ外）

### Integration Test Scenarios

1. アプリ起動 → `GET /api/v2/tenant` → テナント要素が空のプレースホルダーを表示
2. テナント情報を更新 → キャンバス上のテナント要素がリアルタイムで更新される
3. ロゴをアップロード → テナントロゴ要素がプレビューに表示される
4. html2canvas によるPNG出力でテナント情報が正しく描画される
5. バックエンド未接続時: テナント要素が `fallback` を表示してクラッシュしない

---

## Acceptance Criteria

### Functional Requirements

- [x] `GET /api/v2/tenant` がテナント情報（またはデフォルト空オブジェクト）を返す
- [x] `PUT /api/v2/tenant` がテナント情報を保存し、次回 GET で同じ値が返る
- [x] データ設定ダイアログに「テナント情報」タブが表示される
- [x] 会社名・住所・電話番号・代表者名・メールを編集・保存できる
- [x] ロゴ画像をファイルアップロードで設定でき、プレビューが表示される
- [x] カスタムフィールドを最大 20 件 追加・削除できる
- [x] 6 種類のテナント要素がパレットの「テナント情報」カテゴリに表示される
- [x] テナント要素をキャンバスに配置するとテナント情報の値が表示される
- [x] テナント情報未設定時は `fallback` テキストまたはデフォルトプレースホルダーを表示
- [x] プロパティパネルでスタイル（フォント・色・サイズ）を変更できる
- [x] テナントカスタム要素でフィールドキーを指定できる
- [ ] PNG エクスポート時にテナント情報が正しく出力される

### Non-Functional Requirements

- [x] ロゴファイルサイズ上限 2MB を UI で強制
- [x] `isSafeImageSrc()` でロゴの安全性を検証（XSS 防止）
- [x] テナント API エンドポイントに認証チェック（未ログイン → 401）
- [x] バックエンド接続なしでも要素がクラッシュせず fallback を表示

### Quality Gates

- [x] フロントエンド テストカバレッジ 80% 以上（新規ファイル）
- [x] バックエンド `V2TenantControllerTest.java` が PASS
- [x] TypeScript コンパイルエラーなし (`npm run build`)
- [ ] ESLint エラーなし

---

## Dependencies & Prerequisites

- 既存の `JsonBlobRepository` パターン（`AppWiring.java` ~line 109）
- 既存の `isSafeImageSrc()` 関数（`src/lib/exportUtils.ts:101`）
- 既存の `ElementFrame`, `TextContent` ブロック（`src/elements/_blocks/renderers/`）
- 既存の `TextStyleSection` パネルブロック（`src/elements/_blocks/panels/`）
- 既存の `apiFetch` クライアント（`src/api/client.ts`）

---

## Out of Scope

(see brainstorm: docs/brainstorms/2026-04-12-tenant-info-elements-brainstorm.md)

- マルチテナント（テナント切り替え）
- テナントごとのユーザー分離
- 帳票ごとにテナント情報をオーバーライドする機能
- `{{$tenant.xxx}}` 変数展開（テキスト要素での変数参照）
- i18n / 多言語対応
- S3/外部ストレージへのロゴ保存

---

## File Change Summary

### 新規作成（バックエンド）

- `server/src/main/java/com/report/server/V2TenantController.java`
- `server/src/test/java/com/report/server/V2TenantControllerTest.java`

### 変更（バックエンド）

- `server/src/main/java/com/report/server/AppWiring.java` — `tenantRepo` 追加
- `server/src/main/java/com/report/server/ApiRoutes.java` — テナントルート追加

### 新規作成（フロントエンド）

- `src/store/tenantSlice.ts`
- `src/components/modals/TenantInfoTab.tsx`
- `src/elements/tenantCompanyName/Renderer.tsx`
- `src/elements/tenantCompanyName/PropertiesPanel.tsx`
- `src/elements/tenantAddress/Renderer.tsx`
- `src/elements/tenantAddress/PropertiesPanel.tsx`
- `src/elements/tenantPhone/Renderer.tsx`
- `src/elements/tenantPhone/PropertiesPanel.tsx`
- `src/elements/tenantRepresentative/Renderer.tsx`
- `src/elements/tenantRepresentative/PropertiesPanel.tsx`
- `src/elements/tenantLogo/Renderer.tsx`
- `src/elements/tenantLogo/PropertiesPanel.tsx`
- `src/elements/tenantCustom/Renderer.tsx`
- `src/elements/tenantCustom/PropertiesPanel.tsx`
- テストファイル（各要素 + TenantInfoTab + tenantSlice）

### 変更（フロントエンド）

- `src/types/index.ts` — `TenantInfo` 型 + 6 要素インターフェース + `ReportElement` ユニオン更新
- `src/store/index.ts` — `createTenantSlice` を合成
- `src/api/reportApi.ts` — `getTenantInfo` / `putTenantInfo` 追加
- `src/App.tsx` — 起動時に `fetchTenantInfo()` を呼ぶ
- `src/lib/elementFactories.ts` — 6 つの `createTenant*Element()` 追加
- `src/components/sidebar/paletteData.tsx` — 「テナント情報」カテゴリ追加
- `src/components/canvas/ElementRenderer.tsx` — 6 レンダラー追加
- `src/components/sidebar/PropertiesPanel.tsx` — 6 パネル追加
- `src/components/modals/DataBindingModal.tsx` — タブ追加

---

## Sources & References

### Origin

- **Brainstorm document:** [docs/brainstorms/2026-04-12-tenant-info-elements-brainstorm.md](../brainstorms/2026-04-12-tenant-info-elements-brainstorm.md)
  - 専用要素タイプ（pageNumber/currentDate パターン）
  - JsonBlobRepository でのバックエンド保存
  - ロゴはファイルアップロード（Base64）を最初から
  - 全ログインユーザーが編集可能

### Internal References

- PageNumber 要素（テンプレート）: `src/elements/pageNumber/Renderer.tsx`
- CurrentDate 要素（テンプレート）: `src/elements/currentDate/Renderer.tsx`
- Image 要素（ロゴ参照）: `src/elements/image/Renderer.tsx`
- isSafeImageSrc: `src/lib/exportUtils.ts:101`
- ElementFrame / TextContent ブロック: `src/elements/_blocks/renderers/`
- TextStyleSection パネル: `src/elements/_blocks/panels/TextStyleSection.tsx`
- DataBindingModal: `src/components/modals/DataBindingModal.tsx`（lines 10-18）
- paletteData: `src/components/sidebar/paletteData.tsx`
- ElementRenderer: `src/components/canvas/ElementRenderer.tsx`
- PropertiesPanel: `src/components/sidebar/PropertiesPanel.tsx`（lines 27-208）
- JsonBlobRepository パターン: `server/src/main/java/com/report/server/AppWiring.java`（lines 85-113）
- ApiRoutes V2: `server/src/main/java/com/report/server/ApiRoutes.java`（lines 187-226）
- apiFetch クライアント: `src/api/client.ts`, `src/api/reportApi.ts`
