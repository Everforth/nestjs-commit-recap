import type {
	EntityEvolution,
	EntityEvolutionStep,
	FeatureGroup,
	WeeklyAnalysisResult,
} from "../types/index.js";

export class WeeklyReporter {
	/**
	 * 週次分析結果をMarkdown形式で出力
	 */
	format(result: WeeklyAnalysisResult): string {
		return [
			this.formatHeader(result),
			this.formatExecutiveSummary(result),
			this.formatMetrics(result),
			this.formatCriticalChanges(result),
			this.formatFeatureGroups(result),
			this.formatOtherChanges(result),
		]
			.filter(Boolean)
			.join("\n\n---\n\n");
	}

	/**
	 * ヘッダー
	 */
	private formatHeader(result: WeeklyAnalysisResult): string {
		return `# 週次設計分析レポート

生成日時: ${new Date().toISOString()}
対象期間: ${result.startDate} ~ ${result.endDate}
リポジトリ: ${result.repoPath}`;
	}

	/**
	 * エグゼクティブサマリー
	 */
	private formatExecutiveSummary(result: WeeklyAnalysisResult): string {
		const breakingChanges = result.entityEvolutions.filter(
			(e) => e.hasBreakingChanges,
		);
		const frequentChanges = result.entityEvolutions.filter(
			(e) => e.totalPRs >= 2,
		);
		const newFeatures = this.extractNewFeatures(result.featureGroups);

		return `## エグゼクティブサマリー ⚡

**週間ハイライト**:
- 🚨 破壊的変更: ${breakingChanges.length}件${breakingChanges.length > 0 ? ` (${breakingChanges.map((e) => e.entityName).join(", ")})` : ""}
- 🔄 複数PR変更: ${frequentChanges.length} Entity${frequentChanges.length > 0 ? ` (${frequentChanges.map((e) => e.entityName).join(", ")})` : ""}
- ✨ 新機能追加: ${newFeatures.length > 0 ? newFeatures.join(", ") : "なし"}
- 📊 総PR数: ${result.designMetrics.totalPRs}件

**主要な変更カテゴリ**:
${this.formatPriorities(result)}`;
	}

	/**
	 * 新機能を抽出
	 */
	private extractNewFeatures(featureGroups: FeatureGroup[]): string[] {
		return featureGroups
			.filter((g) => g.featureName !== "未分類" && g.relatedPRs.length > 0)
			.slice(0, 5)
			.map((g) => g.featureName);
	}

	/**
	 * 確認優先度を整理
	 */
	private formatPriorities(result: WeeklyAnalysisResult): string {
		const priorities: string[] = [];

		const breakingChanges = result.entityEvolutions.filter(
			(e) => e.hasBreakingChanges,
		);
		if (breakingChanges.length > 0) {
			priorities.push(
				`1. **破壊的変更** → ${breakingChanges.map((e) => e.entityName).join(", ")}`,
			);
		}

		const frequentChanges = result.entityEvolutions.filter(
			(e) => e.totalPRs >= 2,
		);
		if (frequentChanges.length > 0) {
			priorities.push(
				`2. **複数PR変更** → ${frequentChanges.map((e) => `${e.entityName} (${e.totalPRs}回)`).join(", ")}`,
			);
		}

		const newFeatures = this.extractNewFeatures(result.featureGroups);
		if (newFeatures.length > 0) {
			priorities.push(`3. **新機能追加** → ${newFeatures.join(", ")}`);
		}

		return priorities.join("\n");
	}

	/**
	 * 設計品質メトリクス
	 */
	private formatMetrics(result: WeeklyAnalysisResult): string {
		return `## 設計品質メトリクス

| メトリクス | 値 |
|-----------|---|
| 総PR数 | ${result.designMetrics.totalPRs} |
| 破壊的変更の数 | ${result.designMetrics.breakingChangeCount} |
| 複数回変更されたEntity | ${result.designMetrics.entitiesModifiedMultipleTimes} |
| 複数PRにまたがるEntity変更 | ${result.designMetrics.crossPREntityChanges} |`;
	}

	/**
	 * 重要な変更（破壊的変更・複数PR変更）
	 */
	private formatCriticalChanges(result: WeeklyAnalysisResult): string {
		const critical = result.entityEvolutions
			.filter((e) => e.hasBreakingChanges || e.totalPRs >= 2)
			.sort((a, b) => {
				// 破壊的変更を優先
				if (a.hasBreakingChanges && !b.hasBreakingChanges) return -1;
				if (!a.hasBreakingChanges && b.hasBreakingChanges) return 1;
				// 次に変更回数
				return b.totalPRs - a.totalPRs;
			});

		if (critical.length === 0) {
			return "## 🚨 重要な変更\n\n重要な変更はありません。";
		}

		return `## 🚨 重要な変更（優先度順）

${critical.map((e, i) => this.formatCriticalEntity(e, i + 1)).join("\n\n")}`;
	}

