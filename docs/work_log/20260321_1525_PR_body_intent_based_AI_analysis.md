# PR本文を活用した実装意図ベースのAI分析機能の実装

## 作業日時
2026-03-21 15:25

## 概要
AI分析レポート（report.ai.md）の品質向上のため、PR本文（body）を取得・活用し、実装意図ベースでEntity、DTO、Controller、Serviceなどの変更をグループ化する機能を実装しました。

## 背景
従来のAI分析レポートは以下の問題を抱えていました：

1. **情報が細かすぎる**: カラム単位、プロパティ単位の詳細が列挙され、全体像が把握しにくい
2. **実装意図が見えない**: Entity、DTO、Controller、Serviceの変更が別々に記載され、「なぜこの変更をしたのか」が不明確
3. **PR情報の活用不足**: PR番号のみ表示され、PR本文（Description）の実装意図が反映されていない

## 変更内容

### 1. PRInfo型の拡張（src/git/pr-fetcher.ts）
- `PRInfo`インターフェースに`body: string | null`フィールドを追加
- `fetchMergedPRs()`メソッドの`--json`オプションに`body`を追加
- `getPRsForCommits()`メソッドの`--json`オプションに`body`を追加

### 2. AIプロンプトテンプレートの更新（src/ai/prompts.ts）
- `SUMMARY_PROMPT_TEMPLATE`を実装意図ベースの形式に変更
  - `<pr_context>`セクションを追加
  - 指示内容を「関連する変更をグループ化」から「実装意図ごとにEntity、DTO、Controller、Serviceなど全ての変更をまとめる」に変更
  - 出力形式を機能レベルのサマリーに変更（カラム・プロパティの詳細列挙を避ける）

- `REVIEW_PROMPT_TEMPLATE`にPRコンテキストセクションを追加
  - `<pr_context>`セクションを追加
  - PR本文の実装意図を考慮した設計レビューに変更

- プロンプト構築関数の更新
  - `buildSummaryPrompt()`に`prDescriptions`オプションパラメータを追加
  - `buildReviewPrompt()`に`prDescriptions`オプションパラメータを追加

### 3. AIAnalyzer クラスの拡張（src/ai/ai-analyzer.ts）
- `PRInfo`型をインポート
- `analyze()`メソッドに`allPRs?: PRInfo[]`パラメータを追加
- `formatPRContext()`プライベートメソッドを実装
  - PR情報から重複を除去
  - PR番号、タイトル、URL、本文をフォーマット
  - PR本文が1000文字を超える場合は切り詰め
- `generateSummary()`と`generateReview()`にPRコンテキストを渡すように変更

### 4. CLIコマンドの更新（src/cli/commands.ts）
- `aiAnalyzer.analyze()`呼び出しに`allPRs`パラメータを追加
- 既存のPR取得ロジック（`fetchMergedPRs()`）がPR本文も含めて取得するようになった

## 技術的な詳細

### PR本文のフォーマット
```typescript
private formatPRContext(prs: PRInfo[]): string {
  // 重複除去
  const uniquePRs = Array.from(
    new Map(prs.map(pr => [pr.number, pr])).values()
  );

  const prEntries: string[] = [];
  for (const pr of uniquePRs) {
    prEntries.push(`PR #${pr.number}: ${pr.title}`);
    prEntries.push(`URL: ${pr.url}`);

    if (pr.body && pr.body.trim().length > 0) {
      // 1000文字制限でトークン超過を防ぐ
      const bodyPreview = pr.body.length > 1000
        ? `${pr.body.substring(0, 1000)}...[省略]`
        : pr.body;
      prEntries.push(`\n${bodyPreview}\n`);
    } else {
      prEntries.push("\n(PR本文なし)\n");
    }
    prEntries.push("---\n");
  }

  return prEntries.join("\n");
}
```

### 期待される出力形式
```markdown
## 【リファクタリング】管理者向けエンドポイントの統合とRBAC実装

**関連PR**: [#128](url)

**実装意図**:
管理者向けと一般ユーザー向けのエンドポイントを分離する設計から、単一のエンドポイントで権限ベースのアクセス制御（RBAC）を実装する設計に変更。エンドポイントの重複を削減し、保守性を向上させる。

**変更内容**:
- **Controller**: `/admin/influencers/*`系のエンドポイントを削除（6エンドポイント）
- **Controller**: `/influencers/*`系のエンドポイントにRBACガードを追加
- **DTO**: `SearchInfluencerConnectionsDto`に権限フィルタリング用のフィールドを追加
- **Service**: `InfluencersService`に権限チェックロジックを追加

**影響範囲**:
- **破壊的変更**: 管理画面で`/admin/influencers/*`を使用している場合、`/influencers/*`への移行が必要
```

## 使い方

```bash
# PR本文を含めた分析を実行
npm run dev -- ../nextream-api -d 7 -o /tmp/report.md

# AI分析レポートが report.ai.md として出力される
# （ANTHROPIC_API_KEY 環境変数が必要）
```

## 動作確認

```bash
# ビルド
npm run build

# テスト実行（3日分のPR情報を取得）
node dist/index.js ../nextream-api -d 3 -o /tmp/test-report.md --verbose

# 出力確認
# - /tmp/test-report.md: 構造的なレポート（従来通り）
# - /tmp/test-report.ai.md: AI分析レポート（改善版）
```

## 影響を受けるファイル

### 変更したファイル
- `src/git/pr-fetcher.ts`: PRInfo型の拡張とPR本文取得
- `src/ai/prompts.ts`: 実装意図ベースのプロンプト
- `src/ai/ai-analyzer.ts`: PRコンテキスト処理とAI分析ロジック
- `src/cli/commands.ts`: AI分析へのPR情報の受け渡し

### 影響を受けないファイル
- `src/analyzers/*.ts`: 各アナライザー（変更なし）
- `src/reporters/markdown-reporter.ts`: Markdownレポート生成（変更なし）
- `src/types/index.ts`: 型定義（PRInfo型はpr-fetcher.tsで定義）

## 注意事項

1. **トークン制限**: PR本文が長い場合、1000文字で切り詰めています
2. **gh CLI依存**: PR本文の取得には`gh` CLIの認証が必要です
3. **API制限**: Anthropic APIの利用制限に注意してください
4. **エラーハンドリング**: PR本文がない場合やAPI呼び出しが失敗した場合でも処理は継続します

## 参考リンク
- [Anthropic API Documentation](https://docs.anthropic.com/)
- [GitHub CLI - gh pr view](https://cli.github.com/manual/gh_pr_view)
