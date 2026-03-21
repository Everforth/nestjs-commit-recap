export const SUMMARY_PROMPT_TEMPLATE = `<task>
バックエンドAPIの設計レビュアーとして回答すること。
以下の変更レポートとPR情報を読み、エンジニアリング部長が変更内容を把握するための変更サマリーを作成すること。
部長は全Diffを読む時間はないが、変更の意図と影響範囲は把握したいと考えている。
</task>

<instructions>
PR本文から実装意図を抽出し、実装意図ごとに関連する全ての変更（Entity、DTO、Controller、Service、Middlewareなど）をまとめること。

各グループを以下の形式で記述すること：

## 【機能追加/リファクタリング/バグ修正】実装意図のタイトル

**関連PR**: [PR番号リンク]
**実装意図**:
{PR本文から抽出した意図、またはPR本文がない場合はコードの変更から推測した意図}

**変更内容**:
- **Entity**: 変更の要約（機能レベルで記述、カラム・プロパティの詳細列挙は避ける）
- **DTO**: 変更の要約
- **Controller**: 変更の要約
- **Service**: 変更の要約
- **Middleware**: 変更の要約

**影響範囲**:
- DBマイグレーションの必要性や破壊的変更がある場合のみ記載

重要な指示:
- 同じPR番号に関連する変更は必ず同じグループにまとめること
- カラム名、プロパティ名、エンドポイントパスなどの詳細は列挙しないこと（機能レベルで要約）
- PR本文がない場合は「PR本文なし」と明記し、コードから意図を推測すること
- 見出しには日付を含めないこと
- コード内のキーワードは和訳せずインラインコード形式で記述すること
</instructions>

<pr_context>
{{PR_DESCRIPTIONS}}
</pr_context>

<report>
{{CHANGE_REPORT}}
</report>`;

export const REVIEW_PROMPT_TEMPLATE = `<task>
バックエンドAPIの設計レビュアーとして回答すること。
以下の変更サマリー、PR情報、変更レポートを読み、エンジニアリング部長が設計観点で確認すべき箇所を列挙すること。
部長の目的は問題を断定することではなく、チームが行った変更の中で命名や設計の観点から見直しが必要な箇所を短時間で把握することである。
</task>

<instructions>
以下の観点から、確認が必要な箇所を列挙すること。
各指摘は確認箇所の要約を見出しとし、「PRリンク」と「箇所」と「理由（1行）」のセットで記述すること。

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

見出しには日付などを含めないこと。
見出し・本文ともに、コード内に記載されるキーワードは和訳せずインラインコード形式で記述すること。
各指摘は「確認が必要な箇所」として中立的なトーンで記述すること。
変更レポートから機械的に読み取れる事実のみを根拠にすること。
指摘がない観点は省略すること。
PR本文の実装意図も考慮に入れて、意図に沿わない実装になっていないか確認すること。
</instructions>

<pr_context>
{{PR_DESCRIPTIONS}}
</pr_context>

<summary>
{{CHANGE_SUMMARY}}
</summary>

<report>
{{CHANGE_REPORT}}
</report>`;

export function buildSummaryPrompt(
	changeReport: string,
	prDescriptions?: string,
): string {
	const prContext = prDescriptions || "PR情報なし";
	return SUMMARY_PROMPT_TEMPLATE.replace(
		"{{CHANGE_REPORT}}",
		changeReport,
	).replace("{{PR_DESCRIPTIONS}}", prContext);
}

export function buildReviewPrompt(
	summary: string,
	changeReport: string,
	prDescriptions?: string,
): string {
	const prContext = prDescriptions || "PR情報なし";
	return REVIEW_PROMPT_TEMPLATE.replace("{{CHANGE_SUMMARY}}", summary)
		.replace("{{CHANGE_REPORT}}", changeReport)
		.replace("{{PR_DESCRIPTIONS}}", prContext);
}
