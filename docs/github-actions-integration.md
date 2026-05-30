# GitHub Actions 統合ガイド

このドキュメントでは、nest-recap の設計意思決定レポート機能を GitHub Actions で定期実行する方法を説明します。

target repo に `.github/workflows/weekly-nest-recap.yml` を**1 ファイル配置するだけ**で動作する自己完結型ワークフローです。`anthropics/claude-code-action@v1` が `/nest-recap` スラッシュコマンドを実行し、生成された Markdown を Issue として投稿します。

ワークフローファイルには **`npm` 関連のステップは一切登場しません**。再利用可能ワークフロー (`workflow_call`) のような caller / callee 分離も行わず、すべて 1 ファイルに収まっています。

## 特徴

- **週 1 回の自動実行**: スケジュール実行で毎週レポートを生成
- **Issue への自動投稿**: 生成されたレポートを自動的に Issue として作成
- **自己完結**: target repo に置く YAML は 1 つだけ。再利用可能ワークフローや外部リポジトリ依存の caller 設定は不要
- **スラッシュコマンドは実行時取得**: `.claude/commands/nest-recap.md` は本リポジトリから sparse-checkout で取得するため、target repo にコミットする必要なし
- **ランタイム依存ゼロ**: Node.js / npm / ts-morph を抱える必要なし。エンティティ/DTO 解析は Claude が直接行う

## セットアップ

### 1. `ANTHROPIC_API_KEY` の設定

対象リポジトリの Settings から Secrets を設定します:

1. GitHub リポジトリの **Settings** → **Secrets and variables** → **Actions** に移動
2. **New repository secret** をクリック
3. Name: `ANTHROPIC_API_KEY`
4. Value: `sk-ant-...` (Anthropic API キー)
5. **Add secret** をクリック

### 2. ワークフローファイルの配置

本リポジトリのルートにある [`weekly-nest-recap.yml`](../weekly-nest-recap.yml) を、target repo の `.github/workflows/weekly-nest-recap.yml` にコピーします。

```bash
# target repo のルートで
mkdir -p .github/workflows
curl -fsSL https://raw.githubusercontent.com/Everforth/nestjs-commit-recap/main/weekly-nest-recap.yml \
  -o .github/workflows/weekly-nest-recap.yml
```

**注意**: `cron` 式を必要に応じて書き換えてください（デフォルト: 毎週金曜日 JST 12:00）。

### 3. ワークフローの有効化

```bash
git add .github/workflows/weekly-nest-recap.yml
git commit -m "ci: add weekly nest-recap workflow"
git push
```

## 内部動作

`weekly-nest-recap.yml` の各ステップ:

1. **target repo を checkout** (`fetch-depth: 0` で履歴を全取得)
2. **本リポジトリから `.claude/commands/` を sparse-checkout** (`Everforth/nestjs-commit-recap@main`)
3. **`nest-recap.md` を target repo の `.claude/commands/` に配置**
4. **`anthropics/claude-code-action@v1` を実行**
   - `prompt: "/nest-recap --days <N> --output reports/weekly-nest-recap-YYYYMMDD.md"`
   - `claude_args: "--allowed-tools Bash,Read,Write,Grep,Glob --max-turns 60"`
5. **生成された Markdown を Issue として投稿** (`actions/github-script`)

Claude 側では以下が走ります:

- `git log` でコミット一覧、`gh pr list` でマージ済み PR、`git diff` で変更ファイル
- `*.entity.ts` を `Read` で読み、デコレータ（`@Column`, `@ManyToOne` 等）と引数を抽出
- 旧版は `git show <SINCE_COMMIT>:<path>` で取得して新旧比較
- 抽出結果をテンプレートに整形して `Write` ツールで出力

## カスタマイズ

ワークフローファイルは target repo にコピーされているので、必要な箇所を直接編集してください。

### 実行スケジュールの変更

```yaml
on:
  schedule:
    - cron: '0 15 * * 3'  # 毎週水曜日 JST 翌日 0:00
    - cron: '0 10 * * *'  # 毎日 JST 19:00
    - cron: '0 9 1-7 * 1' # 月の最初の月曜日
```

cron 式の読み方:
```
分 時 日 月 曜日
*  *  *  *  *
```

参考: [Crontab Guru](https://crontab.guru/)

### 対象期間の変更

`workflow_dispatch` の `inputs.days` のデフォルトを変更するか、手動実行時に値を指定:

```yaml
workflow_dispatch:
  inputs:
    days:
      default: 14  # 14 日間に変更
```

### Issue ラベルの変更

`workflow_dispatch` の `inputs.issue_labels` のデフォルトを変更するか、手動実行時に値を指定:

```yaml
workflow_dispatch:
  inputs:
    issue_labels:
      default: 'design-review,weekly,cto-report'
```

**注意**: ラベルは事前にリポジトリで作成しておく必要があります。

### スラッシュコマンドのバージョン固定

ワークフロー中の sparse-checkout の `ref:` を `main` から特定のタグ / SHA に変えると、`.claude/commands/nest-recap.md` のバージョンを固定できます。

```yaml
- name: Fetch nest-recap slash command
  uses: actions/checkout@v4
  with:
    repository: Everforth/nestjs-commit-recap
    ref: <タグ or SHA>  # ← 固定
```

## 手動実行

1. リポジトリの **Actions** タブに移動
2. 左サイドバーから **Weekly nest-recap** を選択
3. **Run workflow** ボタンをクリック
4. 必要に応じて対象期間（days）・Issue ラベルを入力
5. **Run workflow** をクリック

## トラブルシューティング

### ワークフローが実行されない

- **デフォルトブランチでワークフローファイルがコミットされていない** → main/master ブランチに置く
- **リポジトリが 60 日間プッシュなしで非アクティブ** → 何かコミットをプッシュするか手動実行で再開

### `ANTHROPIC_API_KEY` エラー

- Secrets が正しく設定されていない → Settings → Secrets and variables → Actions で確認

### `/nest-recap` が見つからないと言われる

- sparse-checkout または `cp` ステップが失敗している可能性
- Actions ログで「Install slash command into target repo」ステップの出力を確認
- 本リポジトリ (`Everforth/nestjs-commit-recap`) へのアクセス権限を確認

### レポート内容が空 / セクションが欠落

- 対象期間に設計関連の変更がない可能性
- `--days` を増やして再実行する、または `workflow_dispatch` の手動実行で確認

### Claude が途中で打ち切られる

- `claude_args` の `--max-turns 60` を増やす
- 対象期間が長すぎる場合は分割実行を検討

## 参考リンク

- [GitHub Actions ドキュメント](https://docs.github.com/en/actions)
- [スケジュールイベント](https://docs.github.com/en/actions/using-workflows/events-that-trigger-workflows#schedule)
- [actions/checkout の sparse-checkout](https://github.com/actions/checkout#scenarios)
- [anthropics/claude-code-action](https://github.com/anthropics/claude-code-action)
- [Claude Code スラッシュコマンドのドキュメント](https://docs.claude.com/en/docs/claude-code/slash-commands)
