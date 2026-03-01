# commit-recap 初期実装

## 作業日時
2026-03-01

## 概要
NestJSプロジェクトの構造変化をレポートするCLIツール「commit-recap」を新規実装した。

## 変更内容

### 新規作成ファイル

| ファイル | 概要 |
|----------|------|
| `package.json` | プロジェクト設定、ESM、bin設定 |
| `tsconfig.json` | TypeScript設定 |
| `tsup.config.ts` | ビルド設定 |
| `src/index.ts` | CLIエントリーポイント |
| `src/cli/commands.ts` | CLIコマンド定義（commander使用） |
| `src/git/repository.ts` | Git操作（simple-git使用） |
| `src/git/pr-fetcher.ts` | PR情報取得（gh CLI使用） |
| `src/types/index.ts` | 型定義 |
| `src/utils/file-classifier.ts` | NestJSファイル分類ユーティリティ |
| `src/analyzers/base-analyzer.ts` | アナライザー基底クラス |
| `src/analyzers/entity-analyzer.ts` | Entity検出 |
| `src/analyzers/module-analyzer.ts` | Module検出 |
| `src/analyzers/controller-analyzer.ts` | Controller/Endpoint検出 |
| `src/analyzers/provider-analyzer.ts` | Service/Repository検出 |
| `src/analyzers/middleware-analyzer.ts` | Middleware/Guard/Interceptor/Pipe/Filter検出 |
| `src/reporters/markdown-reporter.ts` | Markdown形式レポート生成 |
| `README.md` | プロジェクトドキュメント |

### 実装機能

1. **Git操作**
   - 指定期間のコミット履歴取得
   - 変更ファイル一覧取得（追加/削除/変更の分類）
   - 任意リビジョンでのファイル内容取得

2. **PR情報取得**
   - gh CLIを使用したマージ済みPR取得
   - ファイルとPRの関連付け
   - gh CLIがない環境ではグレースフルにスキップ

3. **NestJS構造解析**
   - Entity: `@Entity()`, `@Column()` デコレータ検出、カラム一覧抽出
   - Module: `@Module()` デコレータ検出、imports/providers/exports/controllers抽出
   - Controller: `@Controller()` 検出、HTTPエンドポイント抽出
   - Provider: `@Injectable()` 検出、Service/Repository分類
   - Middleware類: Guard, Interceptor, Pipe, Filter検出

4. **レポート生成**
   - サマリーセクション: 変更を一覧表示
   - 詳細セクション: 変更前/変更後の比較表
   - 関連PRリンク

5. **CLI**
   - 期間指定（-d, --days）
   - 出力ファイル指定（-o, --output）
   - ブランチ指定（-b, --branch）
   - PR情報スキップ（--no-pr）
   - 詳細ログ（--verbose）

## 技術スタック

- commander: CLIフレームワーク
- simple-git: Git操作
- chalk: ターミナル色付け
- ora: プログレススピナー
- tsup: ESMビルド
- tsx: 開発時実行

## 使い方

```bash
# 開発モード
npm run dev -- /path/to/nestjs-repo -d 7 -o report.md

# ビルド後
npm run build
node dist/index.js /path/to/nestjs-repo
```

## 追加修正

### バグ修正・改善

1. **ファイル移動の検出**
   - 同じクラス名で追加と削除が両方ある場合、ファイル移動として検出し重複を除外

2. **削除のみの項目を詳細から除外**
   - Entity、Controller、Module、Provider、Middleware の詳細セクションで削除のみの項目は表示しない
   - サマリーでも削除のみの項目は除外

3. **パス抽出の修正**
   - 複数行にわたる `@Controller()` デコレータに対応
   - `:publicId` などのパスパラメータを含むフルパスを正しく表示
   - `ApiQuery` などのデコレータがメソッド名として誤検出される問題を修正

4. **Entity カラム抽出の改善**
   - 複数デコレータが連続する場合の誤検出を修正
   - 行単位での解析に変更し、より正確なカラム抽出を実現

5. **Module サマリーの改善**
   - 「変更あり」ではなく具体的な変更内容（+providers: xxx など）を表示
   - 変更がないモジュールは除外

## 備考

- gh CLIがない環境でも動作するよう、PR情報取得はオプショナルに実装
- gitコマンドが存在しない場合はエラーメッセージを表示して終了
