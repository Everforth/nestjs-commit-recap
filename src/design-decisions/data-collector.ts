import { execSync } from "node:child_process";
import simpleGit, { type SimpleGit } from "simple-git";
import type {
	ChangeCategory,
	CommitChange,
	DesignDecisionData,
	DomainChange,
	PRDetail,
} from "./types.js";

export class DesignDecisionDataCollector {
	private git: SimpleGit;
	private repoPath: string;
	private onProgress?: (message: string) => void;

	constructor(repoPath: string, onProgress?: (message: string) => void) {
		this.repoPath = repoPath;
		this.git = simpleGit(repoPath);
		this.onProgress = onProgress;
	}

	async collect(days = 7, skipDiffs = false): Promise<DesignDecisionData> {
		const endDate = new Date();
		const startDate = new Date();
		startDate.setDate(startDate.getDate() - days);

		this.onProgress?.("コミット履歴を取得中...");
		const commits = await this.getCommits(days);
		this.onProgress?.(`コミット ${commits.length}件を取得`);

		this.onProgress?.("PR情報を取得中...");
		const prs = await this.getPRs(days, skipDiffs);
		this.onProgress?.(`PR ${prs.length}件を取得`);

		this.onProgress?.("変更を分析中...");
		const targetChanges = await this.filterAndEnrichChanges(commits, prs);
		this.onProgress?.(`対象変更 ${targetChanges.length}件を抽出`);

		return {
			repoPath: this.repoPath,
			period: {
				startDate: startDate.toISOString().split("T")[0],
				endDate: endDate.toISOString().split("T")[0],
			},
			commits,
			prs,
			targetChanges,
		};
	}

	private async getCommits(days: number): Promise<CommitChange[]> {
		const since = new Date();
		since.setDate(since.getDate() - days);
		const sinceStr = since.toISOString().split("T")[0];

		// git log を1回の呼び出しで全ての情報を取得（最適化）
		const logRaw = await this.git.raw([
			"log",
			"--since",
			sinceStr,
			"--all",
			"--name-only",
			"--format=%H%n%aI%n%an%n%s%n---FILES---",
			"--no-merges", // マージコミットを除外して高速化
		]);

		const commits: CommitChange[] = [];
		const commitBlocks = logRaw.split("\n\n").filter((block) => block.trim());

		for (const block of commitBlocks) {
			const lines = block.split("\n");
			if (lines.length < 5) continue;

			const hash = lines[0];
			const date = lines[1];
			const author = lines[2];
			const message = lines[3];
			const filesStartIndex = lines.findIndex((line) =>
				line.includes("---FILES---"),
			);

			const files =
				filesStartIndex >= 0
					? lines
							.slice(filesStartIndex + 1)
							.filter((f) => f.trim() && !f.startsWith("commit "))
					: [];

			commits.push({
				hash,
				date,
				message,
				author,
				files,
			});
		}

		return commits;
	}

	private async getPRs(days: number, skipDiffs = false): Promise<PRDetail[]> {
		if (!this.isGhCliAvailable()) {
			return [];
		}

		const since = new Date();
		since.setDate(since.getDate() - days);

		try {
			const result = execSync(
				`gh pr list --state merged --limit 30 --json number,title,url,mergedAt,createdAt,body,files`,
				{
					cwd: this.repoPath,
					encoding: "utf-8",
					stdio: ["pipe", "pipe", "pipe"],
				},
			);

			const allPRs = JSON.parse(result) as Array<{
				number: number;
				title: string;
				url: string;
				mergedAt: string | null;
				createdAt: string;
				body: string | null;
				files: Array<{
					path: string;
					additions?: number;
					deletions?: number;
				}>;
			}>;

			// 期間内にマージされたPRのみをフィルタ
			const prs = allPRs.filter((pr) => {
				const mergedAt = new Date(pr.mergedAt || pr.createdAt);
				return mergedAt >= since;
			});

			// 各PRのファイル差分を取得（スキップ可能）
			if (skipDiffs) {
				return prs.map((pr) => ({
					...pr,
					files: pr.files.map((f) => ({ ...f, diff: "" })),
				}));
			}

			const prsWithDiff: PRDetail[] = [];
			for (const pr of prs) {
				this.onProgress?.(`PR #${pr.number} の差分を取得中...`);
				const filesWithDiff = await this.getPRFileDiffs(pr.number, pr.files);
				prsWithDiff.push({
					...pr,
					files: filesWithDiff,
				});
			}

			return prsWithDiff;
		} catch (error) {
			console.error("Failed to fetch PRs:", error);
			return [];
		}
	}

	private async getPRFileDiffs(
		prNumber: number,
		files: Array<{ path: string; additions?: number; deletions?: number }>,
	): Promise<PRDetail["files"]> {
		try {
			// gh api を使ってPRの全ファイル差分を1回で取得（最適化）
			const apiResult = execSync(
				`gh api repos/:owner/:repo/pulls/${prNumber}/files --paginate`,
				{
					cwd: this.repoPath,
					encoding: "utf-8",
					stdio: ["pipe", "pipe", "pipe"],
					timeout: 30000, // 30秒タイムアウト
				},
			);

			const fileDetails = JSON.parse(apiResult) as Array<{
				filename: string;
				patch?: string;
				additions: number;
				deletions: number;
			}>;

			// ファイルリストとマッチング
			const filesWithDiff: PRDetail["files"] = [];
			for (const file of files) {
				const fileDetail = fileDetails.find((f) => f.filename === file.path);
				filesWithDiff.push({
					path: file.path,
					additions: fileDetail?.additions || file.additions,
					deletions: fileDetail?.deletions || file.deletions,
					diff: fileDetail?.patch || "",
				});
			}

			return filesWithDiff;
		} catch (error) {
			// API呼び出しに失敗した場合は差分なしで返す
			console.error(`Failed to fetch file diffs for PR #${prNumber}:`, error);
			return files.map((file) => ({
				path: file.path,
				additions: file.additions,
				deletions: file.deletions,
				diff: "",
			}));
		}
	}

