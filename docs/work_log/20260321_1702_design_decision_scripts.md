# 設計意思決定レポート生成スクリプトの作成

## 作業日時
2026/03/21 17:02

## 概要
CTOが設計上の意思決定をキャッチアップするためのレポートを生成するスクリプトを作成しました。
既存のコミット解析機能とは独立した新しいスクリプトとして、データ収集とレポート生成を分離した設計にしました。

## 変更内容

### 新規作成ファイル

1. **型定義**
   - `src/design-decisions/types.ts`
   - コミット変更、PR詳細、ドメイン変更、設計意思決定データの型を定義

2. **データ収集クラス**
   - `src/design-decisions/data-collector.ts`
   - Git履歴とPR情報を収集
   - 設計上の意思決定を含む変更をフィルタリング
   - 各変更をカテゴリ分類（DB スキーマ、API エンドポイント、ドメインモデル等）

3. **プロンプト定義**
   - `src/design-decisions/prompts.ts`
   - Claudeに送信するプロンプトを構築
   - 収集したデータを適切なフォーマットで整形

4. **レポート生成クラス**
   - `src/design-decisions/report-generator.ts`
   - Anthropic APIを使用してレポートを生成
   - 生成したレポートをMarkdownファイルとして保存

5. **CLIスクリプト**
   - `src/design-decisions/collect-cli.ts`: データ収集用CLI
   - `src/design-decisions/generate-cli.ts`: レポート生成用CLI

### 既存ファイルの修正

1. **tsup.config.ts**
   - 新しいCLIスクリプトをエントリポイントに追加

2. **package.json**
   - 新しいコマンドをbinに追加: `collect-design-data`, `generate-design-report`
   - npm scriptsに追加: `design:collect`, `design:generate`

3. **型定義の修正**
   - `src/types/index.ts`: `PRInfo`型をエクスポート
   - `src/git/pr-fetcher.ts`: `PRInfo`型に`createdAt`プロパティを追加
   - `src/analyzers/entity-evolution-analyzer.ts`: `timestamp`のnull/undefinedハンドリングを追加

## 使い方

### 基本的な使い方（推奨）

1コマンドでデータ収集からレポート生成まで実行します:

```bash
# 環境変数の設定
export ANTHROPIC_API_KEY=your-api-key

# 開発時（TypeScriptから直接実行）
npm run design -- <repo-path> -d 7

# ビルド後
design-catchup <repo-path> -d 7
```

オプション:
- `-d, --days <number>`: 期間（日数、デフォルト: 7）
- `-o, --output <path>`: 出力ファイルパス
- `--save-data <path>`: 収集データをJSONとして保存（デバッグ用）
- `--api-key <key>`: Anthropic APIキー（環境変数より優先）
- `--verbose`: 詳細ログを表示

### 2段階での実行（デバッグ用）

データ収集とレポート生成を別々に実行することも可能です:

#### 1. データ収集

```bash
npm run design:collect <repo-path> -d 7 -o ./design-data.json
```

#### 2. レポート生成

```bash
npm run design:generate ./design-data.json -o ./reports
```

**別のリポジトリパスでレポート生成:**
```bash
npm run design:generate ./design-data.json -r /path/to/another/repo -o ./reports
```

オプション:
- `-o, --output-dir <path>`: 出力ディレクトリ（デフォルト: ./reports）
- `-r, --repo-path <path>`: リポジトリパス（データファイルの値を上書き）
- `--api-key <key>`: Anthropic APIキー（環境変数より優先）

## 実行例

```bash
# 基本的な実行（カレントディレクトリを対象）
npm run design -- . -d 7

# 別のリポジトリを対象に実行
npm run design -- /path/to/repo -d 14

# 収集データも保存して確認したい場合
npm run design -- . -d 7 --save-data ./debug-data.json --verbose
```

生成されたレポートは`./reports/weekly-design-catchup-YYYYMMDD.md`に保存されます。

## 設計上の特徴

### データ収集とレポート生成の分離

処理を2つのスクリプトに分離することで、以下のメリットがあります:

1. **効率性**: データ収集は一度だけ実行し、レポート生成を複数回試行できる
2. **デバッグ性**: 収集したデータを確認・検証できる
3. **再利用性**: 収集したデータを他の用途にも使用できる

### 変更のフィルタリング

以下のカテゴリに該当する変更を対象として抽出します:

- **db-schema**: DB スキーマ変更（migration、schema定義）
- **api-endpoint**: API エンドポイントの新設・変更
- **domain-model**: ドメインモデル・エンティティの変更
- **state-management**: 状態管理・データフロー設計の変更
- **external-integration**: 外部サービス連携の設計
- **refactoring**: 責務の再分割・抽象化を伴うリファクタリング

以下の変更は除外されます:

- ライブラリバージョン更新のみ
- テキスト・コピーの修正
- スタイル・フォーマットのみ
- CI/CDの軽微な調整

## 追加変更（2026/03/21 17:30）

### 1コマンド実行対応

既存スクリプトと同様に、データ収集からレポート生成まで1つのコマンドで実行できるようにしました。

**新規作成ファイル:**
- `src/design-decisions/index.ts`: データ収集→AI分析を一括実行するCLIスクリプト

**更新ファイル:**
- `tsup.config.ts`: 新しいエントリポイントを追加
- `package.json`: `design-catchup` binコマンドと `design` npm scriptを追加
- `README.md`: 使い方を1コマンド実行を基本として更新

### リポジトリパス引数の追加

**型定義の拡張:**
- `src/design-decisions/types.ts`: `DesignDecisionData`に`repoPath`を追加

**データ収集の改善:**
- `src/design-decisions/data-collector.ts`: 収集時のリポジトリパスをデータに保存

**レポート生成の拡張:**
- `src/design-decisions/generate-cli.ts`: `-r, --repo-path`オプションを追加
- `src/design-decisions/report-generator.ts`: リポジトリパスを受け取るように拡張

これにより、以下のようなユースケースが可能になりました:
1. リポジトリAでデータ収集
2. 収集したデータを保存
3. レポート生成時にリポジトリBを参照（`-r`オプション）

## 参考リンク

- [Anthropic SDK Documentation](https://docs.anthropic.com/en/api/client-sdks)
- [GitHub CLI (gh) Documentation](https://cli.github.com/manual/)
