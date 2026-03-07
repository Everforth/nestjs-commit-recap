import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execSync } from 'node:child_process';
import { GitRepository } from '../git/repository.js';
import { PRFetcher } from '../git/pr-fetcher.js';
import { EntityAnalyzer } from '../analyzers/entity-analyzer.js';
import { DTOAnalyzer } from '../analyzers/dto-analyzer.js';
import { EnumAnalyzer } from '../analyzers/enum-analyzer.js';
import { ModuleAnalyzer } from '../analyzers/module-analyzer.js';
import { ControllerAnalyzer } from '../analyzers/controller-analyzer.js';
import { ProviderAnalyzer } from '../analyzers/provider-analyzer.js';
import { MiddlewareAnalyzer } from '../analyzers/middleware-analyzer.js';
import { MarkdownReporter } from '../reporters/markdown-reporter.js';
import type { AnalysisResult, AnalyzerOptions } from '../types/index.js';
import type { PRInfo } from '../git/pr-fetcher.js';

export interface CLIOptions {
  days: number;
  output?: string;
  branch?: string;
  pr: boolean;
  verbose: boolean;
}

export function createProgram(): Command {
  const program = new Command();

  program
    .name('commit-recap')
    .description('NestJSプロジェクトの構造変化をレポートするCLIツール')
    .version('1.0.0')
    .argument('<target-path>', '対象のリポジトリパス')
    .option('-d, --days <number>', '期間（日数）', '7')
    .option('-o, --output <path>', '出力ファイルパス')
    .option('-b, --branch <name>', '対象ブランチ')
    .option('--no-pr', 'PR情報をスキップ')
    .option('--verbose', '詳細ログ', false)
    .action(async (targetPath: string, options: CLIOptions) => {
      await runAnalysis(targetPath, options);
    });

  return program;
}

function isGitAvailable(): boolean {
  try {
    execSync('git --version', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return true;
  } catch {
    return false;
  }
}

async function runAnalysis(targetPath: string, options: CLIOptions): Promise<void> {
  const resolvedPath = resolve(targetPath);
  const days = parseInt(String(options.days), 10);

  console.log(chalk.blue('NestJS構造変化レポーター'));
  console.log(chalk.gray(`リポジトリ: ${resolvedPath}`));
  console.log(chalk.gray(`期間: ${days}日`));
  console.log('');

  // git コマンドの確認
  if (!isGitAvailable()) {
    console.log(chalk.red('エラー: git コマンドが見つかりません。gitをインストールしてください。'));
    process.exit(1);
  }

  const spinner = ora('リポジトリを確認中...').start();

  const repo = new GitRepository(resolvedPath);
  const prFetcher = new PRFetcher(resolvedPath);

  // Gitリポジトリ確認
  if (!(await repo.isGitRepository())) {
    spinner.fail('指定されたパスはGitリポジトリではありません');
    process.exit(1);
  }

  spinner.text = 'コミット履歴を取得中...';

  const analyzerOptions: AnalyzerOptions = {
    days,
    branch: options.branch,
    skipPR: !options.pr,
    verbose: options.verbose,
  };

  // PR情報を取得
  let allPRs: PRInfo[] = [];
  let fileToPRs = new Map<string, PRInfo[]>();

  if (options.pr) {
    spinner.text = 'PR情報を取得中...';

    if (!prFetcher.isGhCliAvailable()) {
      spinner.info('gh CLIが利用できないため、PR情報はスキップされます');
      spinner.start();
    } else if (!prFetcher.isGhAuthenticated()) {
      spinner.info('gh CLIが認証されていないため、PR情報はスキップされます（gh auth login で認証できます）');
      spinner.start();
    } else {
      try {
        allPRs = await prFetcher.fetchMergedPRs(days);
        const { added, deleted, modified } = await repo.getDiffFiles(days, options.branch);
        const allFiles = [...added, ...deleted, ...modified];
        fileToPRs = await prFetcher.getPRsForFiles(allFiles, days);

        if (options.verbose) {
          console.log(chalk.gray(`  取得したPR数: ${allPRs.length}`));
        }
      } catch (error) {
        spinner.info('PR情報の取得に失敗しました');
        spinner.start();
      }
    }
  }

  // 各アナライザーを実行
  spinner.text = 'Entity を解析中...';
  const entityAnalyzer = new EntityAnalyzer(repo, prFetcher, analyzerOptions);
  entityAnalyzer.setFileToPRs(fileToPRs);
  const entities = await entityAnalyzer.analyze();

  spinner.text = 'DTO を解析中...';
  const dtoAnalyzer = new DTOAnalyzer(repo, prFetcher, analyzerOptions);
  dtoAnalyzer.setFileToPRs(fileToPRs);
  const dtos = await dtoAnalyzer.analyze();

  spinner.text = 'Enum を解析中...';
  const enumAnalyzer = new EnumAnalyzer(repo, prFetcher, analyzerOptions);
  enumAnalyzer.setFileToPRs(fileToPRs);
  const enums = await enumAnalyzer.analyze();

  spinner.text = 'Module を解析中...';
  const moduleAnalyzer = new ModuleAnalyzer(repo, prFetcher, analyzerOptions);
  moduleAnalyzer.setFileToPRs(fileToPRs);
  const modules = await moduleAnalyzer.analyze();

  spinner.text = 'Controller を解析中...';
  const controllerAnalyzer = new ControllerAnalyzer(repo, prFetcher, analyzerOptions);
  controllerAnalyzer.setFileToPRs(fileToPRs);
  const controllers = await controllerAnalyzer.analyze();

  spinner.text = 'Provider を解析中...';
  const providerAnalyzer = new ProviderAnalyzer(repo, prFetcher, analyzerOptions);
  providerAnalyzer.setFileToPRs(fileToPRs);
  const providers = await providerAnalyzer.analyze();

  spinner.text = 'Middleware を解析中...';
  const middlewareAnalyzer = new MiddlewareAnalyzer(repo, prFetcher, analyzerOptions);
  middlewareAnalyzer.setFileToPRs(fileToPRs);
  const middlewares = await middlewareAnalyzer.analyze();

  spinner.text = 'レポートを生成中...';

  // 日付範囲を計算
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const result: AnalysisResult = {
    repoPath: resolvedPath,
    startDate: startDate.toISOString().split('T')[0],
    endDate: endDate.toISOString().split('T')[0],
    entities,
    dtos,
    enums,
    controllers,
    modules,
    providers,
    middlewares,
    allPRs,
  };

  const reporter = new MarkdownReporter();
  const markdown = reporter.generate(result);

  spinner.succeed('解析完了');

  // 結果のサマリーを表示
  console.log('');
  console.log(chalk.green('検出された変更:'));
  console.log(`  Entity: ${entities.length}`);
  console.log(`  DTO: ${dtos.length}`);
  console.log(`  Enum: ${enums.length}`);
  console.log(`  Controller: ${controllers.length}`);
  console.log(`  Module: ${modules.length}`);
  console.log(`  Provider: ${providers.length}`);
  console.log(`  Middleware類: ${middlewares.length}`);

  if (allPRs.length > 0) {
    console.log(`  関連PR: ${allPRs.length}`);
  }

  // 出力
  if (options.output) {
    const outputPath = resolve(options.output);
    writeFileSync(outputPath, markdown, 'utf-8');
    console.log('');
    console.log(chalk.green(`レポートを出力しました: ${outputPath}`));
  } else {
    console.log('');
    console.log(chalk.gray('--- レポート ---'));
    console.log('');
    console.log(markdown);
  }
}