	private async filterAndEnrichChanges(
		commits: CommitChange[],
		prs: PRDetail[],
	): Promise<DomainChange[]> {
		const targetChanges: DomainChange[] = [];

		// PRベースで処理（PRがある場合）
		for (const pr of prs) {
			// DTOファイルを除外
			const nonDtoFiles = this.filterOutDTOFiles(pr.files.map((f) => f.path));

			// DTOファイルのみの変更は除外
			if (nonDtoFiles.length === 0) continue;

			// DTOファイルを除いた残りのファイルでカテゴリ分類
			const category = this.categorizeChange(nonDtoFiles);
			if (category === "other") continue; // 対象外の変更はスキップ

			// DTOファイルを除いたファイルの差分のみを含める
			const nonDtoPRFiles = pr.files.filter((f) =>
				nonDtoFiles.includes(f.path),
			);

			const diff = nonDtoPRFiles
				.filter((f) => f.diff)
				.map((f) => `--- ${f.path}\n${f.diff}`)
				.join("\n\n");

			targetChanges.push({
				commitHash: "", // PRの場合はコミットハッシュは空
				prNumber: pr.number,
				files: nonDtoFiles, // DTOを除外したファイルリスト
				diff,
				category,
			});
		}

		// PR情報のないコミットを処理
		const prCommitHashes = new Set(
			commits
				.filter((c) => prs.some((pr) => c.message.includes(`#${pr.number}`)))
				.map((c) => c.hash),
		);

		for (const commit of commits) {
			if (prCommitHashes.has(commit.hash)) continue;

			// DTOファイルを除外
			const nonDtoFiles = this.filterOutDTOFiles(commit.files);

			// DTOファイルのみの変更は除外
			if (nonDtoFiles.length === 0) continue;

			// DTOファイルを除いた残りのファイルでカテゴリ分類
			const category = this.categorizeChange(nonDtoFiles);
			if (category === "other") continue;

			try {
				const diff = await this.git.show([commit.hash]);
				targetChanges.push({
					commitHash: commit.hash,
					files: nonDtoFiles, // DTOを除外したファイルリスト
					diff,
					category,
				});
			} catch {
				// 差分取得に失敗した場合はスキップ
			}
		}

		return targetChanges;
	}

	/**
	 * DTOファイルを除外
	 */
	private filterOutDTOFiles(files: string[]): string[] {
		return files.filter((f) => {
			const lowerPath = f.toLowerCase();
			return !lowerPath.includes("dto");
		});
	}

	private categorizeChange(files: string[]): ChangeCategory {
		// DB スキーマ変更
		if (
			files.some(
				(f) =>
					f.includes("migration") ||
					f.includes("schema") ||
					f.includes(".prisma") ||
					f.includes(".sql"),
			)
		) {
			return "db-schema";
		}

		// API エンドポイント
		if (
			files.some(
				(f) =>
					f.includes("controller") ||
					f.includes("route") ||
					f.includes("api") ||
					f.includes("endpoint"),
			)
		) {
			return "api-endpoint";
		}

		// ドメインモデル・エンティティ
		if (
			files.some(
				(f) =>
					f.includes("entity") ||
					f.includes("entities") ||
					f.includes("domain") ||
					f.includes("model"),
			)
		) {
			return "domain-model";
		}

		// 状態管理
		if (
			files.some(
				(f) =>
					f.includes("store") ||
					f.includes("state") ||
					f.includes("redux") ||
					f.includes("zustand"),
			)
		) {
			return "state-management";
		}

		// 外部サービス連携
		if (
			files.some(
				(f) =>
					f.includes("integration") ||
					f.includes("external") ||
					f.includes("service") ||
					f.includes("client"),
			)
		) {
			return "external-integration";
		}

		// リファクタリング（ファイルの移動や抽象化）
		if (
			files.length > 3 &&
			files.some((f) => f.includes("refactor") || f.includes("abstract"))
		) {
			return "refactoring";
		}

		// 除外対象
		if (
			files.every(
				(f) =>
					f.includes("package") ||
					f.includes("lock") ||
					f.includes(".md") ||
					f.includes(".txt") ||
					f.includes("test") ||
					f.includes("spec") ||
					f.includes(".css") ||
					f.includes(".scss") ||
					f.includes("style"),
			)
		) {
			return "other";
		}

		// デフォルトは other
		return "other";
	}

	private isGhCliAvailable(): boolean {
		try {
			execSync("gh --version", {
				encoding: "utf-8",
				stdio: ["pipe", "pipe", "pipe"],
			});
			return true;
		} catch {
			return false;
		}
	}
}
