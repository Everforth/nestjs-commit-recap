# commit-recap

NestJSプロジェクトの直近の構造変化をMarkdown形式でレポートするCLIツール。

## 概要

Gitリポジトリの差分を解析し、NestJSの構造的な変更（Entity、Module、Controller、Provider、Middleware類）を検出してレポートを生成します。

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

## 技術スタック

| パッケージ | 用途 |
|-----------|------|
| commander | CLIフレームワーク |
| simple-git | Git操作 |
| chalk | ターミナル色付け |
| ora | プログレススピナー |
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
