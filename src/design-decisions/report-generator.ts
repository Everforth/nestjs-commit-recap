import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AnthropicClient } from "../ai/anthropic-client.js";
import { buildDesignDecisionPrompt } from "./prompts.js";
import type { DesignDecisionData } from "./types.js";

export class DesignDecisionReportGenerator {
	private client: AnthropicClient;

	constructor(client: AnthropicClient) {
		this.client = client;
	}

	async generate(data: DesignDecisionData, outputDir: string): Promise<string> {
		const prompt = buildDesignDecisionPrompt(data);

		const report = await this.client.sendMessage(prompt);

		// レポートをファイルに保存
		const timestamp = new Date().toISOString().split("T")[0].replace(/-/g, "");
		const outputPath = join(outputDir, `weekly-design-catchup-${timestamp}.md`);

		writeFileSync(outputPath, report, "utf-8");

		return outputPath;
	}
}
