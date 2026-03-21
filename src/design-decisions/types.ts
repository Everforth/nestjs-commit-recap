export interface CommitChange {
	hash: string;
	date: string;
	message: string;
	author: string;
	files: string[];
}

export interface PRDetail {
	number: number;
	title: string;
	url: string;
	mergedAt: string | null;
	createdAt?: string;
	body: string | null;
	files: Array<{
		path: string;
		additions?: number;
		deletions?: number;
		diff?: string;
	}>;
}

export interface DomainChange {
	commitHash: string;
	prNumber?: number;
	files: string[];
	diff: string;
	category: ChangeCategory;
}

export type ChangeCategory =
	| "db-schema"
	| "api-endpoint"
	| "domain-model"
	| "state-management"
	| "external-integration"
	| "refactoring"
	| "other";

export interface DesignDecisionData {
	repoPath: string;
	period: {
		startDate: string;
		endDate: string;
	};
	commits: CommitChange[];
	prs: PRDetail[];
	targetChanges: DomainChange[];
}
