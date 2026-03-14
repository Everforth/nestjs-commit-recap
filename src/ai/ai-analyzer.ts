import type { AnthropicClient } from "./anthropic-client.js";
import { buildReviewPrompt, buildSummaryPrompt } from "./prompts.js";
import type { AIAnalysisResult, ChangeSummary, DesignReview } from "./types.js";

export class AIAnalyzer {
	constructor(
		private client: AnthropicClient,
		private verbose: boolean = false,
	) {}

	async analyze(changeReport: string): Promise<AIAnalysisResult> {
		try {
			// Call 1: Generate summary
			const summary = await this.generateSummary(changeReport);

			// Call 2: Generate review using summary
			const review = await this.generateReview(
				summary.rawResponse,
				changeReport,
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

	private async generateSummary(report: string): Promise<ChangeSummary> {
		if (this.verbose) {
			console.log("  Generating change summary...");
		}

		const prompt = buildSummaryPrompt(report);
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
	): Promise<DesignReview> {
		if (this.verbose) {
			console.log("  Generating design review...");
		}

		const prompt = buildReviewPrompt(summary, report);
		const response = await this.client.sendMessage(prompt);

		if (this.verbose) {
			console.log(`  Review generated (${response.length} chars)`);
		}

		return {
			rawResponse: response,
		};
	}
}
