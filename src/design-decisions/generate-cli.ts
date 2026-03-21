#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import chalk from "chalk";
import { Command } from "commander";
import { config } from "dotenv";
import ora from "ora";
import { AnthropicClient } from "../ai/anthropic-client.js";
import { DesignDecisionReportGenerator } from "./report-generator.js";
import type { DesignDecisionData } from "./types.js";

// .env ファイルから環境変数を読み込み
config();

const program = new Command();

program
	.name("generate-design-report")
	.description("収集した変更データからAI分析レポートを生成")
	.argument("<data-file>", "収集したデータのJSONファイルパス")
	.option("-o, --output-dir <path>", "出力ディレクトリ", "./reports")
	.option(
		"-r, --repo-path <path>",
		"リポジトリパス（データファイルの値を上書き）",
	)
	.option("--api-key <key>", "Anthropic APIキー（環境変数より優先）")
	.action(
		async (
			dataFile: string,
			options: { outputDir: string; repoPath?: string; apiKey?: string },
		) => {
			const dataPath = resolve(dataFile);
			const outputDir = resolve(options.outputDir);

			console.log(chalk.blue("設計意思決定レポート生成ツール"));
			console.log(chalk.gray(`データファイル: ${dataPath}`));
			console.log(chalk.gray(`出力先: ${outputDir}`));
			console.log("");

			const spinner = ora("データを読み込み中...").start();

			try {
				// データファイルを読み込み
				const dataJson = readFileSync(dataPath, "utf-8");
				const data = JSON.parse(dataJson) as DesignDecisionData;

				spinner.succeed(
					`データ読み込み完了 (対象変更: ${data.targetChanges.length}件)`,
				);

				// APIキーの確認
				const apiKey = options.apiKey || process.env.ANTHROPIC_API_KEY;
				if (!apiKey) {
					console.error(
						chalk.red(
							"エラー: ANTHROPIC_API_KEY が設定されていません。環境変数または --api-key オプションで指定してください。",
						),
					);
					process.exit(1);
				}

				// AI分析を実行
				const aiSpinner = ora("AI分析を実行中...").start();

				const client = new AnthropicClient({
					apiKey,
					maxTokens: 8192,
					timeout: 180000, // 3分
				});
				const generator = new DesignDecisionReportGenerator(client);

				const reportPath = await generator.generate(data, outputDir);

				aiSpinner.succeed("レポート生成完了");

				console.log("");
				console.log(chalk.green(`レポートを保存しました: ${reportPath}`));
			} catch (error) {
				spinner.fail("エラーが発生しました");
				console.error(
					chalk.red(error instanceof Error ? error.message : String(error)),
				);
				if (error instanceof Error && error.stack) {
					console.error(chalk.gray(error.stack));
				}
				process.exit(1);
			}
		},
	);

program.parse();
