# Weekly Design Catchup ワークフロー修正

## 作業日時
2026-03-22 15:15

## 概要
acetokyo-com/nextream-api から weekly-design-catchup ワークフローを実行した際に発生していた以下の問題を修正:
1. PR数が0になる問題
2. GitHub Script ステップで "not found error" が発生する問題

## 問題の詳細

### 1. PR数が0になる問題

**原因**:
- GitHub CLI (`gh`) コマンドが PR 情報を取得する際に、認証トークン（`GITHUB_TOKEN` または `GH_TOKEN`）が設定されていなかった
- エラーが silent failure で隠されており、ログに表示されずに空配列が返されていた

**影響**:
- PR 情報が取得できず、"PR数: 0" となる
- 設計意思決定の重要な情報源である PR の詳細が分析から欠落する

### 2. not found error の問題

**原因**:
- レポート生成ステップ: `working-directory: commit-recap-tool` で実行
  - `../reports/` = `/home/runner/work/nextream-api/nextream-api/reports/`
- GitHub Script ステップ: working-directory 未設定
  - `../reports/` = `/home/runner/work/nextream-api/reports/` (存在しない場所)
- 相対パス (`../reports/`) が working-directory の違いにより異なる場所を指していた

**影響**:
- レポートは正常に生成されるが、Issue 作成時にファイルが見つからずエラーになる
- ワークフローが失敗し、Issue が作成されない

## 変更内容

### ファイル: `.github/workflows/design-catchup-reusable.yml`

#### 変更1: GitHub Token の環境変数設定 (Line 68-75)

**Before**:
```yaml
- name: Generate design catchup report
  id: generate
  working-directory: commit-recap-tool
  env:
    ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
```

**After**:
```yaml
- name: Generate design catchup report
  id: generate
  working-directory: commit-recap-tool
  env:
    ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
    GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

**理由**: GitHub CLI が PR 情報を取得する際に必要な認証トークンを設定。`GITHUB_TOKEN` と `GH_TOKEN` の両方を設定することで互換性を確保。

#### 変更2: 絶対パスの使用 (Line 76-79)

**Before**:
```yaml
run: |
  REPORT_DATE=$(date +%Y%m%d)
  OUTPUT_PATH="../reports/weekly-design-catchup-${REPORT_DATE}.md"

  # レポート生成
  npm run design -- .. -d ${{ inputs.days }} -o "${OUTPUT_PATH}" --verbose
```

**After**:
```yaml
run: |
  REPORT_DATE=$(date +%Y%m%d)
  OUTPUT_PATH="${GITHUB_WORKSPACE}/reports/weekly-design-catchup-${REPORT_DATE}.md"

  # reports ディレクトリを作成
  mkdir -p "${GITHUB_WORKSPACE}/reports"

  # レポート生成
  npm run design -- .. -d ${{ inputs.days }} -o "${OUTPUT_PATH}" --verbose
```

**理由**: `$GITHUB_WORKSPACE` を使用した絶対パスにより、working-directory に依存しない一貫したパスを実現。ディレクトリの事前作成も追加。

### ファイル: `src/design-decisions/data-collector.ts`

#### 変更3: PR取得失敗時のエラーログ追加 (Line 158-160)

**Before**:
```typescript
} catch {
  return [];
}
```

**After**:
```typescript
} catch (error) {
  console.error('Failed to fetch PRs:', error);
  return [];
}
```

#### 変更4: PR差分取得失敗時のエラーログ追加 (Line 199-206)

**Before**:
```typescript
} catch {
  // API呼び出しに失敗した場合は差分なしで返す
  return files.map((file) => ({
    path: file.path,
    additions: file.additions,
    deletions: file.deletions,
    diff: "",
  }));
}
```

**After**:
```typescript
} catch (error) {
  // API呼び出しに失敗した場合は差分なしで返す
  console.error(`Failed to fetch file diffs for PR #${prNumber}:`, error);
  return files.map((file) => ({
    path: file.path,
    additions: file.additions,
    deletions: file.deletions,
    diff: "",
  }));
}
```

**理由**: エラーが発生した場合にログを出力し、デバッグを容易にする。

## 検証方法

### 1. ローカルでの確認
```bash
# GitHub Token を設定してローカル実行
export GITHUB_TOKEN=your_token_here
export GH_TOKEN=your_token_here

# nextream-api リポジトリで実行
cd path/to/nextream-api
npm run design -- . -d 7 --verbose
```

期待される結果:
- PR 数が 0 以上であること
- エラーログが適切に表示されること

### 2. ワークフローでの確認

acetokyo-com/nextream-api リポジトリで:
1. Actions タブから "Weekly Design Catchup" ワークフローを選択
2. "Run workflow" で手動実行
3. ログを確認:
   - PR 数が適切に取得されていること
   - レポートファイルが正常に生成されること
   - Issue が正常に作成されること

## 影響範囲

- `.github/workflows/design-catchup-reusable.yml` - 他のリポジトリで使用される reusable workflow
- `src/design-decisions/data-collector.ts` - デザイン意思決定データ収集ロジック

## 参考リンク

- [GitHub CLI Manual - gh pr list](https://cli.github.com/manual/gh_pr_list)
- [GitHub Actions - Using secrets](https://docs.github.com/en/actions/security-guides/using-secrets-in-github-actions)
- [GitHub Actions - Workflow syntax - env](https://docs.github.com/en/actions/using-workflows/workflow-syntax-for-github-actions#env)
