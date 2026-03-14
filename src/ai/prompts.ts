export const SUMMARY_PROMPT_TEMPLATE = `<task>
あなたはバックエンドAPIの設計レビュアーです。
以下の変更レポートを読み、エンジニアリング部長が変更内容を把握するための変更サマリーを作成してください。
部長は全Diffを読む時間はないが、変更の意図と影響範囲はしっかり把握したいと考えています。
</task>

<instructions>
関連する変更をグループ化し、変更クラスタ単位でまとめてください。
各クラスタを以下の形式で記述してください。

### クラスタ名
- 何がどう変わったか（1行）
- 変更前後の対応関係があれば明記（1行）
	- 単純に要素を列挙する場合はリスト形式で複数行にする
- DBマイグレーションやAPIの破壊的変更がある場合は明記（1行）

各項目は1行で完結させてください。
変更の意図や背景をコードから読み取り、補完して記述してください。
詳細なDiffは出力に含めないでください。
</instructions>

<report>
{{CHANGE_REPORT}}
</report>`;

export const REVIEW_PROMPT_TEMPLATE = `<task>
あなたはバックエンドAPIの設計レビュアーです。
以下の変更サマリーと変更レポートを読み、エンジニアリング部長が設計観点で確認すべき箇所を列挙してください。
部長の目的は問題を断定することではなく、チームが行った変更の中で命名や設計の観点から見直しが必要な箇所を短時間で把握することです。
</task>

<instructions>
以下の観点から、確認が必要な箇所を列挙してください。
各指摘は「PRリンク」と「箇所」と「理由（1行）」のセットで記述してください。

命名・概念の観点:
- 名前から責務やスコープが読み取りにくいもの
- 同じ概念に複数の名前が存在するもの
- 構造が似ているエンティティが別々に定義されているもの

構造・モデリングの観点:
- スキーマレスなカラムの混入（JSON型、Record<string, unknown>等）
- soft delete / archive の適用が非対称なもの
- エンティティ間の所有権や権限が構造から読み取りにくいもの

エンドポイント設計の観点:
- RESTの慣習から外れているが理由が不明な箇所
- 類似した操作のエンドポイント設計が非対称な箇所

各指摘は「確認が必要な箇所」として中立的なトーンで記述してください。
変更レポートから機械的に読み取れる事実のみを根拠にしてください。
指摘がない観点は省略してください。
</instructions>

<summary>
{{CHANGE_SUMMARY}}
</summary>

<report>
{{CHANGE_REPORT}}
</report>`;

export function buildSummaryPrompt(changeReport: string): string {
	return SUMMARY_PROMPT_TEMPLATE.replace("{{CHANGE_REPORT}}", changeReport);
}

export function buildReviewPrompt(
	summary: string,
	changeReport: string,
): string {
	return REVIEW_PROMPT_TEMPLATE.replace("{{CHANGE_SUMMARY}}", summary).replace(
		"{{CHANGE_REPORT}}",
		changeReport,
	);
}
