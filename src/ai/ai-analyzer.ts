import type { PRInfo } from "../git/pr-fetcher.js";
import type { AnthropicClient } from "./anthropic-client.js";
import { buildReviewPrompt, buildSummaryPrompt } from "./prompts.js";
import type { AIAnalysisResult, ChangeSummary, DesignReview } from "./types.js";

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
}
