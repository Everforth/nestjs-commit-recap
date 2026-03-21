# commit-recap

NestJSプロジェクトの直近の構造変化をMarkdown形式でレポートするCLIツール。

## 概要

Gitリポジトリの差分を解析し、NestJSの構造的な変更（Entity、Module、Controller、Provider、Middleware類）を検出してレポートを生成します。

## AI分析機能

Anthropic APIを使った2段階のAI分析機能により、変更レポートの自動解析が可能です。

### 機能

**実装意図ベースの変更サマリー生成**
- **PR本文を活用**: GitHub PRの本文（Description）から実装意図を抽出
- **機能単位でグループ化**: Entity、DTO、Controller、Serviceなどの関連変更を実装意図ごとにまとめて表示
- **高レベルなサマリー**: カラムやプロパティの詳細列挙を避け、機能レベルで変更内容を要約
- **影響範囲の明記**: 破壊的変更（DBマイグレーション、API変更等）がある場合は明記

**設計レビュー候補生成**
- 命名・概念の観点からの確認ポイント
- 構造・モデリングの観点からの確認ポイント
- エンドポイント設計の観点からの確認ポイント
- PR本文の実装意図に沿わない実装がないかを確認

#### 出力例

```markdown
## 【リファクタリング】connection モジュールの DTO・サービス整理

**関連PR**: [#128](https://github.com/.../pull/128)

**実装意図**:
SNS search DTO のネスト構造を解消し、パラメータを統一。
カスタムステータスサービスを分離して保守性を向上。

**変更内容**:
- **Entity**: CompanyInfluencerConnection から未使用カラムを削除
- **DTO**: connection DTO をフラット化、Create/Update DTOを分離
- **Controller**: stats/campaigns エンドポイントを influencer モジュールに移行
- **Service**: InfluencerConnectionCustomStatusesService を新規作成

**影響範囲**:
- フロントエンドでのリクエストボディ構造変更が必要
```

### 使い方

#### 1. 前提条件

