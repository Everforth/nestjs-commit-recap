import type { PRInfo } from "../git/pr-fetcher.js";

export type { PRInfo };
export type ChangeType = "added" | "deleted" | "modified" | "moved";

export interface EntityColumn {
	name: string;
	type: string;
	nullable?: boolean;
}

export interface EntityRelation {
	name: string;
	relationType: "ManyToOne" | "OneToMany" | "OneToOne" | "ManyToMany";
	targetEntity: string;
}

export interface EntityIndex {
	columns: string[];
	unique?: boolean;
	name?: string;
}

export interface EntityForeignKey {
	relationName: string;
	relationType: "ManyToOne" | "OneToMany" | "OneToOne" | "ManyToMany";
	targetEntity: string;
	onDelete?: string;
	onUpdate?: string;
}

export interface EntityChange {
	file: string;
	oldFile?: string;
	className: string;
	changeType: ChangeType;
	columns: {
		before: EntityColumn[];
		after: EntityColumn[];
	};
	relations?: {
		before: EntityRelation[];
		after: EntityRelation[];
	};
	indexes?: {
		before: EntityIndex[];
		after: EntityIndex[];
	};
	foreignKeys?: {
		before: EntityForeignKey[];
		after: EntityForeignKey[];
	};
	relatedPRs: PRInfo[];
}

export interface DTOProperty {
	name: string;
	type: string;
	nullable?: boolean;
	decorators: string[];
}

export interface DTOChange {
	file: string;
	oldFile?: string;
	className: string;
	changeType: ChangeType;
	properties: {
		before: DTOProperty[];
		after: DTOProperty[];
	};
	relatedPRs: PRInfo[];
}

export interface AnalyzerOptions {
	days: number;
	branch?: string;
	skipPR?: boolean;
	verbose?: boolean;
}
