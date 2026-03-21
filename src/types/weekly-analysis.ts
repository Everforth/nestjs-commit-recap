import type { PRInfo } from "../git/pr-fetcher.js";
import type { ControllerChange, DTOChange, EntityChange } from "./index.js";

// Entity進化の1ステップ
export interface EntityEvolutionStep {
	prInfo: PRInfo;
	change: EntityChange;
	timestamp: string;
}

// Entity全体の進化追跡
export interface EntityEvolution {
	entityName: string;
	filePath: string;
	steps: EntityEvolutionStep[]; // 時系列順
	totalPRs: number;
	hasBreakingChanges: boolean;
	consistencyIssues: string[]; // 設計一貫性の問題
}

// 機能グループ(AI抽出)
export interface FeatureGroup {
	featureName: string; // AIが抽出した機能名
	relatedPRs: PRInfo[];
	entities: EntityChange[];
	dtos: DTOChange[];
	controllers: ControllerChange[];
}

// 設計品質メトリクス
export interface DesignMetrics {
	entitiesModifiedMultipleTimes: number; // 複数回変更されたEntity数
	breakingChangeCount: number; // 破壊的変更の数
	crossPREntityChanges: number; // 複数PRにまたがるEntity変更
	totalPRs: number;
}

// 週次分析結果
export interface WeeklyAnalysisResult {
	repoPath: string;
	startDate: string;
	endDate: string;
	entityEvolutions: EntityEvolution[];
	featureGroups: FeatureGroup[];
	designMetrics: DesignMetrics;
}
