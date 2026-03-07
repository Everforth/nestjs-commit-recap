import type { EnumDeclaration } from "ts-morph";
import type { EnumChange, EnumMember } from "../types/index.js";
import { BaseAnalyzer } from "./base-analyzer.js";

export class EnumAnalyzer extends BaseAnalyzer {
	async analyze(): Promise<EnumChange[]> {
		const changes: EnumChange[] = [];

		const { added, deleted, modified, renamed } = await this.repo.getDiffFiles(
			this.options.days,
			this.options.branch,
		);

		// 通常のファイル（追加、削除、変更）を処理
		// すべての .ts ファイルを対象とする
		const allFiles = [...added, ...deleted, ...modified].filter((file) =>
			file.endsWith(".ts"),
		);

		for (const file of allFiles) {
			const beforeContent = await this.getFileContent(file, "before");
			const afterContent = await this.getFileContent(file, "after");

			const beforeEnums = this.extractEnums(beforeContent);
			const afterEnums = this.extractEnums(afterContent);

			// ファイル内のすべてのEnumを個別に追跡
			const allEnumNames = new Set([
				...beforeEnums.keys(),
				...afterEnums.keys(),
			]);

			for (const enumName of allEnumNames) {
				const beforeMembers = beforeEnums.get(enumName) || [];
				const afterMembers = afterEnums.get(enumName) || [];

				const changeType = this.determineChangeType(
					beforeMembers.length > 0 ? "has-content" : null,
					afterMembers.length > 0 ? "has-content" : null,
				);

				this.log(`Found Enum: ${enumName} in ${file} (${changeType})`);

				changes.push({
					file,
					enumName,
					changeType,
					members: {
						before: beforeMembers,
						after: afterMembers,
					},
					relatedPRs: this.getPRsForFile(file),
				});
			}
		}

		// 移動（renamed）ファイルを処理
		for (const { from, to } of renamed) {
			if (!to.endsWith(".ts")) continue;

			const beforeContent = await this.getFileContentAtPath(from, "before");
			const afterContent = await this.getFileContent(to, "after");

			const beforeEnums = this.extractEnums(beforeContent);
			const afterEnums = this.extractEnums(afterContent);

			// Enum名でマッチングして moved を検出
			const allEnumNames = new Set([
				...beforeEnums.keys(),
				...afterEnums.keys(),
			]);

			for (const enumName of allEnumNames) {
				const beforeMembers = beforeEnums.get(enumName) || [];
				const afterMembers = afterEnums.get(enumName) || [];

				// 両方に存在する場合は moved
				if (beforeMembers.length > 0 && afterMembers.length > 0) {
					this.log(`Found Enum: ${enumName} (moved: ${from} -> ${to})`);

					changes.push({
						file: to,
						oldFile: from,
						enumName,
						changeType: "moved",
						members: {
							before: beforeMembers,
							after: afterMembers,
						},
						relatedPRs: [
							...this.getPRsForFile(from),
							...this.getPRsForFile(to),
						],
					});
				} else if (beforeMembers.length > 0) {
					// 旧ファイルにのみ存在（削除）
					this.log(`Found Enum: ${enumName} in ${from} (deleted)`);
					changes.push({
						file: from,
						enumName,
						changeType: "deleted",
						members: {
							before: beforeMembers,
							after: [],
						},
						relatedPRs: this.getPRsForFile(from),
					});
				} else if (afterMembers.length > 0) {
					// 新ファイルにのみ存在（追加）
					this.log(`Found Enum: ${enumName} in ${to} (added)`);
					changes.push({
						file: to,
						enumName,
						changeType: "added",
						members: {
							before: [],
							after: afterMembers,
						},
						relatedPRs: this.getPRsForFile(to),
					});
				}
			}
		}

		return changes;
	}

	/**
	 * 指定したパスでファイルの内容を取得（移動元ファイル用）
	 */
	private async getFileContentAtPath(
		filePath: string,
		timing: "before" | "after",
	): Promise<string | null> {
		if (timing === "before") {
			return this.repo.getFileContentBefore(
				filePath,
				this.options.days,
				this.options.branch,
			);
		} else {
			return this.repo.getCurrentFileContent(filePath);
		}
	}

	/**
	 * ファイルからすべてのEnumを抽出
	 * @returns Map<enumName, EnumMember[]>
	 */
	private extractEnums(content: string | null): Map<string, EnumMember[]> {
		const result = new Map<string, EnumMember[]>();
		if (!content) return result;

		try {
			const sourceFile = this.parseContent(content, "enum-extract.ts");
			const enums = sourceFile.getEnums();

			for (const enumDecl of enums) {
				const enumName = enumDecl.getName();
				const members = this.extractEnumMembers(enumDecl);
				result.set(enumName, members);
			}

			return result;
		} catch (error) {
			this.log(`Failed to parse enum content: ${error}`);
			return result;
		}
	}

	/**
	 * EnumDeclarationからメンバーを抽出
	 */
	private extractEnumMembers(enumDecl: EnumDeclaration): EnumMember[] {
		const members: EnumMember[] = [];

		for (const member of enumDecl.getMembers()) {
			const name = member.getName();
			const value = member.getValue(); // string | number | undefined

			members.push({
				name,
				value,
			});
		}

		return members;
	}
}
