# Interface変更検出機能の実装

## 作業日時
2026-03-07 15:35

## 概要
DTOアナライザー、Enumアナライザーと同じパターンで、TypeScript Interfaceの変更検出機能を実装しました。
既存のPhase 1（DTO）、Phase 2（Enum）の実装を参考に、内容ベースでInterface変更を検出します。

## 変更内容

### 1. 型定義の追加
**ファイル**: `src/types/index.ts`

- `InterfaceProperty` インターフェースを追加
  - `name`: プロパティ名
  - `type`: 型
  - `optional`: オプショナルフラグ（?）
  - `readonly`: 読み取り専用フラグ

- `InterfaceChange` インターフェースを追加
  - `file`: ファイルパス
  - `oldFile`: 移動元パス（moved の場合）
  - `interfaceName`: Interface名
  - `changeType`: 変更タイプ（added/deleted/modified/moved）
  - `properties`: before/after のプロパティリスト
  - `extendsInterfaces`: before/after の継承情報
  - `relatedPRs`: 関連PR情報

- `AnalysisResult` に `interfaces: InterfaceChange[]` を追加

### 2. InterfaceAnalyzer の実装
**ファイル**: `src/analyzers/interface-analyzer.ts`（新規作成）

**実装方針**:
- すべての `.ts` ファイルを対象に解析（ファイル名に依存しない）
- ts-morph の `getInterfaces()` API を使用してInterfaceを抽出
- 1ファイルに複数Interfaceがある場合も個別に追跡
- `file + interfaceName` で一意に識別
- `extends` 句の変更も追跡

**主要メソッド**:
- `async analyze()`: added/deleted/modified/renamed ファイルを解析
- `extractInterfaces(content)`: ファイル内容からすべてのInterfaceを抽出（Map<interfaceName, InterfaceInfo>）
- `extractInterfaceProperties(iface)`: InterfaceDeclarationからプロパティを抽出
- `extractExtendsInterfaces(iface)`: InterfaceDeclarationから継承情報を抽出
- `normalizeType(rawType)`: 型文字列の正規化（import() ラッパー除去、リテラル型正規化、Union型ソート）

**特徴**:
- ファイル移動（renamed）の処理: Interface名でマッチングして `changeType: 'moved'` を設定
- 複数Interface対応: Map を使用して個別に追跡
- プロパティの optional/readonly モディファイアを正確に検出
- 継承（extends）の変更も検出

**エッジケース対応**:
- Index signatures: `getProperties()` には含まれないため、スキップ（仕様通り）
- Method signatures: 今回は対象外（将来的に対応可能）
- Generic interfaces: 型パラメータは追跡しない（シンプルに保つ）

### 3. markdown-reporter の拡張
**ファイル**: `src/reporters/markdown-reporter.ts`

**追加メソッド**:
- `filterInterfaceMoves()`: Interface名が同じ追加/削除を moved に統合
- `generateInterfaceDetails()`: 詳細セクション生成
- `mergeInterfaceProperties()`: before/after のプロパティをマージして変更タイプを判定
- `getAddedInterfaceProperties()`, `getDeletedInterfaceProperties()`, `getModifiedInterfaceProperties()`: ヘルパー

**出力フォーマット**:

サマリー:
```markdown
### Interface
|   | 内容 |
|---|------|
| + | `CreateUserRequest` |
| ~ | `UpdateUserRequest` (+2 props: email, age, ~1 props: name, +extends: BaseRequest) |
```

詳細:
```markdown
## Interface の変更

### create-user-request.interface.ts

#### Properties
|   | Property | 型 | Modifiers |
|---|----------|-----|-----------|
| + | email | string | optional |
| + | password | string | readonly |

#### Extends
|   | Interface |
|---|-----------|
| + | BaseRequest |
```

### 4. CLI統合
**ファイル**: `src/cli/commands.ts`

- `InterfaceAnalyzer` をインポート
- `runAnalysis()` 内で Interface 解析を実行（Enum解析の後）
- `AnalysisResult` に `interfaces` を追加
- サマリー表示に `Interface: ${interfaces.length}` を追加

## 使い方

```bash
# 7日間のInterface変更を検出
npm run dev -- . -d 7 -o report.md --verbose

# 特定のブランチで実行
npm run dev -- . -d 14 -b feature/interface-support -o report.md
```

## 検証方法

### テストケース
1. 新規Interfaceファイル追加
```typescript
export interface User {
  id: number;
  name: string;
  email?: string;
  readonly createdAt: Date;
}
```

2. 既存Interface変更（プロパティ追加、extends追加）
```typescript
export interface User extends BaseEntity {
  id: number;
  name: string;
  email?: string;
  age?: number;  // 追加
  readonly createdAt: Date;
}
```

3. ファイル移動＋内容変更
```bash
git mv src/interfaces/user.interface.ts src/common/interfaces/user.interface.ts
# + プロパティの追加/削除
```

### 確認項目
- ✅ Interfaceの追加/削除が検出されているか
- ✅ プロパティの追加/削除/型変更が検出されているか
- ✅ optional/readonlyモディファイアが正しく表示されているか
- ✅ extends句の変更が検出されているか
- ✅ 複数Interfaceがある場合も個別に追跡されているか
- ✅ ファイル移動が正しく検出されているか（`changeType: 'moved'`）

## 参考実装
- `src/analyzers/dto-analyzer.ts`: 内容ベース検出パターンの参考実装
- `src/analyzers/enum-analyzer.ts`: 複数要素の個別追跡パターンの参考実装
- `src/analyzers/base-analyzer.ts`: ts-morph を使ったAST解析のヘルパー

## 完了
これで計画されていた3つのPhaseすべてが完了しました：
- ✅ Phase 1: DTO変更検出
- ✅ Phase 2: Enum変更検出
- ✅ Phase 3: Interface変更検出

すべての機能が内容ベースで検出され、ファイル移動にも対応しています。
