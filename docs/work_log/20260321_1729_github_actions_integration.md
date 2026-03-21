# GitHub Actions 統合機能の追加

## 作業日時
2026/03/21 17:29

## 概要
commit-recap の設計意思決定レポート機能を GitHub Actions で週次自動実行し、Issue として投稿できるようにする機能を追加しました。

## 変更内容

### 新規作成ファイル

#### 1. `.github/workflows/design-catchup-reusable.yml`
- **目的**: 再利用可能な GitHub Actions ワークフロー
- **機能**:
  - 対象リポジトリの Git 履歴を取得
  - commit-recap ツールを checkout してビルド
  - 設計意思決定レポートを生成（`npm run design`）
  - 生成されたレポートを読み取り
  - GitHub Issue API を使って Issue を自動作成
- **入力パラメータ**:
  - `days`: 解析期間（デフォルト: 7日）
  - `issue_labels`: Issue に付与するラベル（デフォルト: 'design-review,weekly-report'）
- **必須 Secrets**:
  - `ANTHROPIC_API_KEY`: Anthropic API キー

#### 2. `.github/workflows/weekly-design-catchup.example.yml`
- **目的**: 呼び出し側リポジトリで使用する設定ファイルの例
- **機能**:
  - 週次スケジュール実行（毎週月曜日 09:00 UTC）
  - 手動実行にも対応（workflow_dispatch）
  - commit-recap の再利用可能ワークフローを呼び出し
- **使い方**: このファイルを `.github/workflows/weekly-design-catchup.yml` としてコピーして使用

#### 3. `docs/github-actions-integration.md`
- **目的**: GitHub Actions 統合機能の詳細ドキュメント
- **内容**:
  - セットアップ手順（Secrets 設定、ワークフローファイル配置）
  - カスタマイズ方法（スケジュール変更、対象期間変更、ラベル変更）
  - 手動実行の方法
  - トラブルシューティング
  - 参考リンク

#### 4. `docs/work_log/20260321_1729_github_actions_integration.md`
- **目的**: この作業の記録（本ファイル）

### 更新ファイル

#### `README.md`
- **変更箇所**: 「設計意思決定レポート（CTO向け）」セクション内
- **追加内容**: 「GitHub Actions での自動実行」サブセクション
  - 機能の概要説明
  - セットアップ手順の簡易版
  - 詳細ドキュメントへのリンク

## 使い方

### 外部リポジトリから利用する場合

1. **ANTHROPIC_API_KEY の設定**
   - リポジトリの Settings → Secrets and variables → Actions
   - `ANTHROPIC_API_KEY` を追加

2. **ワークフローファイルの配置**
   - `.github/workflows/weekly-design-catchup.yml` を作成
   - `weekly-design-catchup.example.yml` の内容をコピー
   - `<owner>/commit-recap` 部分を実際のリポジトリオーナー名に置き換え

3. **コミット・プッシュ**
   ```bash
   git add .github/workflows/weekly-design-catchup.yml
   git commit -m "feat: add weekly design catchup workflow"
   git push
   ```

4. **動作確認**
   - GitHub の Actions タブから手動実行して動作確認
   - または、次の月曜日まで待って自動実行を確認

### このリポジトリで設定ファイルを更新する場合

- `.github/workflows/design-catchup-reusable.yml` を編集
- 変更は自動的に呼び出し側のリポジトリに反映される（`@main` を参照しているため）

## 設計上のポイント

### 再利用可能ワークフロー (workflow_call) を採用

- **利点**:
  - 呼び出し側のリポジトリは最小限の設定のみ
  - commit-recap リポジトリでワークフローを一元管理
  - ワークフローの更新が全ての呼び出し側に自動反映

- **実装**:
  - `on: workflow_call` でトリガー定義
  - `secrets` と `inputs` でパラメータを受け取り
  - 呼び出し側は `uses: <owner>/<repo>/.github/workflows/<workflow>.yml@<ref>` で呼び出し

### リポジトリの checkout 戦略

1. **対象リポジトリの checkout**:
   ```yaml
   - uses: actions/checkout@v4
     with:
       fetch-depth: 0  # 全履歴を取得（設計レポート生成に必要）
   ```

2. **commit-recap ツールの checkout**:
   ```yaml
   - uses: actions/checkout@v4
     with:
       repository: ${{ github.repository_owner }}/commit-recap
       path: commit-recap-tool  # サブディレクトリに配置
   ```

### Issue 作成の実装

- `actions/github-script@v7` を使用
- Node.js の `fs` モジュールでレポートファイルを読み込み
- `github.rest.issues.create()` で Issue を作成
- Issue のタイトルに日付を含めて識別しやすくする

## 参考リンク

- [GitHub Actions: 再利用可能なワークフロー](https://docs.github.com/en/actions/using-workflows/reusing-workflows)
- [GitHub Actions: スケジュールイベント](https://docs.github.com/en/actions/using-workflows/events-that-trigger-workflows#schedule)
- [actions/github-script](https://github.com/actions/github-script)
