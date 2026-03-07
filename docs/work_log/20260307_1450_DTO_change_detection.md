# DTO変更検出機能の実装

## 作業日時
2026-03-07 14:50

## 概要
DTO（Data Transfer Object）の変更検出機能を実装しました。class-validatorのデコレータを持つクラスを検出し、プロパティの追加・削除・変更を追跡します。

## 変更内容

### 1. 型定義の追加
**ファイル**: `src/types/index.ts`

- `DTOProperty` インターフェース追加
  - `name`: プロパティ名
  - `type`: 型情報
  - `nullable`: nullable可否
  - `decorators`: デコレータ配列（例: `['IsString', 'MinLength(5)']`）
- `DTOChange` インターフェース追加
  - Entity同様の構造（file, oldFile, className, changeType, properties, relatedPRs）
- `AnalysisResult` に `dtos: DTOChange[]` を追加

### 2. ファイル分類の拡張
**ファイル**: `src/utils/file-classifier.ts`

- `FileType` に `'dto'` を追加
- `classifyFile()` に `*.dto.ts` の判定を追加

### 3. DTOアナライザーの実装
**ファイル**: `src/analyzers/dto-analyzer.ts` (新規作成)

**主な機能**:
- `BaseAnalyzer` を継承
- `EntityAnalyzer` と同様のパターンで実装
- class-validatorデコレータの検出
- ファイル移動（renamed）対応
- プロパティの変更追跡

**検出対象のデコレータ**:
```typescript
'IsString', 'IsNumber', 'IsBoolean', 'IsEmail', 'IsUrl',
'IsDate', 'IsArray', 'IsEnum', 'IsOptional', 'IsNotEmpty',
'MinLength', 'MaxLength', 'Min', 'Max', 'Matches',
'ValidateNested', 'Type', 'ArrayMinSize', 'ArrayMaxSize',
'IsInt', 'IsPositive', 'IsNegative', 'IsUUID', 'IsObject',
'IsNotEmptyObject', 'IsDefined', 'IsIn', 'IsNotIn',
'Length', 'ArrayNotEmpty', 'ArrayUnique'
```

**判定ロジック**:
- ファイル名が `*.dto.ts` であること
- クラスのプロパティにclass-validatorデコレータが存在すること

### 4. レポーター統合
**ファイル**: `src/reporters/markdown-reporter.ts`

**追加メソッド**:
- `filterDTOMoves()`: ファイル移動の統合処理
- `generateDTODetails()`: 詳細セクション生成
- `mergeProperties()`: before/afterプロパティの統合
- `getAddedProperties()`: 追加プロパティ取得
- `getDeletedProperties()`: 削除プロパティ取得
- `getModifiedProperties()`: 変更プロパティ取得

**レポート出力形式**:

サマリーセクション:
```markdown
### DTO
|   | 内容 |
|---|------|
| + | `CreateUserDto` |
| ~ | `UpdateUserDto` (+2 props: email, age, ~1 props: name) |
```

詳細セクション:
```markdown
## DTO の変更

### create-user.dto.ts

#### Properties
|   | Property | 型 | Decorators |
|---|----------|-----|-----------|
| + | email | string | IsEmail, IsNotEmpty |
| + | password | string | MinLength(6), IsString |
```

### 5. CLI統合
**ファイル**: `src/cli/commands.ts`

- `DTOAnalyzer` のインポート
- `runAnalysis()` 内でDTOアナライザーを実行
- `AnalysisResult` に `dtos` を追加
- サマリー表示に `DTO: ${dtos.length}` を追加

## 使い方

```bash
# DTO変更を含むレポート生成
npm run dev -- /path/to/nestjs-project -d 7 -o report.md

# 詳細ログ付き
npm run dev -- /path/to/nestjs-project -d 7 -o report.md --verbose
```

## 実装パターン

既存の `EntityAnalyzer` と同じパターンを採用:
1. ts-morphを使用したAST解析
2. デコレータベースの判定
3. ファイル移動の自動検出と統合
4. PR情報との紐付け
5. サマリー + 詳細の2段階レポート

## 検証

### ビルド確認
```bash
npm run build
# ✓ ビルド成功
```

### 想定される検出パターン
- DTO追加: 新規 `*.dto.ts` ファイルにclass-validatorデコレータ付きクラス
- DTO変更: 既存DTOのプロパティ追加・削除・型変更・デコレータ変更
- DTO移動: ファイルパス変更（内容変更も追跡）
- DTO削除: DTOファイル削除

## 今後の拡張予定

Phase 2とPhase 3で以下を実装予定:
- **Enum変更検出** (優先度: 低)
- **Interface変更検出** (優先度: 低)

## 参考リンク
- class-validator: https://github.com/typestack/class-validator
- ts-morph: https://ts-morph.com/
