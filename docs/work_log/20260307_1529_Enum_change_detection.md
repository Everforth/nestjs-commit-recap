# Enum変更検出機能の実装

## 作業日時
2026-03-07 15:29

## 概要
DTOアナライザーと同じパターンで、TypeScript Enumの変更検出機能を実装しました。
既存のPhase 1（DTO）の実装を参考に、内容ベースでEnum変更を検出します。

## 変更内容

### 1. 型定義の追加
**ファイル**: `src/types/index.ts`

- `EnumMember` インターフェースを追加
  - `name`: メンバー名
  - `value`: メンバーの値（string | number | undefined）
  - undefined は自動計算値を表す

- `EnumChange` インターフェースを追加
  - `file`: ファイルパス
  - `oldFile`: 移動元パス（moved の場合）
  - `enumName`: Enum名
  - `changeType`: 変更タイプ（added/deleted/modified/moved）
  - `members`: before/after のメンバーリスト
  - `relatedPRs`: 関連PR情報

- `AnalysisResult` に `enums: EnumChange[]` を追加

### 2. EnumAnalyzer の実装
**ファイル**: `src/analyzers/enum-analyzer.ts`（新規作成）

**実装方針**:
- すべての `.ts` ファイルを対象に解析（ファイル名に依存しない）
- ts-morph の `getEnums()` API を使用してEnumを抽出
- 1ファイルに複数Enumがある場合も個別に追跡
- `file + enumName` で一意に識別

**主要メソッド**:
- `async analyze()`: added/deleted/modified/renamed ファイルを解析
- `extractEnums(content)`: ファイル内容からすべてのEnumを抽出（Map<enumName, EnumMember[]>）
- `extractEnumMembers(enumDecl)`: EnumDeclarationからメンバーを抽出

**特徴**:
- ファイル移動（renamed）の処理: Enum名でマッチングして `changeType: 'moved'` を設定
- 複数Enum対応: Map を使用して個別に追跡
- 自動計算値のサポート: `getValue()` が undefined の場合も正しく処理

### 3. markdown-reporter の拡張
**ファイル**: `src/reporters/markdown-reporter.ts`

**追加メソッド**:
- `filterEnumMoves()`: Enum名が同じ追加/削除を moved に統合
- `generateEnumDetails()`: 詳細セクション生成
- `mergeEnumMembers()`: before/after のメンバーをマージして変更タイプを判定
- `formatEnumValue()`: Enum値を表示用にフォーマット（文字列/数値/auto）
- `getAddedMembers()`, `getDeletedMembers()`, `getModifiedMembers()`: ヘルパー

**出力フォーマット**:

サマリー:
```markdown
### Enum
|   | 内容 |
|---|------|
| + | `UserStatus` |
| ~ | `OrderStatus` (+2 members: CANCELLED, REFUNDED, ~1 members: PENDING) |
```

詳細:
```markdown
## Enum の変更

### user-status.enum.ts

#### Members
|   | Member | 値 |
|---|--------|-----|
| + | ACTIVE | "active" |
| + | INACTIVE | "inactive" |
```

### 4. CLI統合
**ファイル**: `src/cli/commands.ts`

- `EnumAnalyzer` をインポート
- `runAnalysis()` 内で Enum 解析を実行（DTO解析の後）
- `AnalysisResult` に `enums` を追加
- サマリー表示に `Enum: ${enums.length}` を追加

## 使い方

```bash
# 7日間のEnum変更を検出
npm run dev -- . -d 7 -o report.md --verbose

# 特定のブランチで実行
npm run dev -- . -d 14 -b feature/enum-support -o report.md
```

## 検証方法

### テストケース
1. 新規Enumファイル追加
```typescript
export enum Status {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
}
```

2. 既存Enum変更（メンバー追加）
```typescript
export enum Status {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  PENDING = 'pending',  // 追加
}
```

3. ファイル移動＋内容変更
```bash
git mv src/enums/status.enum.ts src/common/enums/status.enum.ts
# + メンバーの追加/削除
```

### 確認項目
- ✅ Enumの追加/削除が検出されているか
- ✅ メンバーの追加/削除/値変更が検出されているか
- ✅ 複数Enumがある場合も個別に追跡されているか
- ✅ ファイル移動が正しく検出されているか（`changeType: 'moved'`）
- ✅ 自動計算値（undefined）が正しく表示されているか

## 参考実装
- `src/analyzers/dto-analyzer.ts`: 内容ベース検出パターンの参考実装
- `src/analyzers/base-analyzer.ts`: ts-morph を使ったAST解析のヘルパー

## 次のステップ
Phase 3: Interface変更検出機能の実装
