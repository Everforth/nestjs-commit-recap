import type { PRInfo } from "../git/pr-fetcher.js";
import type { WeeklyAnalysisResult } from "../types/index.js";
import type { AnthropicClient } from "./anthropic-client.js";
import { buildReviewPrompt, buildSummaryPrompt } from "./prompts.js";
import type { AIAnalysisResult, ChangeSummary, DesignReview } from "./types.js";
import { buildWeeklySummaryPrompt } from "./weekly-prompts.js";

export class AIAnalyzer {
	constructor(
		private client: AnthropicClient,
		private verbose: boolean = false,
	) {}

	async analyze(
		changeReport: string,
		allPRs?: PRInfo[],
	): Promise<AIAnalysisResult> {
		try {
			// Format PR context from provided PR information
			const prContext =
				allPRs && allPRs.length > 0 ? this.formatPRContext(allPRs) : undefined;

			if (this.verbose && prContext) {
				console.log(`  Formatted PR context for ${allPRs?.length || 0} PRs`);
			}

			// Call 1: Generate summary with PR context
			const summary = await this.generateSummary(changeReport, prContext);

			// Call 2: Generate review using summary and PR context
			const review = await this.generateReview(
				summary.rawResponse,
				changeReport,
				prContext,
			);

			return {
				summary,
				review,
			};
		} catch (error) {
			if (error instanceof Error) {
				return {
					summary: { rawResponse: "" },
					review: { rawResponse: "" },
					error: error.message,
				};
			}
			throw error;
		}
	}

	private formatPRContext(prs: PRInfo[]): string {
		// Remove duplicates based on PR number
		const uniquePRs = Array.from(
			new Map(prs.map((pr) => [pr.number, pr])).values(),
		);

		const prEntries: string[] = [];
		for (const pr of uniquePRs) {
			prEntries.push(`PR #${pr.number}: ${pr.title}`);
			prEntries.push(`URL: ${pr.url}`);

			if (pr.body && pr.body.trim().length > 0) {
				// Limit body to 1000 characters to avoid token overflow
				const bodyPreview =
					pr.body.length > 1000
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

	private async generateSummary(
		report: string,
		prContext?: string,
	): Promise<ChangeSummary> {
		if (this.verbose) {
			console.log("  Generating change summary...");
		}

		const prompt = buildSummaryPrompt(report, prContext);
		const response = await this.client.sendMessage(prompt);

		if (this.verbose) {
			console.log(`  Summary generated (${response.length} chars)`);
		}

		return {
			rawResponse: response,
		};
	}

	private async generateReview(
		summary: string,
		report: string,
		prContext?: string,
	): Promise<DesignReview> {
		if (this.verbose) {
			console.log("  Generating design review...");
		}

		const prompt = buildReviewPrompt(summary, report, prContext);
		const response = await this.client.sendMessage(prompt);

		if (this.verbose) {
			console.log(`  Review generated (${response.length} chars)`);
		}

		return {
			rawResponse: response,
		};
	}

	/**
	 * 週次分析を実行
	 */
	async analyzeWeekly(
		weeklyResult: WeeklyAnalysisResult,
		prDescriptions: string,
	): Promise<string> {
		if (this.verbose) {
			console.log("  Generating weekly analysis...");
		}

		const entityEvolutionsText = this.formatEntityEvolutions(
			weeklyResult.entityEvolutions,
		);
		const featureGroupsText = this.formatFeatureGroups(
			weeklyResult.featureGroups,
		);

		const summaryPrompt = buildWeeklySummaryPrompt(
			entityEvolutionsText,
			featureGroupsText,
			prDescriptions,
		);

		const analysis = await this.client.sendMessage(summaryPrompt);

		if (this.verbose) {
			console.log(`  Weekly analysis generated (${analysis.length} chars)`);
		}

		return analysis;
	}

	/**
	 * Entity進化をテキスト形式に変換
	 */
	private formatEntityEvolutions(
		evolutions: WeeklyAnalysisResult["entityEvolutions"],
	): string {
		const lines: string[] = [];

		for (const evolution of evolutions) {
			lines.push(`# Entity: ${evolution.entityName}`);
			lines.push(`ファイル: ${evolution.filePath}`);
			lines.push(`総PR数: ${evolution.totalPRs}`);
			lines.push(
				`破壊的変更: ${evolution.hasBreakingChanges ? "あり" : "なし"}`,
			);

			if (evolution.consistencyIssues.length > 0) {
				lines.push("\n問題:");
				for (const issue of evolution.consistencyIssues) {
					lines.push(`- ${issue}`);
				}
			}

			lines.push("\nタイムライン:");
			for (let i = 0; i < evolution.steps.length; i++) {
				const step = evolution.steps[i];
				lines.push(
					`${i + 1}. PR #${step.prInfo.number} (${step.timestamp}): ${step.prInfo.title}`,
				);
				lines.push(`   カラム数: ${step.change.columns.after.length}`);
				if (step.change.relations) {
					lines.push(
						`   リレーション数: ${step.change.relations.after.length}`,
					);
				}
			}

			lines.push("\n---\n");
		}

		return lines.join("\n");
	}

	/**
	 * 機能グループをテキスト形式に変換
	 */
	private formatFeatureGroups(
		featureGroups: WeeklyAnalysisResult["featureGroups"],
	): string {
		const lines: string[] = [];

		for (const group of featureGroups) {
			lines.push(`# 機能: ${group.featureName}`);
			lines.push(
				`関連PR: ${group.relatedPRs.map((pr) => `#${pr.number}`).join(", ")}`,
			);
			lines.push(`Entity数: ${group.entities.length}`);
			lines.push(`DTO数: ${group.dtos.length}`);
			lines.push(`Controller数: ${group.controllers.length}`);

			if (group.entities.length > 0) {
				lines.push("\nEntities:");
				for (const entity of group.entities) {
					lines.push(`- ${entity.className} (${entity.changeType})`);
				}
			}

			if (group.dtos.length > 0) {
				lines.push("\nDTOs:");
				for (const dto of group.dtos) {
					lines.push(`- ${dto.className} (${dto.changeType})`);
				}
			}

			if (group.controllers.length > 0) {
				lines.push("\nControllers:");
				for (const controller of group.controllers) {
					lines.push(`- ${controller.className} (${controller.changeType})`);
				}
			}

			lines.push("\n---\n");
		}

		return lines.join("\n");
	}
}
