# commit-recap

NestJSプロジェクトの直近の構造変化をMarkdown形式でレポートするCLIツール。

## 概要

Gitリポジトリの差分を解析し、NestJSの構造的な変更（Entity、Module、Controller、Provider、Middleware類）を検出してレポートを生成します。

## AI分析機能

Anthropic APIを使った2段階のAI分析機能により、変更レポートの自動解析が可能です。

### 機能

**変更サマリー生成**
- 関連する変更をグループ化し、変更クラスタ単位で整理
- 変更の意図と影響範囲を自然言語で説明
- 破壊的変更（DBマイグレーション、API変更等）を明記

**設計レビュー候補生成**
- 命名・概念の観点からの確認ポイント
- 構造・モデリングの観点からの確認ポイント
- エンドポイント設計の観点からの確認ポイント

### 使い方

1. `.env` ファイルを作成して環境変数を設定:
   ```bash
   # .env
   ANTHROPIC_API_KEY=sk-ant-...
   ```

   または、環境変数を直接設定:
   ```bash
   export ANTHROPIC_API_KEY=sk-ant-...
   ```

2. 通常通り実行（APIキーがあれば自動的にAI分析を実行）:
   ```bash
   npm run dev -- /path/to/repo -o report.md
   ```

3. 出力ファイル:
   - `report.md` - 従来の変更レポート
   - `report.ai.md` - AI分析レポート

**注意**: APIキーが設定されていない場合、AI分析はスキップされ、従来のレポートのみが生成されます。

## インストール

```bash
npm install
npm run build
```

## 使い方

```bash
# 開発モードで実行
npm run dev -- /path/to/nestjs-repo

# ビルド済みで実行
node dist/index.js /path/to/nestjs-repo

# オプション指定
npm run dev -- /path/to/nestjs-repo -d 14 -o report.md --verbose
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

Markdown形式で、変更をサマリーと詳細の2セクションで出力します。

- サマリー: 追加(+)、削除(-)、変更(~)を表形式で一覧表示
- 詳細: 各ファイルの変更内容を変更前/変更後の比較表で表示
- 関連PR: gh CLIが利用可能な場合、関連するPRへのリンクを表示

## 必須要件

- Node.js 18以上
- Git
- gh CLI（PR情報取得、オプション）

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
│   └── work_log/
├── package.json
├── tsconfig.json
└── tsup.config.ts
```
