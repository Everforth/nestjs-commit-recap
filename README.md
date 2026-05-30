# nest-recap

**Claude Code スラッシュコマンド + GitHub Actions で週次設計レビューを自動化するツール**

NestJS / TypeORM プロジェクトの直近の変更を解析し、設計に影響する変更をドメイン別に整理した Markdown レポートを生成します。CTO や設計レビュアーが設計意思決定をキャッチアップするために最適化されています。

実体は **1 つの Claude Code スラッシュコマンド** (`.claude/commands/nest-recap.md`) です。同じコマンドを以下の 2 通りで実行できます:

- **ローカル**: Claude Code から `/nest-recap --days 7` で実行
- **GitHub Actions**: 自己完結型ワークフロー (`weekly-nest-recap.yml`) を target repo に 1 ファイル配置するだけで週次自動実行

Node.js / npm / ts-morph などのランタイム依存は持ちません。エンティティ/DTO 解析を含むすべての処理を Claude が直接 Read / Bash / Grep で行います。

---

## GitHub Actions での自動実行（推奨）

設計意思決定レポートを週次で自動生成し、Issue として投稿します。

### セットアップ

1. **`ANTHROPIC_API_KEY` を Secrets に追加**
   - 対象リポジトリの **Settings → Secrets and variables → Actions**
   - **New repository secret** で `ANTHROPIC_API_KEY` を登録

2. **ワークフローファイルを配置**
   - 本リポジトリの [`weekly-nest-recap.yml`](./weekly-nest-recap.yml) を対象リポジトリの `.github/workflows/weekly-nest-recap.yml` にコピー（**この 1 ファイルのみ**）
   - 必要に応じて `cron` 式を書き換え（デフォルト: 毎週金曜日 JST 12:00）
   - コミット & プッシュで有効化

3. **手動実行（オプション）**
   - 対象リポジトリの **Actions** タブ → **Weekly nest-recap** → **Run workflow**

詳細は [GitHub Actions 統合ガイド](./docs/github-actions-integration.md) を参照してください。

### 仕組み

```
[target repo] schedule/dispatch → weekly-nest-recap.yml (自己完結)
                                   ├─ target repo を checkout
                                   ├─ nestjs-commit-recap から .claude/commands/nest-recap.md を sparse-checkout
                                   ├─ target repo の .claude/commands/ に配置
                                   ├─ anthropics/claude-code-action@v1 で /nest-recap を実行
                                   │   └─ Claude が git/gh/Read/Grep でデータ収集 → エンティティ差分抽出 → レポート生成
                                   └─ 生成された Markdown を Issue として投稿
```

ワークフローファイルには **`npm` ステップは一切登場しません**。再利用可能ワークフロー (`workflow_call`) は使わず、target repo に 1 ファイル丸ごとコピーする方式です。スラッシュコマンド (`nest-recap.md`) はワークフロー実行時に sparse-checkout で取得するため、target repo にコミットする必要はありません。

---

## ローカルでの実行

Claude Code をインストール済みの環境で、対象リポジトリのルートで以下を実行します。

### 初回セットアップ（プロジェクトごと 1 回）

```bash
# 対象リポジトリのルートで
mkdir -p .claude/commands
curl -fsSL https://raw.githubusercontent.com/Everforth/nestjs-commit-recap/main/.claude/commands/nest-recap.md \
  -o .claude/commands/nest-recap.md
```

または本リポジトリを clone してファイルをコピーしても構いません。

### 実行

```bash
# Claude Code を起動して
> /nest-recap --days 7
```

引数:

- `--days <n>`: 解析対象期間（日数）。デフォルト `7`
- `--output <path>`: 出力 Markdown のパス。デフォルト `reports/weekly-nest-recap-YYYYMMDD.md`

実行が完了すると `Report written to: <path>` が表示されます。

---

## 抽出対象

スラッシュコマンド (`.claude/commands/nest-recap.md`) は以下を抽出・整理します。

### 対象となる変更

- **DB スキーマ** (`*.entity.ts` の追加/削除/カラム・リレーション・インデックス・FK 変更)
- **API エンドポイント** (`*.controller.ts` のルート変更)
- **ドメインモデル** (`*.service.ts` / domain 層の責務移動)
- **状態管理・データフロー**
- **外部サービス連携**
- **設計を変えるリファクタリング**

### 除外される変更

- 依存パッケージのバージョン更新のみ
- フォーマット・lint 修正のみ
- テキスト・コピー修正のみ
- ファイル移動のみ（責務変更を伴わない）
- テストのみの変更
- DTO ファイル (`*.dto.ts`) はコンテキスト理解には使うが**レポート出力には含めない**

### レポート構成

エンティティ変更が**ある場合**は 3 セクション + 補足、**ない場合**は 2 セクション + 補足:

1. 責務・境界の変化
2. この設計が前提としていること
3. データ構造の変化（Entity 変更がある場合のみ）
4. その他補足（Nest.js ベストプラクティス違反などを含む）

---

## 必須要件

- **対象リポジトリ**: Git で管理されていること
- **CI 実行時**: `ANTHROPIC_API_KEY` Secret、`GITHUB_TOKEN`（GitHub Actions が自動付与）
- **ローカル実行時**: Claude Code, `git`, `gh` CLI（PR メタデータ取得のため）

Node.js / npm / TypeScript ツールチェーンは **不要** です。

---

## ドキュメント

- [GitHub Actions 統合ガイド](./docs/github-actions-integration.md)
- [作業記録 (`docs/work_log/`)](./docs/work_log/)
- [スラッシュコマンド本体 (`.claude/commands/nest-recap.md`)](./.claude/commands/nest-recap.md)

---

## ライセンス

社内利用想定。
