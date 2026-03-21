#!/usr/bin/env node
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import chalk from "chalk";
import { Command } from "commander";
import ora from "ora";
import { DesignDecisionDataCollector } from "./data-collector.js";

const program = new Command();

program
	.name("collect-design-data")
	.description("設計上の意思決定を含む変更データを収集")
	.argument("<repo-path>", "対象のリポジトリパス")
	.option("-d, --days <number>", "期間（日数）", "7")
	.option("-o, --output <path>", "出力JSONファイルパス", "./design-data.json")
	.option("--skip-diffs", "PR差分の取得をスキップ（高速化）", false)
	.option("--verbose", "詳細ログ", false)
	.action(
		async (repoPath: string, options: { days: string; output: string }) => {
			const resolvedPath = resolve(repoPath);
			const days = parseInt(options.days, 10);
			const outputPath = resolve(options.output);

			console.log(chalk.blue("設計意思決定データ収集ツール"));
			console.log(chalk.gray(`リポジトリ: ${resolvedPath}`));
			console.log(chalk.gray(`期間: ${days}日`));
			console.log("");

			const spinner = ora("データを収集中...").start();

			try {
				const collector = new DesignDecisionDataCollector(resolvedPath);

				spinner.text = "コミット履歴を取得中...";
				const data = await collector.collect(days);

				spinner.text = "データを保存中...";
				writeFileSync(outputPath, JSON.stringify(data, null, 2), "utf-8");

				spinner.succeed("データ収集完了");

				console.log("");
				console.log(chalk.green("収集結果:"));
				console.log(`  コミット数: ${data.commits.length}`);
				console.log(`  PR数: ${data.prs.length}`);
				console.log(`  対象変更数: ${data.targetChanges.length}`);
				console.log("");
				console.log(chalk.green(`データを保存しました: ${outputPath}`));
				console.log("");
				console.log(
					chalk.gray(
						"次のステップ: generate-design-report を実行してレポートを生成してください",
					),
				);
			} catch (error) {
				spinner.fail("エラーが発生しました");
				console.error(
					chalk.red(error instanceof Error ? error.message : String(error)),
				);
				process.exit(1);
			}
		},
	);

program.parse();
