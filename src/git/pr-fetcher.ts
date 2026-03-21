import { execSync } from "node:child_process";

export interface PRInfo {
	number: number;
	title: string;
	url: string;
	mergedAt: string | null;
	createdAt?: string;
	body: string | null;
}

export class PRFetcher {
	private repoPath: string;

	constructor(repoPath: string) {
		this.repoPath = repoPath;
	}

	async fetchMergedPRs(days: number): Promise<PRInfo[]> {
		const since = new Date();
		since.setDate(since.getDate() - days);
		const sinceStr = since.toISOString().split("T")[0];

		try {
			// gh CLIを使用してマージ済みPRを取得
			const result = execSync(
				`gh pr list --state merged --search "merged:>=${sinceStr}" --json number,title,url,mergedAt,createdAt,body --limit 100`,
				{
					cwd: this.repoPath,
					encoding: "utf-8",
					stdio: ["pipe", "pipe", "pipe"],
				},
			);

			const prs = JSON.parse(result) as PRInfo[];
			return prs;
		} catch (_error) {
			// gh CLIが利用できない、または認証されていない場合
			return [];
		}
	}

	async getPRsForCommits(commitHashes: string[]): Promise<Map<string, PRInfo>> {
		const prMap = new Map<string, PRInfo>();

		for (const hash of commitHashes) {
			try {
				const result = execSync(
					`gh pr list --state merged --search "${hash}" --json number,title,url,mergedAt,createdAt,body --limit 1`,
					{
						cwd: this.repoPath,
						encoding: "utf-8",
						stdio: ["pipe", "pipe", "pipe"],
					},
				);

				const prs = JSON.parse(result) as PRInfo[];
				if (prs.length > 0) {
					prMap.set(hash, prs[0]);
				}
			} catch {
				// エラーは無視
			}
		}

		return prMap;
	}

	async getPRsForFiles(
		files: string[],
		days: number,
	): Promise<Map<string, PRInfo[]>> {
		const prs = await this.fetchMergedPRs(days);
		const fileToRPs = new Map<string, PRInfo[]>();

		// 各PRで変更されたファイルを取得し、マッピング
		for (const pr of prs) {
			try {
				const result = execSync(`gh pr view ${pr.number} --json files`, {
					cwd: this.repoPath,
					encoding: "utf-8",
					stdio: ["pipe", "pipe", "pipe"],
				});

				const data = JSON.parse(result) as { files: Array<{ path: string }> };
				for (const file of data.files) {
					if (files.includes(file.path)) {
						const existing = fileToRPs.get(file.path) ?? [];
						existing.push(pr);
						fileToRPs.set(file.path, existing);
					}
				}
			} catch {
				// エラーは無視
			}
		}

		return fileToRPs;
	}

	private ghCliAvailable: boolean | null = null;

	isGhCliAvailable(): boolean {
		if (this.ghCliAvailable !== null) {
			return this.ghCliAvailable;
		}

		try {
			execSync("gh --version", {
				encoding: "utf-8",
				stdio: ["pipe", "pipe", "pipe"],
			});
			this.ghCliAvailable = true;
			return true;
		} catch {
			this.ghCliAvailable = false;
			return false;
		}
	}

	isGhAuthenticated(): boolean {
		if (!this.isGhCliAvailable()) {
			return false;
		}

		try {
			execSync("gh auth status", {
				encoding: "utf-8",
				stdio: ["pipe", "pipe", "pipe"],
			});
			return true;
		} catch {
			return false;
		}
	}
}
