# `npm run design` を Claude Code スラッシュコマンド + Action に移行

## 作業日時

2026-05-30 14:54 JST

## 概要

`npm run design` の Node.js + ts-morph + Anthropic SDK 実装を**全廃**し、単一の Claude Code スラッシュコマンド (`.claude/commands/nest-recap.md`) に置き換えた。GitHub Actions ワークフローは `anthropics/claude-code-action@v1` を呼び出す構成に書き換え、**呼び出し側に `npm` 関連ステップが一切出ない**ようにした。

あわせてプロジェクトの**表示名 + スラッシュコマンド名**を `commit-recap` / `design-catchup` → **`nest-recap` に一本化**:

- スラッシュコマンドファイル: `.claude/commands/design-catchup.md` → `.claude/commands/nest-recap.md`
- スラッシュコマンド名: `/design-catchup` → `/nest-recap`
- ワークフローファイル: `weekly-design-catchup.yml` → `weekly-nest-recap.yml`
- ワークフロー表示名: `Weekly Design Catchup` → `Weekly nest-recap`
- 出力レポート名: `weekly-design-catchup-YYYYMMDD.md` → `weekly-nest-recap-YYYYMMDD.md`
- README タイトル / 中間パス `.nest-recap-tool` / Issue フッター表記

**GitHub リポジトリ名 (`Everforth/nestjs-commit-recap`) はそのまま維持**するため、`uses:` / `repository:` / curl URL などのパス参照は変更していない。

さらに、当初は再利用可能ワークフロー (`workflow_call`) を用いた caller / callee 分離構成にしていたが、**target repo に 1 ファイル丸ごとコピーする自己完結型**へ統合した。旧 `.github/workflows/design-catchup-reusable.yml` は削除し、`weekly-nest-recap.yml` (リポジトリルートのテンプレート) にすべての step を取り込んだ。スラッシュコマンドは引き続き本リポジトリから sparse-checkout で取得するため、target repo にコミットする必要はない。

### 動機

- ts-morph 用に Node.js / npm / tsup / package-lock を抱え続けるコストを削減したい
- 同じ機能を **ローカルの Claude Code から `/nest-recap` で実行**できるようにしたい（多方面展開）
- ts-morph による Entity/DTO 解析の責務を Claude (Anthropic API) に移し、唯一の Single Source of Truth を `.claude/commands/nest-recap.md` に集約したい

### Before / After

**Before**: `npm ci` → `npm run build` → `tsx src/design-decisions/index.ts`
- ts-morph で `*.entity.ts` / `*.dto.ts` を AST 解析
- 抽出した構造化データを `prompts.ts` のテンプレートに埋め込み Anthropic SDK で送信

**After**: `anthropics/claude-code-action@v1` が `/nest-recap` を実行
- Claude が `git log` / `gh pr list` / `Read` / `Grep` でデータ収集
- 軽量パース（デコレータ + 引数読み取り）で Entity 差分を抽出
- 同じレポート構成テンプレートで Markdown 出力

## 変更内容

### 新規作成

- **`.claude/commands/nest-recap.md`** — スラッシュコマンド本体
  - frontmatter: `description` / `argument-hint: [--days <n>] [--output <path>]` / `allowed-tools: Bash, Read, Write, Grep, Glob`
  - 旧 `src/design-decisions/prompts.ts` (約 280 行) のレポートテンプレート・文体ガイド・データ構造の変化テーブル・PR リンク規則・Nest.js ベストプラクティス違反項目を**全て移植**
  - 旧 `src/analyzers/entity-analyzer.ts` / `dto-analyzer.ts` のデコレータ一覧 (`@Column`, `@PrimaryGeneratedColumn`, `@ManyToOne` 等) と抽出ルール (nullable 判定、`relationType`, FK の `onDelete`/`onUpdate` 等) を Claude 向け指示文に展開
  - 旧 `src/utils/file-classifier.ts` のサフィックス分類表を表形式で記載
- **`docs/work_log/20260530_1454_design-catchup-claude-code-migration.md`** — 本作業記録

### 書き換え

