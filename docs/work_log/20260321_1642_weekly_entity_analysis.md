# 週次Entity中心AI分析機能の実装

## 作業日時
2026-03-21 16:42

## 概要
現在のPR単位の分析（report.ai.md）に加えて、週次でEntity進化と機能軸グループ化を行う新しいレポート（weekly-report.ai.md）を実装しました。CTOがメンバーの設計品質を週単位で確認できるようにすることが目的です。

## 変更内容

### 新規作成ファイル

#### 1. `src/types/weekly-analysis.ts`
週次分析用の型定義を追加:
- `EntityEvolutionStep`: Entity進化の1ステップ
- `EntityEvolution`: Entity全体の進化追跡
- `FeatureGroup`: AIが抽出した機能グループ
- `DesignMetrics`: 設計品質メトリクス
- `WeeklyAnalysisResult`: 週次分析結果

#### 2. `src/analyzers/entity-evolution-analyzer.ts`
Entity変更を時系列で追跡し、進化を分析:
- 同じEntityが複数のPRでどう変化したかを時系列で追跡
- 破壊的変更の検出（カラム削除、型変更、リレーション削除）
- 設計一貫性チェック（頻繁な変更、型の揺らぎ）

#### 3. `src/analyzers/feature-group-analyzer.ts`
AIでPR本文から機能を抽出し、関連する変更をグループ化:
- Claude APIを使用してPR本文から機能キーワードを抽出
- 各PRを機能にマッピング
- 機能ごとにEntity/DTO/Controllerをグループ化

#### 4. `src/reporters/weekly-reporter.ts`
週次分析結果をMarkdown形式で出力:
- エグゼクティブサマリー（最初の数行で全体像を把握）
- 設計品質メトリクス
- 重要な変更の優先順位付け（破壊的変更、頻繁な変更）
- 機能軸グループ化（重要な機能のみ）
- 詳細の折りたたみ（`<details>`タグ活用）

#### 5. `src/ai/weekly-prompts.ts`
週次分析専用のAIプロンプトテンプレート:
- 変更の意図、背景、影響範囲を客観的に記述
- PR本文の引用（ブロック引用形式）
- 時系列の流れを重視
- 評価的な表現を避け、事実のみを記述

### 変更ファイル

#### 1. `src/types/index.ts`
`weekly-analysis.ts`のexport追加

#### 2. `src/ai/ai-analyzer.ts`
週次分析用のメソッド追加:
- `analyzeWeekly()`: 週次分析を実行
- `formatEntityEvolutions()`: Entity進化をテキスト形式に変換
- `formatFeatureGroups()`: 機能グループをテキスト形式に変換

#### 3. `src/ai/ai-reporter.ts`
週次レポート用のフォーマットメソッド追加:
- `formatWeekly()`: 週次AI分析レポートをフォーマット

#### 4. `src/cli/commands.ts`
週次分析の統合:
- `EntityEvolutionAnalyzer`と`FeatureGroupAnalyzer`のインポート
- 週次分析の実行（既存分析の後に実行）
- 週次レポート出力（`report.weekly.md`）
- 週次AI分析出力（`report.weekly.ai.md`）
- ヘルパー関数追加: `getWeeklyOutputPath()`, `getWeeklyAIOutputPath()`

## 使い方

### 実行
```bash
npm run dev -- <リポジトリパス> -d <日数> -o <出力パス>
```

### 出力ファイル
実行すると以下の4つのファイルが生成されます:

1. `<出力パス>.md` - 既存のPR単位構造レポート
2. `<出力パス>.ai.md` - 既存のPR単位AI分析レポート
3. `<出力パス>.weekly.md` - **新規** 週次構造レポート
4. `<出力パス>.weekly.ai.md` - **新規** 週次AI分析レポート

### 例
```bash
npm run dev -- ../nextream-api -d 14 -o /tmp/report.md
```

出力:
- `/tmp/report.md`
- `/tmp/report.ai.md`
- `/tmp/report.weekly.md` ← 新規
- `/tmp/report.weekly.ai.md` ← 新規

## 週次レポートの特徴

### 1. エグゼクティブサマリー
最初の数行で全体像を把握できるサマリー:
- 破壊的変更の数とEntity名
- 複数PR変更されたEntity数
- 新機能追加の一覧
- 総PR数

### 2. 重要な変更の優先順位付け
CTOが確認すべき変更を優先度順に表示:
- 破壊的変更を最優先
- 次に頻繁な変更（複数PRで変更されたEntity）
- 詳細はクリックで展開（`<details>`タグ）

### 3. 機能軸グループ化
AIがPR本文から機能を抽出し、関連する変更をグループ化:
- 機能ごとにEntity、DTO、Controllerをまとめて表示
- 実装規模を可視化
- 詳細は折りたたみで表示

### 4. AI分析（変更意図の可視化）
各変更の意図と背景を明確に記述:
- PR本文からの引用（ブロック引用形式）
- 時系列の流れ
- 影響範囲の説明
- **推奨アクション等の提案は行わず**、客観的な事実のみを記述

## 検証結果

### テスト実行
```bash
npm run dev -- ../nextream-api -d 14 -o /tmp/test-report.md --verbose
```

### 生成ファイル
```
-rw-r--r--  20K  /tmp/test-report.ai.md
-rw-r--r--  56K  /tmp/test-report.md
-rw-r--r--  12K  /tmp/test-report.weekly.ai.md  ← 新規
-rw-r--r--  43K  /tmp/test-report.weekly.md     ← 新規
```

### 検出内容
- Entity: 26個
- DTO: 36個
- Controller: 12個
- 関連PR: 28件
- 複数PR変更されたEntity: 8個（Campaign, CompanyInfluencerConnection, CastingList等）
- 破壊的変更: 0件

### AI分析の品質
- PR本文からの意図抽出: 成功
- ブロック引用形式: 正しく適用
- 時系列の説明: 明確
- 評価的表現の排除: 確認済み（「確認ポイント」「推奨アクション」などは含まれていない）

## 参考リンク
- 実装計画: プロンプトで提供された詳細な実装計画書
- 既存のAI分析機能: `src/ai/ai-analyzer.ts`, `src/ai/prompts.ts`
- 既存のレポーター: `src/reporters/markdown-reporter.ts`
