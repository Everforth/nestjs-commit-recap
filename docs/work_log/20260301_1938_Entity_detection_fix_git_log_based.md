# Entity検出問題の修正

**作業日時**: 2026-03-01 19:38

## 概要

`git diff` ベースから `git log` ベースのファイル検出に変更し、期間中に変更されたが最終的に差分がないファイルも検出できるようにした。また、ファイル移動の検出と表示を改善した。

## 問題の分析

### 根本原因

1. **`getDiffFiles` の実装方式**
   - 従来: `git diff oldestCommit^ HEAD` を使用
   - 問題: 期間中に変更されたが、最終的に差分がないファイルを検出できない
   - 例: ファイルが変更された後、別のコミットで元に戻された場合

2. **ファイル移動の除外**
   - 同じクラス名で追加と削除がある場合、両方を除外していた
   - 移動として認識して表示するべき

## 変更内容

### 1. `src/types/index.ts`
- `ChangeType` に `'moved'` を追加
- `EntityChange` に `oldFile?: string` を追加（移動元のパス）

### 2. `src/git/repository.ts`
- `getDiffFiles` メソッドを `git log --name-status` ベースに変更
- 期間中に触れられた全ファイルを検出
- リネーム情報（`renamed`）を戻り値に追加
- `fileExistsAt` ヘルパーメソッドを追加

### 3. `src/analyzers/entity-analyzer.ts`
- `renamed` ファイルの処理を追加
- 移動ファイルを `changeType: 'moved'` として検出
- `getFileContentAtPath` ヘルパーメソッドを追加

### 4. `src/reporters/markdown-reporter.ts`
- `filterEntityMoves` を修正: 移動を除外ではなく `'moved'` タイプに変換
- `getChangeSymbol` に `'moved'` 対応を追加（`→` シンボル）
- Entity サマリーで移動の表示に対応（移動元→移動先ディレクトリ）
- Entity 詳細で移動元パスを表示
- `getDirectory` ヘルパーメソッドを追加

## 追加修正

### 詳細セクションで変更なしの項目も表示

- Entity詳細: 変更されていないカラム/リレーションも表示（変更前後両方のセルに記載）
- Endpoint詳細: 変更されていないエンドポイントも表示
- Module詳細: 変更されていない項目も表示

## 期待される動作

```bash
node dist/index.js /path/to/repo --verbose

# 期待結果:
# - 期間中に変更されたが最終的に差分がないファイルも検出される
# - ファイル移動が「→」記号で表示される
# - Entity セクションに移動したファイルが表示される
# - 詳細セクションで変更なしの項目も表示される
```

## 検証方法

```bash
npm run build
node dist/index.js /Users/skawashima/works/nextream-api --verbose
```