- **`weekly-nest-recap.yml`** (リポジトリルート、target repo にコピーされるテンプレート) を**自己完結型**に変更
  - 旧: target repo から本リポジトリの再利用可能ワークフロー (`design-catchup-reusable.yml`) を `workflow_call` で呼ぶ二段構成
  - 新: 1 ファイルにすべての step を取り込み、target repo にコピーされた後は外部ワークフロー依存なしで動く
  - 旧 reusable 側の step（`actions/checkout`、本リポジトリの sparse-checkout、`anthropics/claude-code-action@v1`、`actions/github-script` での Issue 化）をそのまま統合
  - `claude_args: "--allowed-tools Bash,Read,Write,Grep,Glob --max-turns 60"` を指定

- **`README.md`**
  - 「Node.js / npm が必要」の記述を一掃
  - ローカル実行手順を「Claude Code に `.claude/commands/nest-recap.md` を配置 → `/nest-recap --days 7`」に書き換え
  - GitHub Actions セクションを再利用可能ワークフロー呼び出しの方法に統一
  - 技術スタック表を削除

- **`docs/github-actions-integration.md`**
  - 「内部動作」セクションを新設し、claude-code-action 経由のフローを明記
  - トラブルシューティングに「スラッシュコマンドが見つからない」「Claude が打ち切られた」項目を追加
  - 参考リンクに `anthropics/claude-code-action` と Claude Code スラッシュコマンド公式 docs を追加

### 削除（`git rm`）

- `src/` 全体（`ai/`, `analyzers/`, `design-decisions/`, `git/`, `types/`, `utils/`）
- `package.json`, `package-lock.json`
- `tsconfig.json`, `tsup.config.ts`
- `biome.json`
- `.github/workflows/nest-recap-reusable.yml` — 自己完結型に統合したため不要

### 削除（作業ツリー）

- `dist/`, `node_modules/`

### 残置

- `weekly-nest-recap.yml` — ルート直下の **target repo 用テンプレート**。自己完結型に書き換え済み（旧 reusable workflow の中身を取り込み）。
- `commit-recap-ai.md` — gitignored の手元アーティファクト。touch せず。
- `reports/*.md` — gitignored の過去レポート。差分比較用に残置。

## 使い方

### ローカル

```bash
# 対象リポジトリのルートで
mkdir -p .claude/commands
curl -fsSL https://raw.githubusercontent.com/Everforth/nestjs-commit-recap/main/.claude/commands/nest-recap.md \
  -o .claude/commands/nest-recap.md

# Claude Code を起動
claude
> /nest-recap --days 7
```

### GitHub Actions

1. target repo の Secrets に `ANTHROPIC_API_KEY` を登録
2. 本リポジトリの `weekly-nest-recap.yml` を target repo の `.github/workflows/weekly-nest-recap.yml` に**この 1 ファイルだけ**コピー
3. 必要なら `cron` を調整して push
   ```bash
   mkdir -p .github/workflows
   curl -fsSL https://raw.githubusercontent.com/Everforth/nestjs-commit-recap/main/weekly-nest-recap.yml \
     -o .github/workflows/weekly-nest-recap.yml
   ```

## 検証 TODO

実装は完了。以下を別途行う:

1. **ローカル動作確認**: 任意の Nest.js リポジトリで `.claude/commands/nest-recap.md` を配置し `/nest-recap --days 7` を実行、旧 `reports/weekly-nest-recap-20260502.md` などと章立て・データ構造テーブルを目視比較
2. **CI 動作確認**: テスト用リポジトリで `workflow_dispatch` 実行し、生成 Issue が期待形式か確認
3. **エンティティ抽出精度の差分確認**: カラム追加/削除、インデックス unique、FK の onDelete/onUpdate が漏れなく拾えているか、旧 ts-morph 出力と比較
4. **長期間レポート**: `--days 30` で出力が破綻しないか、`--max-turns 60` で足りるかを観察

## 参考リンク

- [anthropics/claude-code-action](https://github.com/anthropics/claude-code-action) — v1.0 の `prompt` / `claude_args` 入力仕様を確認
- [Claude Code Slash Commands](https://docs.claude.com/en/docs/claude-code/slash-commands) — `.claude/commands/` の auto-discovery 仕様
- 旧実装の最終状態: コミット `4023772` (refactor/keep-only-design-catchup マージ前)
