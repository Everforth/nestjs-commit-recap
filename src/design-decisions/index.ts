#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import chalk from "chalk";
import { Command } from "commander";
import { config } from "dotenv";
import ora from "ora";
import { AnthropicClient } from "../ai/anthropic-client.js";
import { DesignDecisionDataCollector } from "./data-collector.js";
import { DesignDecisionReportGenerator } from "./report-generator.js";

// .env ファイルから環境変数を読み込み
config();

const program = new Command();

program
	.name("design-catchup")
	.description("設計意思決定レポートを生成（データ収集→AI分析を一括実行）")
	.argument("<repo-path>", "対象のリポジトリパス")
	.option("-d, --days <number>", "期間（日数）", "7")
	.option("-o, --output <path>", "出力ファイルパス")
	.option("--save-data <path>", "収集データの保存先（デバッグ用）")
	.option("--skip-diffs", "PR差分の取得をスキップ（高速化）", false)
	.option("--api-key <key>", "Anthropic APIキー（環境変数より優先）")
	.option("--verbose", "詳細ログ", false)
	.action(
		async (
			repoPath: string,
			options: {
				days: string;
				output?: string;
				saveData?: string;
				skipDiffs: boolean;
				apiKey?: string;
				verbose: boolean;
			},
		) => {
			const resolvedPath = resolve(repoPath);
			const days = Number.parseInt(options.days, 10);

			console.log(chalk.blue("設計意思決定レポート生成ツール"));
			console.log(chalk.gray(`リポジトリ: ${resolvedPath}`));
			console.log(chalk.gray(`期間: ${days}日`));
			console.log("");

			// データ収集
			const collectSpinner = ora("データを収集中...").start();

			try {
				const collector = new DesignDecisionDataCollector(
					resolvedPath,
					(message) => {
						if (options.verbose) {
							collectSpinner.text = message;
						}
					},
				);

				const data = await collector.collect(days, options.skipDiffs);

				collectSpinner.succeed("データ収集完了");

				if (options.verbose) {
					console.log("");
					console.log(chalk.green("収集結果:"));
					console.log(`  コミット数: ${data.commits.length}`);
					console.log(`  PR数: ${data.prs.length}`);
					console.log(`  対象変更数: ${data.targetChanges.length}`);
					console.log("");
				}

				// 収集データの保存（オプション）
				if (options.saveData) {
					const dataPath = resolve(options.saveData);
					writeFileSync(dataPath, JSON.stringify(data, null, 2), "utf-8");
					if (options.verbose) {
						console.log(chalk.gray(`データを保存しました: ${dataPath}`));
					}
				}

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

				// 出力先の決定
				const outputDir = options.output
					? resolve(options.output).split("/").slice(0, -1).join("/") ||
						"./reports"
					: "./reports";

				// ディレクトリが存在しない場合は作成
				try {
					mkdirSync(outputDir, { recursive: true });
				} catch {
					// ディレクトリ作成失敗は無視（既に存在する場合など）
				}

				const reportPath = await generator.generate(data, outputDir);

				aiSpinner.succeed("レポート生成完了");

				console.log("");
				console.log(chalk.green(`レポートを保存しました: ${reportPath}`));

				// 結果サマリー
				if (!options.verbose) {
					console.log("");
					console.log(chalk.gray("収集結果:"));
					console.log(chalk.gray(`  コミット数: ${data.commits.length}`));
					console.log(chalk.gray(`  PR数: ${data.prs.length}`));
					console.log(chalk.gray(`  対象変更数: ${data.targetChanges.length}`));
				}
			} catch (error) {
				collectSpinner.fail("エラーが発生しました");
				console.error(
					chalk.red(error instanceof Error ? error.message : String(error)),
				);
				if (error instanceof Error && error.stack && options.verbose) {
					console.error(chalk.gray(error.stack));
				}
				process.exit(1);
			}
		},
	);

program.parse();