	/**
	 * 重要なEntity変更をフォーマット
	 */
	private formatCriticalEntity(
		evolution: EntityEvolution,
		index: number,
	): string {
		const summary = this.formatEntitySummary(evolution);
		const details = this.formatEntityTimeline(evolution);

		return `### ${index}. ${this.getPriorityLabel(evolution)}: ${evolution.entityName}

**ファイル**: \`${evolution.filePath}\`
**関連PR**: ${evolution.steps.map((s) => `[#${s.prInfo.number}](${s.prInfo.url})`).join(", ")}

${summary}

<details>
<summary>詳細なタイムライン（クリックで展開）</summary>

${details}

</details>`;
	}

	/**
	 * 優先度ラベルを取得
	 */
	private getPriorityLabel(evolution: EntityEvolution): string {
		if (evolution.hasBreakingChanges) return "破壊的変更";
		if (evolution.totalPRs >= 3) return "頻繁な変更";
		return "複数PR変更";
	}

	/**
	 * Entityサマリー
	 */
	private formatEntitySummary(evolution: EntityEvolution): string {
		const lines: string[] = [];

		if (evolution.consistencyIssues.length > 0) {
			lines.push("**検出された問題**:");
			for (const issue of evolution.consistencyIssues) {
				lines.push(`- ${issue}`);
			}
		}

		if (evolution.totalPRs >= 2) {
			const firstDate = new Date(evolution.steps[0].timestamp);
			const lastDate = new Date(
				evolution.steps[evolution.steps.length - 1].timestamp,
			);
			const daysDiff =
				(lastDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24);
			lines.push(
				`\n**総変更期間**: ${Math.ceil(daysDiff)}日間 (${evolution.totalPRs}回の変更)`,
			);
		}

		return lines.join("\n");
	}

	/**
	 * Entityタイムライン
	 */
	private formatEntityTimeline(evolution: EntityEvolution): string {
		const lines: string[] = ["#### タイムライン\n"];

		for (let i = 0; i < evolution.steps.length; i++) {
			const step = evolution.steps[i];
			const date = new Date(step.timestamp).toISOString().split("T")[0];

			lines.push(
				`${i + 1}. **PR #${step.prInfo.number}** (${date}) - ${step.prInfo.title}`,
			);

			// カラムの追加/削除
			const columnChanges = this.getColumnChanges(
				step.change.columns.before,
				step.change.columns.after,
			);
			if (columnChanges.length > 0) {
				for (const change of columnChanges) {
					lines.push(`   - ${change}`);
				}
			}

			// リレーションの追加/削除
			if (step.change.relations) {
				const relationChanges = this.getRelationChanges(
					step.change.relations.before,
					step.change.relations.after,
				);
				if (relationChanges.length > 0) {
					for (const change of relationChanges) {
						lines.push(`   - ${change}`);
					}
				}
			}

			lines.push("");
		}

