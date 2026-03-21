import type { PRInfo } from "../git/pr-fetcher.js";
import type {
	EntityChange,
	EntityColumn,
	EntityEvolution,
	EntityEvolutionStep,
	EntityRelation,
} from "../types/index.js";

export class EntityEvolutionAnalyzer {
	/**
	 * Entity変更を時系列で追跡し、進化を分析
	 */
	analyzeEntityEvolutions(
		entities: EntityChange[],
		allPRs: PRInfo[],
	): EntityEvolution[] {
		// 1. Entity名でグループ化
		const grouped = this.groupByEntityName(entities);

		// 2. 各グループを時系列で分析
		return Array.from(grouped.entries()).map(([entityName, changes]) => {
			const steps = this.buildSteps(changes, allPRs);
			const breakingChanges = this.detectBreakingChanges(steps);
			const consistencyIssues = this.detectConsistencyIssues(steps);

			return {
				entityName,
				filePath: changes[0].file,
				steps,
				totalPRs: new Set(
					changes.flatMap((c) => c.relatedPRs.map((p) => p.number)),
				).size,
				hasBreakingChanges: breakingChanges.length > 0,
				consistencyIssues: [...breakingChanges, ...consistencyIssues],
			};
		});
	}

	/**
	 * Entity名でグループ化
	 */
	private groupByEntityName(
		entities: EntityChange[],
	): Map<string, EntityChange[]> {
		const grouped = new Map<string, EntityChange[]>();

		for (const entity of entities) {
			const existing = grouped.get(entity.className) || [];
			existing.push(entity);
			grouped.set(entity.className, existing);
		}

		return grouped;
	}

	/**
	 * 時系列ステップを構築
	 */
	private buildSteps(
		changes: EntityChange[],
		allPRs: PRInfo[],
	): EntityEvolutionStep[] {
		const steps: EntityEvolutionStep[] = [];

		for (const change of changes) {
			for (const pr of change.relatedPRs) {
				const prInfo = allPRs.find((p) => p.number === pr.number);
				if (!prInfo) continue;

				steps.push({
					prInfo,
					change,
					timestamp:
						prInfo.mergedAt || prInfo.createdAt || new Date().toISOString(),
				});
			}
		}

		// 時系列順にソート
		steps.sort(
			(a, b) =>
				new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
		);

		return steps;
	}

	/**
	 * 破壊的変更を検出
	 */
	private detectBreakingChanges(steps: EntityEvolutionStep[]): string[] {
		const issues: string[] = [];

		for (let i = 1; i < steps.length; i++) {
			const prev = steps[i - 1].change;
			const current = steps[i].change;

			// カラム削除
			const deletedColumns = this.getDeletedColumns(
				prev.columns.after,
				current.columns.after,
			);
			if (deletedColumns.length > 0) {
				issues.push(
					`カラム削除: ${deletedColumns.map((c) => c.name).join(", ")} (PR #${steps[i].prInfo.number})`,
				);
			}

			// 型変更
			const typeChanges = this.getTypeChanges(
				prev.columns.after,
				current.columns.after,
			);
			if (typeChanges.length > 0) {
				issues.push(
					`型変更: ${typeChanges.map((c) => `${c.name}: ${c.oldType} → ${c.newType}`).join(", ")} (PR #${steps[i].prInfo.number})`,
				);
			}

			// リレーション削除
			if (prev.relations && current.relations) {
				const deletedRelations = this.getDeletedRelations(
					prev.relations.after,
					current.relations.after,
				);
				if (deletedRelations.length > 0) {
					issues.push(
						`リレーション削除: ${deletedRelations.map((r) => r.name).join(", ")} (PR #${steps[i].prInfo.number})`,
					);
				}
			}
		}

		return issues;
	}

	/**
	 * 設計一貫性の問題を検出
	 */
	private detectConsistencyIssues(steps: EntityEvolutionStep[]): string[] {
		const issues: string[] = [];

		// 短期間での頻繁な変更（7日以内に3回以上）
		if (steps.length >= 3) {
			const firstDate = new Date(steps[0].timestamp);
			const lastDate = new Date(steps[steps.length - 1].timestamp);
			const daysDiff =
				(lastDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24);

			if (daysDiff <= 7) {
				issues.push(
					`短期間での頻繁な変更: ${steps.length}回の変更が${Math.ceil(daysDiff)}日間で実施`,
				);
			}
		}

		// 型の頻繁な変更（同じカラムの型が複数回変更）
		const typeChangeCount = new Map<string, number>();
		for (let i = 1; i < steps.length; i++) {
			const prev = steps[i - 1].change;
			const current = steps[i].change;

			const typeChanges = this.getTypeChanges(
				prev.columns.after,
				current.columns.after,
			);
			for (const change of typeChanges) {
				typeChangeCount.set(
					change.name,
					(typeChangeCount.get(change.name) || 0) + 1,
				);
			}
		}

		for (const [columnName, count] of typeChangeCount.entries()) {
			if (count >= 2) {
				issues.push(`カラム型の頻繁な変更: ${columnName} が${count}回変更`);
			}
		}

		return issues;
	}

	/**
	 * 削除されたカラムを取得
	 */
	private getDeletedColumns(
		before: EntityColumn[],
		after: EntityColumn[],
	): EntityColumn[] {
		return before.filter((b) => !after.find((a) => a.name === b.name));
	}

	/**
	 * 型変更されたカラムを取得
	 */
	private getTypeChanges(
		before: EntityColumn[],
		after: EntityColumn[],
	): Array<{ name: string; oldType: string; newType: string }> {
		const changes: Array<{ name: string; oldType: string; newType: string }> =
			[];

		for (const b of before) {
			const a = after.find((col) => col.name === b.name);
			if (a && a.type !== b.type) {
				changes.push({
					name: b.name,
					oldType: b.type,
					newType: a.type,
				});
			}
		}

		return changes;
	}

	/**
	 * 削除されたリレーションを取得
	 */
	private getDeletedRelations(
		before: EntityRelation[],
		after: EntityRelation[],
	): EntityRelation[] {
		return before.filter((b) => !after.find((a) => a.name === b.name));
	}
}
