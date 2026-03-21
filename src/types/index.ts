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

export interface EntityChange {
	file: string;
	oldFile?: string; // 移動元のパス（moved の場合）
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
	relatedPRs: PRInfo[];
}

export interface DTOProperty {
	name: string;
	type: string;
	nullable?: boolean;
	decorators: string[]; // ['IsString', 'MinLength(5)']
}

export interface DTOChange {
	file: string;
	oldFile?: string; // 移動元のパス（moved の場合）
	className: string;
	changeType: ChangeType;
	properties: {
		before: DTOProperty[];
		after: DTOProperty[];
	};
	relatedPRs: PRInfo[];
}

export interface EnumMember {
	name: string;
	value: string | number | undefined; // undefined: 自動計算値
}

export interface EnumChange {
	file: string;
	oldFile?: string; // 移動元のパス（moved の場合）
	enumName: string;
	changeType: ChangeType;
	members: {
		before: EnumMember[];
		after: EnumMember[];
	};
	relatedPRs: PRInfo[];
}

export interface InterfaceProperty {
	name: string;
	type: string;
	optional: boolean;
	readonly: boolean;
}

export interface InterfaceChange {
	file: string;
	oldFile?: string; // 移動元のパス（moved の場合）
	interfaceName: string;
	changeType: ChangeType;
	properties: {
		before: InterfaceProperty[];
		after: InterfaceProperty[];
	};
	extendsInterfaces: {
		before: string[];
		after: string[];
	};
	relatedPRs: PRInfo[];
}

export interface EndpointInfo {
	method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
	path: string;
	handlerName: string;
}

export interface ControllerChange {
	file: string;
	className: string;
	basePath: string;
	changeType: ChangeType;
	endpoints: {
		before: EndpointInfo[];
		after: EndpointInfo[];
	};
	relatedPRs: PRInfo[];
}

export interface ModuleImport {
	name: string;
}

export interface ModuleProvider {
	name: string;
}

export interface ModuleExport {
	name: string;
}

export interface ModuleController {
	name: string;
}

export interface ModuleConfig {
	imports: ModuleImport[];
	providers: ModuleProvider[];
	exports: ModuleExport[];
	controllers: ModuleController[];
}

export interface ModuleChange {
	file: string;
	className: string;
	changeType: ChangeType;
	config: {
		before: ModuleConfig;
		after: ModuleConfig;
	};
	relatedPRs: PRInfo[];
}

export interface ProviderInfo {
	file: string;
	className: string;
	type: "service" | "repository" | "other";
}

export interface ProviderChange {
	info: ProviderInfo;
	changeType: ChangeType;
	relatedPRs: PRInfo[];
}

export type MiddlewareType =
	| "middleware"
	| "guard"
	| "interceptor"
	| "pipe"
	| "filter";

export interface MiddlewareInfo {
	file: string;
	className: string;
	type: MiddlewareType;
}

export interface MiddlewareChange {
	info: MiddlewareInfo;
	changeType: ChangeType;
	relatedPRs: PRInfo[];
}

export interface AnalysisResult {
	repoPath: string;
	startDate: string;
	endDate: string;
	entities: EntityChange[];
	dtos: DTOChange[];
	enums: EnumChange[];
	interfaces: InterfaceChange[];
	controllers: ControllerChange[];
	modules: ModuleChange[];
	providers: ProviderChange[];
	middlewares: MiddlewareChange[];
	allPRs: PRInfo[];
}

export interface AnalyzerOptions {
	days: number;
	branch?: string;
	skipPR?: boolean;
	verbose?: boolean;
}

export * from "./weekly-analysis.js";