		return lines.join("\n");
	}

	/**
	 * カラム変更を取得
	 */
	private getColumnChanges(
		before: Array<{ name: string; type: string }>,
		after: Array<{ name: string; type: string }>,
	): string[] {
		const changes: string[] = [];

		// 追加
		const added = after.filter((a) => !before.find((b) => b.name === a.name));
		for (const col of added) {
			changes.push(`カラム追加: ${col.name} (${col.type})`);
		}

		// 削除
		const deleted = before.filter((b) => !after.find((a) => a.name === b.name));
		for (const col of deleted) {
			changes.push(`カラム削除: ${col.name} (${col.type})`);
		}

		// 型変更
		for (const b of before) {
			const a = after.find((col) => col.name === b.name);
			if (a && a.type !== b.type) {
				changes.push(`型変更: ${b.name}: ${b.type} → ${a.type}`);
			}
		}

		return changes;
	}

	/**
	 * リレーション変更を取得
	 */
	private getRelationChanges(
		before: Array<{ name: string; relationType: string; targetEntity: string }>,
		after: Array<{ name: string; relationType: string; targetEntity: string }>,
	): string[] {
		const changes: string[] = [];

		// 追加
		const added = after.filter((a) => !before.find((b) => b.name === a.name));
		for (const rel of added) {
			changes.push(
				`リレーション追加: ${rel.name} (${rel.relationType} → ${rel.targetEntity})`,
			);
		}

		// 削除
		const deleted = before.filter((b) => !after.find((a) => a.name === b.name));
		for (const rel of deleted) {
			changes.push(
				`リレーション削除: ${rel.name} (${rel.relationType} → ${rel.targetEntity})`,
			);
		}

		return changes;
	}

	/**
	 * 機能軸グループ化
	 */
	private formatFeatureGroups(result: WeeklyAnalysisResult): string {
		const importantGroups = result.featureGroups.filter(
			(g) => g.featureName !== "未分類" && g.relatedPRs.length > 0,
		);

		if (importantGroups.length === 0) {
			return "## 機能軸グループ化\n\n新機能の追加はありません。";
		}

		return `## 機能軸グループ化（重要な機能のみ）

${importantGroups.map((g) => this.formatFeatureGroup(g)).join("\n\n")}`;
	}

	/**
	 * 機能グループをフォーマット
	 */
	private formatFeatureGroup(group: FeatureGroup): string {
		const lines: string[] = [];

		const icon = this.getFeatureIcon(group);
		lines.push(`### ${icon} ${group.featureName}`);
		lines.push(
			`**関連PR**: ${group.relatedPRs.map((pr) => `[#${pr.number}](${pr.url})`).join(", ")}`,
		);
		lines.push(
			`**実装規模**: Entity ${group.entities.length}個、DTO ${group.dtos.length}個、Controller ${group.controllers.length}個`,
		);

		// 詳細は折りたたみ
		const details = this.formatFeatureGroupDetails(group);
		if (details) {
			lines.push("");
			lines.push("<details>");
			lines.push("<summary>詳細な変更内容（クリックで展開）</summary>");
			lines.push("");
			lines.push(details);
			lines.push("");
			lines.push("</details>");
		}

		return lines.join("\n");
	}

	/**
	 * 機能アイコンを取得
	 */
	private getFeatureIcon(group: FeatureGroup): string {
		// 新規追加が多い場合
		const addedCount = [
			...group.entities.filter((e) => e.changeType === "added"),
			...group.dtos.filter((d) => d.changeType === "added"),
			...group.controllers.filter((c) => c.changeType === "added"),
		].length;

		const totalCount =
			group.entities.length + group.dtos.length + group.controllers.length;

		if (addedCount >= totalCount * 0.8) {
			return "🆕";
		}

		// 変更が多い場合
		return "🔄";
	}

	/**
	 * 機能グループ詳細
	 */
	private formatFeatureGroupDetails(group: FeatureGroup): string {
		const lines: string[] = [];

		if (group.entities.length > 0) {
			lines.push("**Entity**:");
			for (const entity of group.entities) {
				const changeLabel = this.getChangeLabel(entity.changeType);
				const columns = entity.columns.after
					.map((c) => c.name)
					.slice(0, 5)
					.join(", ");
				lines.push(
					`- ${entity.className} (${changeLabel}): ${columns}${entity.columns.after.length > 5 ? "..." : ""}`,
				);
			}
			lines.push("");
		}

		if (group.dtos.length > 0) {
			lines.push("**DTO**:");
			for (const dto of group.dtos) {
				const changeLabel = this.getChangeLabel(dto.changeType);
				const props = dto.properties.after
					.map((p) => p.name)
					.slice(0, 5)
					.join(", ");
				lines.push(
					`- ${dto.className} (${changeLabel}): ${props}${dto.properties.after.length > 5 ? "..." : ""}`,
				);
			}
			lines.push("");
		}

		if (group.controllers.length > 0) {
			lines.push("**Controller**:");
			for (const controller of group.controllers) {
				const changeLabel = this.getChangeLabel(controller.changeType);
				const endpoints = controller.endpoints.after
					.map((e) => `${e.method} ${e.path}`)
					.join(", ");
				lines.push(`- ${controller.className} (${changeLabel}): ${endpoints}`);
			}
		}

		return lines.join("\n");
	}

	/**
	 * 変更タイプのラベルを取得
	 */
	private getChangeLabel(changeType: string): string {
		switch (changeType) {
			case "added":
				return "追加";
			case "modified":
				return "変更";
			case "deleted":
				return "削除";
			case "moved":
				return "移動";
			default:
				return changeType;
		}
	}

	/**
	 * その他の変更
	 */
	private formatOtherChanges(result: WeeklyAnalysisResult): string {
		const other = result.entityEvolutions.filter(
			(e) => !e.hasBreakingChanges && e.totalPRs < 2,
		);

		if (other.length === 0) {
			return "";
		}

		const newEntities = other.filter((e) =>
			e.steps.some((s) => s.change.changeType === "added"),
		);

		return `## ℹ️ その他の変更（参考）

- 新規Entity追加: ${newEntities.length}個${newEntities.length > 0 ? ` (${newEntities.map((e) => e.entityName).join(", ")})` : ""}
- その他の変更: ${other.length - newEntities.length}個`;
	}
}
