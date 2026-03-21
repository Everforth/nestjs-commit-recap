import type { AnthropicClient } from "../ai/anthropic-client.js";
import type {
	AnalysisResult,
	ControllerChange,
	DTOChange,
	EntityChange,
	FeatureGroup,
	PRInfo,
} from "../types/index.js";

export class FeatureGroupAnalyzer {
	/**
	 * AIでPR本文から機能を抽出し、関連する変更をグループ化
	 */
	async analyzeFeatureGroups(
		result: AnalysisResult,
		anthropicClient: AnthropicClient,
	): Promise<FeatureGroup[]> {
		// 1. AIでPR本文から機能キーワードを抽出
		const featureKeywords = await this.extractFeatureKeywords(
			result.allPRs,
			anthropicClient,
		);

		// 2. 機能名でグループ化
		const groups = this.groupByFeature(result, featureKeywords);

		return groups;
	}

	/**
	 * AIでPR本文から機能キーワードを抽出
	 */
	private async extractFeatureKeywords(
		prs: PRInfo[],
		client: AnthropicClient,
	): Promise<Map<number, string[]>> {
		if (prs.length === 0) {
			return new Map();
		}

		const prompt = `以下のPR情報から、各PRが実装している機能を1-3個のキーワードで抽出してください。

# 抽出ルール
- PR本文(body)とタイトルから機能を推測
- 1つのPRに対して1-3個のキーワード
- キーワードは日本語で、機能を表す名詞（例: 認証、決済、通知）
- 複数のPRが同じ機能に関連する場合は、同じキーワードを使用
- PR本文がない場合は「未分類」

# PR情報
${this.formatPRsForFeatureExtraction(prs)}

# 出力形式
JSON形式で出力してください。PRの番号をキーとし、キーワード配列を値とします。

例:
\`\`\`json
{
  "100": ["認証"],
  "101": ["決済", "ユーザー管理"],
  "102": ["未分類"]
}
\`\`\`

出力:`;

		const response = await client.sendMessage(prompt);
		return this.parseFeatureKeywords(response, prs);
	}

	/**
	 * PR情報を機能抽出用にフォーマット
	 */
	private formatPRsForFeatureExtraction(prs: PRInfo[]): string {
		return prs
			.map((pr) => {
				const body = pr.body ? pr.body.substring(0, 500) : "（本文なし）";
				return `## PR #${pr.number}: ${pr.title}
マージ日: ${pr.mergedAt || pr.createdAt}
本文: ${body}
`;
			})
			.join("\n");
	}

	/**
	 * AI応答から機能キーワードをパース
	 */
	private parseFeatureKeywords(
		response: string,
		prs: PRInfo[],
	): Map<number, string[]> {
		const result = new Map<number, string[]>();

		try {
			// JSONブロックを抽出
			const jsonMatch = response.match(/```json\s*\n([\s\S]*?)\n```/);
			const jsonStr = jsonMatch ? jsonMatch[1] : response;

			const parsed = JSON.parse(jsonStr);

			for (const [prNumber, keywords] of Object.entries(parsed)) {
				const num = Number.parseInt(prNumber, 10);
				if (!Number.isNaN(num) && Array.isArray(keywords)) {
					result.set(num, keywords as string[]);
				}
			}
		} catch (error) {
			console.warn("Failed to parse feature keywords from AI response:", error);
			// フォールバック: 全て「未分類」
			for (const pr of prs) {
				result.set(pr.number, ["未分類"]);
			}
		}

		return result;
	}

	/**
	 * 機能名でグループ化
	 */
	private groupByFeature(
		result: AnalysisResult,
		featureKeywords: Map<number, string[]>,
	): FeatureGroup[] {
		// 機能名ごとにPRをグループ化
		const featureMap = new Map<string, Set<number>>();

		for (const [prNumber, keywords] of featureKeywords.entries()) {
			for (const keyword of keywords) {
				if (!featureMap.has(keyword)) {
					featureMap.set(keyword, new Set());
				}
				featureMap.get(keyword)!.add(prNumber);
			}
		}

		// 各機能グループに関連するEntity/DTO/Controllerを収集
		const groups: FeatureGroup[] = [];

		for (const [featureName, prNumbers] of featureMap.entries()) {
			const relatedPRs = result.allPRs.filter((pr) => prNumbers.has(pr.number));
			const entities = this.filterByPRs(result.entities, prNumbers);
			const dtos = this.filterByPRs(result.dtos, prNumbers);
			const controllers = this.filterByPRs(result.controllers, prNumbers);

			groups.push({
				featureName,
				relatedPRs,
				entities,
				dtos,
				controllers,
			});
		}

		// 規模の大きい順にソート（関連PR数）
		groups.sort((a, b) => b.relatedPRs.length - a.relatedPRs.length);

		return groups;
	}

	/**
	 * 指定PRに関連する変更のみフィルタ
	 */
	private filterByPRs<T extends EntityChange | DTOChange | ControllerChange>(
		changes: T[],
		prNumbers: Set<number>,
	): T[] {
		return changes.filter((change) =>
			change.relatedPRs.some((pr) => prNumbers.has(pr.number)),
		);
	}
}
