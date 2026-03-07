import type { PropertyDeclaration } from "ts-morph";
import type { DTOChange, DTOProperty } from "../types/index.js";
import { classifyFile } from "../utils/file-classifier.js";
import { BaseAnalyzer } from "./base-analyzer.js";

export class DTOAnalyzer extends BaseAnalyzer {
	private readonly validationDecorators = [
		"IsString",
		"IsNumber",
		"IsBoolean",
		"IsEmail",
		"IsUrl",
		"IsDate",
		"IsArray",
		"IsEnum",
		"IsOptional",
		"IsNotEmpty",
		"MinLength",
		"MaxLength",
		"Min",
		"Max",
		"Matches",
		"ValidateNested",
		"Type",
		"ArrayMinSize",
		"ArrayMaxSize",
		"IsInt",
		"IsPositive",
		"IsNegative",
		"IsUUID",
		"IsObject",
		"IsNotEmptyObject",
		"IsDefined",
		"IsIn",
		"IsNotIn",
		"Length",
		"ArrayNotEmpty",
		"ArrayUnique",
	];

	async analyze(): Promise<DTOChange[]> {
		const changes: DTOChange[] = [];

		const { added, deleted, modified, renamed } = await this.repo.getDiffFiles(
			this.options.days,
			this.options.branch,
		);

		// 通常のファイル（追加、削除、変更）を処理
		const dtoFiles = [...added, ...deleted, ...modified].filter(
			(file) => classifyFile(file) === "dto",
		);

		for (const file of dtoFiles) {
			const beforeContent = await this.getFileContent(file, "before");
			const afterContent = await this.getFileContent(file, "after");

			if (!this.isDTOFile(beforeContent) && !this.isDTOFile(afterContent)) {
				continue;
			}

			const changeType = this.determineChangeType(beforeContent, afterContent);
			const className =
				this.extractDTOClassName(afterContent) ??
				this.extractDTOClassName(beforeContent) ??
				"Unknown";

			const beforeProperties = this.extractProperties(beforeContent);
			const afterProperties = this.extractProperties(afterContent);

			this.log(`Found DTO: ${className} (${changeType})`);

			changes.push({
				file,
				className,
				changeType,
				properties: {
					before: beforeProperties,
					after: afterProperties,
				},
				relatedPRs: this.getPRsForFile(file),
			});
		}

		// 移動（renamed）ファイルを処理
		for (const { from, to } of renamed) {
			if (classifyFile(to) !== "dto") continue;

			const beforeContent = await this.getFileContentAtPath(from, "before");
			const afterContent = await this.getFileContent(to, "after");

			if (!this.isDTOFile(beforeContent) && !this.isDTOFile(afterContent)) {
				continue;
			}

			const className =
				this.extractDTOClassName(afterContent) ??
				this.extractDTOClassName(beforeContent) ??
				"Unknown";

			const beforeProperties = this.extractProperties(beforeContent);
			const afterProperties = this.extractProperties(afterContent);

			this.log(`Found DTO: ${className} (moved: ${from} -> ${to})`);

			changes.push({
				file: to,
				oldFile: from,
				className,
				changeType: "moved",
				properties: {
					before: beforeProperties,
					after: afterProperties,
				},
				relatedPRs: [...this.getPRsForFile(from), ...this.getPRsForFile(to)],
			});
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

	private isDTOFile(content: string | null): boolean {
		if (!content) return false;
		try {
			const sourceFile = this.parseContent(content, "dto-check.ts");
			const classes = sourceFile.getClasses();

			// DTOファイルは class-validator のデコレータを持つクラスを含む
			for (const cls of classes) {
				const properties = cls.getProperties();
				for (const prop of properties) {
					const decorators = prop.getDecorators();
					const hasValidationDecorator = decorators.some((d) =>
						this.validationDecorators.includes(d.getName()),
					);
					if (hasValidationDecorator) {
						return true;
					}
				}
			}

			return false;
		} catch {
			return false;
		}
	}

	private extractDTOClassName(content: string | null): string | null {
		if (!content) return null;
		try {
			const sourceFile = this.parseContent(content, "dto-extract.ts");
			const classes = sourceFile.getClasses();

			// validation decoratorを持つクラスを探す
			for (const cls of classes) {
				const properties = cls.getProperties();
				for (const prop of properties) {
					const decorators = prop.getDecorators();
					const hasValidationDecorator = decorators.some((d) =>
						this.validationDecorators.includes(d.getName()),
					);
					if (hasValidationDecorator) {
						return cls.getName() ?? null;
					}
				}
			}

			return null;
		} catch {
			return null;
		}
	}

	private extractProperties(content: string | null): DTOProperty[] {
		if (!content) return [];

		try {
			const sourceFile = this.parseContent(content, "dto-properties.ts");
			const classes = sourceFile.getClasses();

			// validation decoratorを持つクラスを探す
			for (const cls of classes) {
				const hasValidationDecorator = cls.getProperties().some((prop) => {
					const decorators = prop.getDecorators();
					return decorators.some((d) =>
						this.validationDecorators.includes(d.getName()),
					);
				});

				if (hasValidationDecorator) {
					return this.extractPropertiesFromClass(cls.getProperties());
				}
			}

			return [];
		} catch {
			return [];
		}
	}

	private extractPropertiesFromClass(
		properties: PropertyDeclaration[],
	): DTOProperty[] {
		const dtoProps: DTOProperty[] = [];

		for (const prop of properties) {
			const decorators = prop.getDecorators();
			const validationDecorators = decorators.filter((d) =>
				this.validationDecorators.includes(d.getName()),
			);

			// validation decoratorを持つプロパティのみを対象とする
			if (validationDecorators.length === 0) continue;

			const name = prop.getName();

			// 明示的な型注釈を優先、なければ推論型を使用
			let type = prop.getTypeNode()?.getText();
			if (!type) {
				type = prop.getType().getText() || "unknown";
			}
			type = this.normalizeType(type);

			// Check for nullable from type
			const hasQuestionMark = prop.hasQuestionToken();
			let nullable = hasQuestionMark;

			// Check if type includes null union
			if (type.includes("| null") || type.includes("null |")) {
				nullable = true;
				type = type
					.replace(/\s*\|\s*null/g, "")
					.replace(/null\s*\|\s*/g, "")
					.trim();
			}

			// Extract decorator names with arguments
			const decoratorStrings = validationDecorators.map((d) => {
				const name = d.getName();
				const args = d.getArguments();
				if (args.length > 0) {
					const argTexts = args.map((arg) => arg.getText()).join(", ");
					return `${name}(${argTexts})`;
				}
				return name;
			});

			dtoProps.push({
				name,
				type,
				nullable,
				decorators: decoratorStrings,
			});
		}

		return dtoProps;
	}

	/**
	 * 型文字列を正規化する
	 * - import() ラッパー除去
	 * - リテラル型の正規化
	 * - Union型のソート
	 */
	private normalizeType(rawType: string): string {
		let type = rawType;

		// import() ラッパー除去: import("path").TypeName → TypeName
		type = type.replace(/import\([^)]+\)\./g, "");

		// リテラル型の正規化: "active" → string, 123 → number
		if (/^["'`].*["'`]$/.test(type)) type = "string";
		if (/^\d+$/.test(type)) type = "number";

		// Union型のソート: B | A → A | B
		if (type.includes("|")) {
			type = type
				.split("|")
				.map((p) => p.trim())
				.sort()
				.join(" | ");
		}

		return type.trim();
	}
}