**必須**:
- Anthropic APIキーの取得（[Console](https://console.anthropic.com/)から取得）
- GitHub CLIのインストールと認証（PR本文を取得するため）
  ```bash
  # gh CLIのインストール確認
  gh --version

  # 認証（未認証の場合）
  gh auth login
  ```

#### 2. 環境変数の設定

`.env` ファイルを作成して環境変数を設定:
```bash
# .env
ANTHROPIC_API_KEY=sk-ant-...
```

または、環境変数を直接設定:
```bash
export ANTHROPIC_API_KEY=sk-ant-...
```

#### 3. 実行

APIキーとgh CLIがあれば自動的にAI分析を実行します:
```bash
# 開発モード（推奨）
npm run dev -- /path/to/repo -o report.md

# ビルド後
npm run build
npm start -- /path/to/repo -o report.md
```

#### 4. 出力ファイル

- `report.md` - 構造的な変更レポート（詳細な差分）
- `report.ai.md` - AI分析レポート（実装意図ベースのサマリーと設計レビュー）

**注意**:
- APIキーが設定されていない場合、AI分析はスキップされ、`report.md`のみが生成されます
- gh CLIが認証されていない場合、PR情報（PR本文を含む）は取得されませんが、コードの変更から実装意図を推測してAI分析を実行します

## セットアップ

```bash
# 依存関係のインストール
npm install

# ビルド（本番使用時のみ必要）
npm run build
```

**注意**: 開発時は`npm run dev`で直接実行できるため、ビルドは不要です。

## 基本的な使い方

### 実行方法

#### 方法1: 開発モード（推奨、ビルド不要）
```bash
# tsxを使って直接実行（最も簡単）
npm run dev -- /path/to/nestjs-repo
```

#### 方法2: ビルド後に実行
```bash
# 1. ビルド
npm run build

# 2. 実行
npm start -- /path/to/nestjs-repo
# または
node dist/index.js /path/to/nestjs-repo
```

#### 方法3: グローバルインストール
```bash
# 1. インストール
npm install -g .

# 2. どこからでも実行可能
commit-recap /path/to/nestjs-repo
```

### オプション例

```bash
# ファイルに出力
npm run dev -- /path/to/nestjs-repo -o report.md

# 期間を指定（14日間）
npm run dev -- /path/to/nestjs-repo -d 14

# 詳細ログを表示
npm run dev -- /path/to/nestjs-repo --verbose

# すべてのオプションを組み合わせ
npm run dev -- /path/to/nestjs-repo -d 14 -o report.md --verbose
```

### 完全な実行例（AI分析機能付き）

```bash
# 環境変数を設定
export ANTHROPIC_API_KEY=sk-ant-...

# gh CLIの認証確認
gh auth status

# 実行（開発モード）
npm run dev -- ../my-nestjs-project -d 7 -o /tmp/report.md

# 出力:
# ✔ 解析完了
# レポートを出力しました: /tmp/report.md
# ✔ AI分析を出力しました: /tmp/report.ai.md
```

## CLI オプション

| オプション | 説明 | デフォルト |
|-----------|------|-----------|
| `-d, --days <number>` | 期間（日数） | 7 |
| `-o, --output <path>` | 出力ファイルパス | 標準出力 |
| `-b, --branch <name>` | 対象ブランチ | 現在のブランチ |
| `--no-pr` | PR情報をスキップ | PR情報を取得 |
| `--verbose` | 詳細ログ | false |

## 検出対象

### データモデル・設計
- **Entity**: `*.entity.ts`, `@Entity()`, `@Column()` など
- **Module**: `*.module.ts`, `@Module()` デコレータ
- **Endpoint**: `*.controller.ts`, HTTPメソッドデコレータ

### NestJSレイヤー構造
- **Provider**: `*.service.ts`, `*.repository.ts`, `@Injectable()`
- **Middleware**: `*.middleware.ts`, `NestMiddleware`
- **Guard**: `*.guard.ts`, `CanActivate`
- **Interceptor**: `*.interceptor.ts`, `NestInterceptor`
- **Pipe**: `*.pipe.ts`, `PipeTransform`
- **Filter**: `*.filter.ts`, `ExceptionFilter`

## 出力形式

### report.md（構造的な変更レポート）

Markdown形式で、変更をサマリーと詳細の2セクションで出力します。

- サマリー: 追加(+)、削除(-)、変更(~)を表形式で一覧表示
- 詳細: 各ファイルの変更内容を変更前/変更後の比較表で表示
- 関連PR: gh CLIが利用可能な場合、関連するPRへのリンクを表示

### report.ai.md（AI分析レポート）

AI分析により、以下の情報を含むレポートを生成します：

1. **実装意図ベースの変更サマリー**
   - PR本文から実装意図を抽出
   - 関連する全ての変更（Entity、DTO、Controller、Serviceなど）を機能単位でグループ化
   - 機能レベルでの変更内容サマリー
   - 影響範囲（破壊的変更など）

2. **設計レビュー候補**
   - 命名・概念の観点からの確認ポイント
   - 構造・モデリングの観点からの確認ポイント
   - エンドポイント設計の観点からの確認ポイント

**特徴**:
- カラムやプロパティの詳細列挙を避け、読みやすさを重視
- PR本文がない場合でも、コードの変更から実装意図を推測
- 同じPRに関連する変更は必ず同じグループにまとめて表示

## 必須要件

- Node.js 18以上
- Git

## 推奨要件（AI分析機能用）

- **Anthropic APIキー**: AI分析機能を使用する場合に必要
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

## ディレクトリ構造

```
commit-recap/
├── src/
│   ├── index.ts                    # CLIエントリーポイント
│   ├── cli/
│   │   └── commands.ts             # CLIコマンド定義
│   ├── git/
│   │   ├── repository.ts           # Git操作
│   │   └── pr-fetcher.ts           # PR情報取得
│   ├── analyzers/
│   │   ├── base-analyzer.ts        # 基底クラス
│   │   ├── entity-analyzer.ts      # Entity検出
│   │   ├── module-analyzer.ts      # Module検出
│   │   ├── controller-analyzer.ts  # Controller/Endpoint検出
│   │   ├── provider-analyzer.ts    # Service/Repository検出
│   │   └── middleware-analyzer.ts  # Middleware類検出
│   ├── ai/
│   │   ├── types.ts                # AI関連型定義
│   │   ├── prompts.ts              # プロンプトテンプレート
│   │   ├── anthropic-client.ts     # Anthropic APIクライアント
│   │   ├── ai-analyzer.ts          # AI分析オーケストレーター
│   │   └── ai-reporter.ts          # AI分析結果整形
│   ├── reporters/
│   │   └── markdown-reporter.ts    # Markdown生成
│   ├── types/
│   │   └── index.ts                # 型定義
│   └── utils/
│       └── file-classifier.ts      # ファイル分類
├── docs/
│   ├── work_log/                    # 機能追加・変更の作業記録
│   └── todos/                       # TODO管理
├── .env.example                     # 環境変数のサンプル
├── CLAUDE.md                        # Claude Code作業ガイドライン
├── package.json
├── tsconfig.json
└── tsup.config.ts
```
