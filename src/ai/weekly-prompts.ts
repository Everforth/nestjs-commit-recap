/**
 * 週次サマリープロンプト: 変更意図の可視化
 */
export function buildWeeklySummaryPrompt(
	entityEvolutions: string,
	featureGroups: string,
	prDescriptions: string,
): string {
	return `<task>
週次のEntity進化と機能軸グループを分析し、各変更の意図と背景を可視化すること。
CTOが変更の合理性を自分で判断できる情報を提供することが目的。
</task>

<instructions>
以下の形式で記述すること:

## 1. 重要な変更の可視化（破壊的変更・複数PR変更）
複数のPRにまたがって変更されたEntity、または破壊的変更があったEntityについて:

各Entityごとに:
- **変更の意図**: PR本文から抽出した実装の背景と目的
- **変更内容**: 具体的な変更（カラム追加/削除、型変更、リレーション変更）
- **背景**: 複数PRの場合、なぜ段階的に変更されたのかの時系列
- **影響範囲**: 削除や型変更がある場合、影響を受けるDTO/Controller

## 2. 機能軸での全体像
機能ごとに関連する全ての変更をまとめる:
- **実装の意図**: PR本文から抽出した機能の目的
- **実装内容**: Entity、DTO、Controller、Serviceの変更
- **設計の特徴**: データモデルの分離、soft delete対応など

重要な指示:
- 「確認ポイント」「推奨アクション」「評価」などは記述しない
- 変更の意図、背景、影響範囲を客観的に記述
- PR本文がある場合は必ず引用（> ブロック引用形式）
- 時系列の流れを重視（なぜその順序で変更されたのか）
- 評価的な表現は避け、事実のみを記述
</instructions>

<entity_evolutions>
${entityEvolutions}
</entity_evolutions>

<feature_groups>
${featureGroups}
</feature_groups>

<pr_context>
${prDescriptions}
</pr_context>`;
}
