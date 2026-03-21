# GitHub Actions 統合ガイド

このドキュメントでは、commit-recap の設計意思決定レポート機能を GitHub Actions で定期実行する方法を説明します。

## 概要

週次で自動的に設計意思決定レポートを生成し、GitHub Issue として投稿する GitHub Actions ワークフローを提供しています。

## 特徴

- **週1回の自動実行**: スケジュール実行で毎週レポートを生成
- **Issue への自動投稿**: 生成されたレポートを自動的に Issue として作成
- **再利用可能**: commit-recap リポジトリで管理されたワークフローを外部から呼び出すだけ
- **設定ファイルの更新に自動対応**: commit-recap リポジトリでワークフローが更新されても、呼び出し側は自動的に最新版を使用

## セットアップ

### 1. ANTHROPIC_API_KEY の設定

リポジトリの Settings から Secrets を設定します:

1. GitHub リポジトリの **Settings** → **Secrets and variables** → **Actions** に移動
2. **New repository secret** をクリック
3. Name: `ANTHROPIC_API_KEY`
4. Value: `sk-ant-...` (Anthropic API キー)
5. **Add secret** をクリック

### 2. ワークフローファイルの配置

`.github/workflows/weekly-design-catchup.yml` を作成し、以下の内容を記述します:

```yaml
name: Weekly Design Catchup

on:
  # 毎週月曜日の午前9時（JST 18時）に実行
  schedule:
    - cron: '0 9 * * 1'  # UTC時刻で指定

  # 手動実行も可能
  workflow_dispatch:
    inputs:
      days:
        description: 'Number of days to analyze'
        required: false
        default: '7'

jobs:
  weekly-report:
    # commit-recap リポジトリの再利用可能なワークフローを呼び出し
    uses: Everforth/commit-recap/.github/workflows/design-catchup-reusable.yml@main
    secrets:
      ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
    with:
      days: ${{ github.event.inputs.days || 7 }}
      issue_labels: 'design-review,weekly-report,automated'
```

**注意**: `Everforth/commit-recap` の部分は、実際の commit-recap リポジトリのオーナー名とリポジトリ名に置き換えてください。

### 3. ワークフローの有効化

ワークフローファイルをコミット・プッシュすると、自動的に有効化されます。

```bash
git add .github/workflows/weekly-design-catchup.yml
git commit -m "feat: add weekly design catchup workflow"
git push
```

## カスタマイズ

### 実行スケジュールの変更

`cron` 式を変更することで、実行タイミングをカスタマイズできます:

```yaml
schedule:
  # 毎週水曜日の午後3時（JST 翌日0時）
  - cron: '0 15 * * 3'

  # 毎日午前10時
  - cron: '0 10 * * *'

  # 月の最初の月曜日
  - cron: '0 9 1-7 * 1'
```

**cron 式の読み方**:
```
分 時 日 月 曜日
*  *  *  *  *
```

参考: [Crontab Guru](https://crontab.guru/)

### 対象期間の変更

デフォルトは7日間ですが、変更可能です:

```yaml
with:
  days: 14  # 14日間に変更
```

### Issue ラベルの変更

Issue に付与するラベルをカスタマイズできます:

```yaml
with:
  issue_labels: 'design-review,weekly,cto-report'
```

**注意**: ラベルは事前にリポジトリで作成しておく必要があります。

## 手動実行

GitHub の Actions タブから手動でワークフローを実行できます:

1. リポジトリの **Actions** タブに移動
2. 左サイドバーから **Weekly Design Catchup** を選択
3. **Run workflow** ボタンをクリック
4. 必要に応じて対象期間（days）を入力
5. **Run workflow** をクリック

## トラブルシューティング

### ワークフローが実行されない

- **原因1**: デフォルトブランチでワークフローファイルがコミットされていない
  - **解決**: main/master ブランチにワークフローファイルがあることを確認
- **原因2**: リポジトリが非アクティブ（60日間プッシュがない）
  - **解決**: 何かコミットをプッシュするか、手動実行で再開

### ANTHROPIC_API_KEY エラー

- **原因**: Secrets が正しく設定されていない
- **解決**: Settings → Secrets and variables → Actions で `ANTHROPIC_API_KEY` を確認

### レポート生成エラー

- **原因**: 対象期間にコミットがない、または設計関連の変更がない
- **解決**: ワークフローのログを確認し、`--verbose` オプションで詳細を確認

## 参考リンク

- [GitHub Actions ドキュメント](https://docs.github.com/en/actions)
- [再利用可能なワークフロー](https://docs.github.com/en/actions/using-workflows/reusing-workflows)
- [スケジュールイベント](https://docs.github.com/en/actions/using-workflows/events-that-trigger-workflows#schedule)
