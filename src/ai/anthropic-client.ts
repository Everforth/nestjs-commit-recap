import Anthropic from "@anthropic-ai/sdk";
import type { AIAnalysisOptions } from "./types.js";

export class AnthropicClient {
	private client: Anthropic;
	private model: string;
	private maxTokens: number;
	private timeout: number;

	constructor(options: AIAnalysisOptions) {
		if (!options.apiKey) {
			throw new Error("API key is required");
		}

		this.client = new Anthropic({
			apiKey: options.apiKey,
			timeout: options.timeout || 120000,
		});

		this.model = options.model || "claude-sonnet-4-5-20250929";
		this.maxTokens = options.maxTokens || 4096;
		this.timeout = options.timeout || 120000;
	}

	async sendMessage(prompt: string): Promise<string> {
		try {
			const message = await this.client.messages.create({
				model: this.model,
				max_tokens: this.maxTokens,
				messages: [
					{
						role: "user",
						content: prompt,
					},
				],
			});

			// Extract text content from the response
			const textContent = message.content.find(
				(block) => block.type === "text",
			);
			if (!textContent || textContent.type !== "text") {
				throw new Error("No text content in response");
			}

			return textContent.text;
		} catch (error) {
			if (error instanceof Error) {
				throw new Error(`Anthropic API error: ${error.message}`);
			}
			throw error;
		}
	}

	isConfigured(): boolean {
		return !!this.client;
	}
}
