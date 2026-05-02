# design-catchup 以外のコード削除

## 作業日時
2026-05-02 15:40

## 概要
本リポジトリは元々 `commit-recap`（NestJS 構造変化の網羅レポート）と `design-catchup`（設計意思決定キャッチアップレポート）の 2 つの CLI を提供していた。実運用は GitHub Actions による週次の `design-catchup` のみとなったため、`commit-recap` 側の CLI / analyzer / reporter とそれにのみ使われる型定義・bin/scripts を整理し、`design-catchup`（および 2 段階デバッグ用 `collect-design-data` / `generate-design-report`）が必要とするコードのみを残した。

## 変更内容

### 削除したファイル（17 件）
- `src/index.ts` — commit-recap 本体エントリ
- `src/cli/commands.ts`（およびディレクトリ）
- `src/ai/ai-analyzer.ts`、`ai-reporter.ts`、`prompts.ts`、`weekly-prompts.ts`
- `src/analyzers/{controller,enum,entity-evolution,feature-group,interface,middleware,module,provider}-analyzer.ts`
- `src/reporters/markdown-reporter.ts`、`weekly-reporter.ts`（およびディレクトリ）
- `src/types/weekly-analysis.ts`

### 編集したファイル
- `src/types/index.ts`: design-catchup が使用する型のみ（`PRInfo` 再エクスポート、`ChangeType`、Entity 系 5 型、DTO 系 2 型、`AnalyzerOptions`）に縮減。Enum/Interface/Endpoint/Controller/Module/Provider/Middleware/AnalysisResult 系を削除し、`weekly-analysis.js` の re-export も除去。
- `src/ai/types.ts`: `AIAnalysisOptions` のみ残し、`ChangeSummary`/`DesignReview`/`AIAnalysisResult`/`AIReporterOptions` を削除。
- `src/utils/file-classifier.ts`: 削除した analyzer のみが使っていた `isNestJSFile`/`isProviderFile`/`isMiddlewareTypeFile`/`fileTypeToMiddlewareType` および `MiddlewareType` の import を削除。`classifyFile` と `FileType` 型のみ維持。
- `package.json`:
  - `bin: commit-recap` を削除。`design-catchup` / `collect-design-data` / `generate-design-report` は維持。
  - tsup の出力フラット化に合わせて bin パスを `./dist/index.js` 等に修正（`src/index.ts` を削った結果、共通プレフィックスが `src/design-decisions/` まで縮み、出力が dist 直下へ）。
  - `scripts: dev`、`start` を削除。
  - `main: ./dist/index.js` を削除（CLI ツールのため不要）。
  - `description` を「設計意思決定の週次キャッチアップレポートを生成するCLIツール」に更新。
  - `keywords` を `design`/`ai`/`weekly-report`/`nestjs` に整理。
- `tsup.config.ts`: `entry` から `src/index.ts` を削除。
- `src/design-decisions/{index,collect-cli,generate-cli}.ts`: ソース冒頭の `#!/usr/bin/env node` を削除。tsup の banner 設定で shebang が付与されるため、ソース側に残しておくとビルド成果物で shebang が二重になり Node.js が `SyntaxError` で起動できなくなる既存問題があった（`tsx` 経由の起動では顕在化していなかった）。

### 検証
- `npm run build` 成功（dist/index.js, dist/collect-cli.js, dist/generate-cli.js 出力）
- `node dist/index.js --help` 起動 OK（shebang 二重問題が解消したことを確認）
- `npm run design -- ../nextream-api -d 7 --skip-diffs --verbose` でエンドツーエンドのレポート生成成功
  - コミット 32 件・PR 8 件・対象変更 7 件を収集
  - `reports/weekly-design-catchup-20260502.md` に 4 ドメイン分のレポートが出力された
- `npm run typecheck` には既存の警告 2 件（`src/design-decisions/data-collector.ts:55` と `:74`）があるが、本変更前から存在しており本タスクのスコープ外。

## 残したコード
- `design-catchup` 経路で参照される `src/{ai/anthropic-client.ts, ai/types.ts}`、`src/git/{repository,pr-fetcher}.ts`、`src/analyzers/{base,entity,dto}-analyzer.ts`、`src/utils/file-classifier.ts`、`src/types/index.ts`、`src/design-decisions/*.ts` は維持。
- 依存パッケージ（`@anthropic-ai/sdk`、`chalk`、`commander`、`dotenv`、`ora`、`simple-git`、`ts-morph`）はすべて design-catchup 系で使用されるため変更なし。
