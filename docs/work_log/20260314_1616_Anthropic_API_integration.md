# Anthropic API統合 - 2段階AI分析機能追加

## 作業日時
2026-03-14 16:16

## 概要
commit-recapにAnthropic APIを使った2段階のAI分析機能を追加した。
既存の変更レポート出力は維持しつつ、AI分析結果を別ファイルに出力する機能を実装。

## 変更内容

### 新規作成ファイル

| ファイル | 概要 |
|----------|------|
| `src/ai/types.ts` | AI分析関連の型定義（AIAnalysisOptions, ChangeSummary, DesignReview等） |
| `src/ai/prompts.ts` | プロンプトテンプレート（変更サマリー生成、設計レビュー生成） |
| `src/ai/anthropic-client.ts` | Anthropic APIクライアントラッパー（エラーハンドリング、タイムアウト対応） |
| `src/ai/ai-analyzer.ts` | 2段階分析オーケストレーター（Call 1 → Call 2） |
| `src/ai/ai-reporter.ts` | AI分析結果のMarkdown整形 |

### 変更ファイル

| ファイル | 変更概要 |
|----------|----------|
| `src/cli/commands.ts` | AI分析統合（APIキーチェック、AI分析実行、別ファイル出力） |
| `package.json` | 依存追加: `@anthropic-ai/sdk@^0.35.0` |
| `README.md` | AI分析機能のドキュメント追加 |

## 実装の詳細

### AI分析の流れ

1. **変更レポート生成**: 既存の `MarkdownReporter` でレポート生成
2. **元レポート出力**: 指定ファイル（または標準出力）に出力
3. **APIキーチェック**: `ANTHROPIC_API_KEY` 環境変数を確認
4. **Call 1 - 変更サマリー生成**: 変更レポートを読み、関連変更をグループ化
5. **Call 2 - 設計レビュー生成**: サマリーと元レポートから設計観点の確認ポイントを列挙
6. **AI分析レポート出力**: `{元ファイル名}.ai.md` に出力

### 出力ファイル名の規則

```bash
# ファイル出力時
-o report.md → report.md (元) + report.ai.md (AI分析)

# 標準出力時
標準出力 (元) + commit-recap-ai.md (AI分析)
```

### エラーハンドリング

- APIキーなし → AI分析をスキップ（メッセージなし、元レポートは出力）
- API呼び出し失敗 → 警告表示、元レポートは出力
- タイムアウト → 警告表示、元レポートは出力

### プロンプト設計

**Call 1: 変更サマリー生成**
- 役割: バックエンドAPIの設計レビュアー
- タスク: 部長向けに変更内容を把握できるサマリーを作成
- 出力: 変更クラスタ単位の説明（2〜4文）、破壊的変更の明記

**Call 2: 設計レビュー候補生成**
- 役割: バックエンドAPIの設計レビュアー
- タスク: 設計観点で確認すべき箇所を列挙
- 観点: 命名・概念、構造・モデリング、エンドポイント設計
- 出力: 中立的なトーンで機械的に読み取れる事実のみを根拠に記述

## 使い方

### 基本的な使い方

```bash
# APIキーを設定
export ANTHROPIC_API_KEY=sk-ant-...

# 実行（AI分析が自動的に有効化される）
npm run dev -- /path/to/repo -o report.md

# 出力ファイル確認
ls -l report*.md
# → report.md (元のレポート)
# → report.ai.md (AI分析レポート)
```

### APIキーなしの場合

```bash
# APIキーを設定しない
unset ANTHROPIC_API_KEY

# 実行（従来通りの動作）
npm run dev -- /path/to/repo -o report.md

# 出力ファイル確認
ls -l report*.md
# → report.md のみ生成される
```

### 詳細モード

```bash
export ANTHROPIC_API_KEY=sk-ant-...

# 詳細ログ付きで実行
npm run dev -- /path/to/repo -o report.md --verbose

# → API呼び出しの詳細ログが表示される
#   - "Generating change summary..."
#   - "Summary generated (XXXX chars)"
#   - "Generating design review..."
#   - "Review generated (XXXX chars)"
```

## テスト結果

### ビルドテスト

```bash
npm run build
# → ✓ ビルド成功（エラーなし）
```

### 動作確認項目（実装後に実施予定）

- [ ] APIキーあり・ファイル出力: `report.md` と `report.ai.md` が生成される
- [ ] APIキーあり・標準出力: 標準出力にレポート、`commit-recap-ai.md` が生成される
- [ ] APIキーなし・ファイル出力: `report.md` のみ生成、エラーなし
- [ ] 不正なAPIキー: 警告表示、元レポートは出力
- [ ] 詳細モード: API呼び出しのログが表示される

## 参考リンク

- [Anthropic API Documentation](https://docs.anthropic.com/)
- [Anthropic SDK TypeScript](https://github.com/anthropics/anthropic-sdk-typescript)
- [@anthropic-ai/sdk npm package](https://www.npmjs.com/package/@anthropic-ai/sdk)
- [Claude 4.5 Sonnet Model](https://docs.anthropic.com/en/docs/about-claude/models)

## 備考

- デフォルトモデル: `claude-sonnet-4-5-20250929`
- タイムアウト: 120秒
- Max tokens: 4096
- APIキーは環境変数 `ANTHROPIC_API_KEY` から読み込み
- ログにAPIキーは出力しない
