# commit-recap

**週次設計レビューを自動化するGitHub Actionsツール**

NestJSプロジェクトのリポジトリに設置することで、設計に影響する変更をドメイン別に整理したレポートを週次で自動生成し、Issueとして投稿します。CTOや設計レビュアーが設計意思決定をキャッチアップするために最適化されています。

## Weekly Design Catchup - GitHub Actions自動実行

設計意思決定レポートを GitHub Actions で週次自動生成し、Issue として投稿する機能です。

### やること

- **週1回の自動実行**でレポートを生成
- 生成されたレポートを自動的に **Issue として投稿**
- commit-recap リポジトリのワークフローを再利用（設定ファイルの更新に自動対応）
- **設計に影響する変更を自動抽出**: DB スキーマ、API エンドポイント、ドメインモデル等の重要な変更のみを対象
- **ドメイン別に整理**: 変更をドメイン/コンテキストごとに分類して表示
- **意思決定を4つの観点で整理**:
  - 確定したビジネスルール
  - データ構造の変化
  - 責務・境界の変化
  - 新たな概念・用語

### セットアップ方法

1. 対象リポジトリの Secrets に `ANTHROPIC_API_KEY` を設定
2. このリポジトリの `weekly-design-catchup.yml` を対象リポジトリの `.github/workflows/` にコピー
3. コピーしたファイル内の `schedule` の cron 式を必要に応じて書き換え（デフォルト: 毎週金曜日 JST 12:00）

詳細は [GitHub Actions 統合ガイド](./docs/github-actions-integration.md) を参照してください。

### 対象となる変更

以下のカテゴリに該当する変更が抽出されます:

- **DB スキーマ変更**: migration、schema定義、.prisma、.sqlファイル
- **API エンドポイント**: controller、route、api関連ファイル
- **ドメインモデル・エンティティ**: entity、domain、model関連ファイル
- **状態管理・データフロー**: store、state、redux、zustand等
- **外部サービス連携**: integration、external、service、client関連ファイル
- **リファクタリング**: 責務の再分割・抽象化を伴う変更

### 除外される変更

- ライブラリバージョン更新のみ
- テキスト・コピーの修正
- スタイル・フォーマットのみ
- CI/CDの軽微な調整
- テストファイルのみの変更

## ローカルでのCLI実行（開発・デバッグ用）

GitHub Actionsを使わず、ローカルでレポートを生成することも可能です。

### セットアップ

```bash
# 依存関係のインストール
npm install
```

### 基本的な使い方

1コマンドでデータ収集からレポート生成まで実行します:

```bash
# 環境変数の設定
export ANTHROPIC_API_KEY=sk-ant-...

# 開発モード（推奨）
npm run design -- <repo-path> -d 7

# ビルド後
design-catchup <repo-path> -d 7
```

**オプション**:
- `-d, --days <number>`: 期間（日数、デフォルト: 7）
- `-o, --output <path>`: 出力ファイルパス（デフォルト: ./reports/weekly-design-catchup-YYYYMMDD.md）
- `--save-data <path>`: 収集データをJSONとして保存（デバッグ用）
- `--api-key <key>`: Anthropic APIキー（環境変数より優先）
- `--verbose`: 詳細ログを表示

### 実行例

```bash
# 基本的な実行（カレントディレクトリを対象）
npm run design -- . -d 7

# 別のリポジトリを対象に実行
npm run design -- /path/to/another/repo -d 14

# 収集データも保存して確認したい場合
npm run design -- . -d 7 --save-data ./debug-data.json --verbose
```

### 2段階での実行（デバッグ用）

データ収集とレポート生成を別々に実行することも可能です:

**1. データ収集**
```bash
npm run design:collect <repo-path> -d 7 -o ./design-data.json
```

**2. レポート生成**
```bash
npm run design:generate ./design-data.json -o ./reports
```

**3. 別のリポジトリパスでレポート生成**
```bash
# 収集時とは別のリポジトリを参照してレポート生成
npm run design:generate ./design-data.json -r /path/to/another/repo -o ./reports
```

## 必須要件

- Node.js 18以上
- Git
- **Anthropic APIキー**: AI分析機能を使用する場合に必要（[Console](https://console.anthropic.com/)から取得）
- **GitHub CLI (gh)**: PR本文を取得してAI分析の精度を向上させるために推奨
  - インストール: `brew install gh` (macOS) / [GitHub CLI](https://cli.github.com/)
  - 認証: `gh auth login`

## 環境変数

| 変数名 | 説明 | 必須 |
|-------|------|------|
| `ANTHROPIC_API_KEY` | Anthropic APIキー（AI分析機能用） | オプション |

## 技術スタック

| パッケージ | 用途 |
|-----------|------|
| commander | CLIフレームワーク |
| simple-git | Git操作 |
| chalk | ターミナル色付け |
| ora | プログレススピナー |
| @anthropic-ai/sdk | Anthropic API（AI分析機能） |
| dotenv | 環境変数読み込み |
| tsup | ESMビルド |
| tsx | 開発時実行 |
