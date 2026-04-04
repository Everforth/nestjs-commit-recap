import { type Decorator, Node, type PropertyDeclaration } from "ts-morph";
import type {
	EntityChange,
	EntityColumn,
	EntityForeignKey,
	EntityIndex,
	EntityRelation,
} from "../types/index.js";
import { classifyFile } from "../utils/file-classifier.js";
import { BaseAnalyzer } from "./base-analyzer.js";

export class EntityAnalyzer extends BaseAnalyzer {
	private readonly columnDecorators = [
		"Column",
		"PrimaryColumn",
		"PrimaryGeneratedColumn",
		"CreateDateColumn",
		"UpdateDateColumn",
		"DeleteDateColumn",
	];

	private readonly relationDecorators = [
		"ManyToOne",
		"OneToMany",
		"OneToOne",
		"ManyToMany",
	] as const;

	async analyze(): Promise<EntityChange[]> {
		const changes: EntityChange[] = [];

		const { added, deleted, modified, renamed } = await this.repo.getDiffFiles(
			this.options.days,
			this.options.branch,
		);

		// 通常のファイル（追加、削除、変更）を処理
		const entityFiles = [...added, ...deleted, ...modified].filter(
			(file) => classifyFile(file) === "entity",
		);

		for (const file of entityFiles) {
			const beforeContent = await this.getFileContent(file, "before");
			const afterContent = await this.getFileContent(file, "after");

			if (
				!this.isEntityFile(beforeContent) &&
				!this.isEntityFile(afterContent)
			) {
				continue;
			}

			const changeType = this.determineChangeType(beforeContent, afterContent);
			const className =
				this.extractEntityClassName(afterContent) ??
				this.extractEntityClassName(beforeContent) ??
				"Unknown";

			const beforeColumns = this.extractColumns(beforeContent);
			const afterColumns = this.extractColumns(afterContent);
			const beforeRelations = this.extractRelations(beforeContent);
			const afterRelations = this.extractRelations(afterContent);
			const beforeIndexes = this.extractIndexes(beforeContent);
			const afterIndexes = this.extractIndexes(afterContent);
			const beforeForeignKeys = this.extractForeignKeys(beforeContent);
			const afterForeignKeys = this.extractForeignKeys(afterContent);

			this.log(`Found entity: ${className} (${changeType})`);

			changes.push({
				file,
				className,
				changeType,
				columns: {
					before: beforeColumns,
					after: afterColumns,
				},
				relations: {
					before: beforeRelations,
					after: afterRelations,
				},
				indexes: {
					before: beforeIndexes,
					after: afterIndexes,
				},
				foreignKeys: {
					before: beforeForeignKeys,
					after: afterForeignKeys,
				},
				relatedPRs: this.getPRsForFile(file),
			});
		}

		// 移動（renamed）ファイルを処理
		for (const { from, to } of renamed) {
			if (classifyFile(to) !== "entity") continue;

			const beforeContent = await this.getFileContentAtPath(from, "before");
			const afterContent = await this.getFileContent(to, "after");

			if (
				!this.isEntityFile(beforeContent) &&
				!this.isEntityFile(afterContent)
			) {
				continue;
			}

			const className =
				this.extractEntityClassName(afterContent) ??
				this.extractEntityClassName(beforeContent) ??
				"Unknown";

			const beforeColumns = this.extractColumns(beforeContent);
			const afterColumns = this.extractColumns(afterContent);
			const beforeRelations = this.extractRelations(beforeContent);
			const afterRelations = this.extractRelations(afterContent);
			const beforeIndexes = this.extractIndexes(beforeContent);
			const afterIndexes = this.extractIndexes(afterContent);
			const beforeForeignKeys = this.extractForeignKeys(beforeContent);
			const afterForeignKeys = this.extractForeignKeys(afterContent);

			this.log(`Found entity: ${className} (moved: ${from} -> ${to})`);

			changes.push({
				file: to,
				oldFile: from,
				className,
				changeType: "moved",
				columns: {
					before: beforeColumns,
					after: afterColumns,
				},
				relations: {
					before: beforeRelations,
					after: afterRelations,
				},
				indexes: {
					before: beforeIndexes,
					after: afterIndexes,
				},
				foreignKeys: {
					before: beforeForeignKeys,
					after: afterForeignKeys,
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

	private isEntityFile(content: string | null): boolean {
		if (!content) return false;
		try {
			const sourceFile = this.parseContent(content, "entity-check.ts");
			const cls = this.findClassWithDecorator(sourceFile, "Entity");
			return cls !== undefined;
		} catch {
			return false;
		}
	}

	private extractEntityClassName(content: string | null): string | null {
		if (!content) return null;
		try {
			const sourceFile = this.parseContent(content, "entity-extract.ts");
			const cls = this.findClassWithDecorator(sourceFile, "Entity");
			return cls?.getName() ?? null;
		} catch {
			return null;
		}
	}

	private extractColumns(content: string | null): EntityColumn[] {
		if (!content) return [];

		try {
			const sourceFile = this.parseContent(content, "entity-columns.ts");
			const cls = this.findClassWithDecorator(sourceFile, "Entity");
			if (!cls) return [];

			const columns: EntityColumn[] = [];
			const properties = cls.getProperties();

			for (const prop of properties) {
				const columnInfo = this.extractColumnFromProperty(prop);
				if (columnInfo) {
					columns.push(columnInfo);
				}
			}

			return columns;
		} catch {
			return [];
		}
	}

	private extractColumnFromProperty(
		prop: PropertyDeclaration,
	): EntityColumn | null {
		const decorators = prop.getDecorators();
		const columnDecorator = decorators.find((d) =>
			this.columnDecorators.includes(d.getName()),
		);

		if (!columnDecorator) return null;

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

		// Also check decorator options for nullable
		const args = columnDecorator.getArguments();
		if (args.length > 0) {
			const firstArg = args[0];
			if (Node.isObjectLiteralExpression(firstArg)) {
				for (const propAssign of firstArg.getProperties()) {
					if (
						Node.isPropertyAssignment(propAssign) &&
						propAssign.getName() === "nullable"
					) {
						const init = propAssign.getInitializer();
						if (init && init.getText() === "true") {
							nullable = true;
						}
					}
				}
			}
		}

		return { name, type, nullable };
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

	private extractRelations(content: string | null): EntityRelation[] {
		if (!content) return [];

		try {
			const sourceFile = this.parseContent(content, "entity-relations.ts");
			const cls = this.findClassWithDecorator(sourceFile, "Entity");
			if (!cls) return [];

			const relations: EntityRelation[] = [];
			const properties = cls.getProperties();

			for (const prop of properties) {
				const relationInfo = this.extractRelationFromProperty(prop);
				if (relationInfo) {
					relations.push(relationInfo);
				}
			}

			return relations;
		} catch {
			return [];
		}
	}

	private extractRelationFromProperty(
		prop: PropertyDeclaration,
	): EntityRelation | null {
		const decorators = prop.getDecorators();
		const relationDecorator = decorators.find((d) =>
			this.relationDecorators.includes(
				d.getName() as (typeof this.relationDecorators)[number],
			),
		);

		if (!relationDecorator) return null;

		const name = prop.getName();
		const relationType =
			relationDecorator.getName() as EntityRelation["relationType"];

		// Extract target entity from decorator argument
		// e.g., @ManyToOne(() => User) -> User
		let targetEntity = "unknown";
		const args = relationDecorator.getArguments();
		if (args.length > 0) {
			const firstArg = args[0];
			// Arrow function: () => User
			if (Node.isArrowFunction(firstArg)) {
				const body = firstArg.getBody();
				if (Node.isIdentifier(body)) {
					targetEntity = body.getText();
				}
			}
			// Direct identifier: User
			if (Node.isIdentifier(firstArg)) {
				targetEntity = firstArg.getText();
			}
		}

		// Get type from property type node as fallback
		if (targetEntity === "unknown") {
			const typeNode = prop.getTypeNode();
			if (typeNode) {
				let typeText = typeNode.getText();
				// Handle array types: User[] -> User
				typeText = typeText.replace(/\[\]$/, "");
				// Handle Promise types: Promise<User> -> User
				if (typeText.startsWith("Promise<") && typeText.endsWith(">")) {
					typeText = typeText.slice(8, -1);
				}
				targetEntity = typeText;
			}
		}

		return { name, relationType, targetEntity };
	}

	/**
	 * エンティティクラスからインデックス情報を抽出
	 * @Index デコレータを解析
	 */
	private extractIndexes(content: string | null): EntityIndex[] {
		if (!content) return [];

		try {
			const sourceFile = this.parseContent(content, "entity-indexes.ts");
			const cls = this.findClassWithDecorator(sourceFile, "Entity");
			if (!cls) return [];

			const indexes: EntityIndex[] = [];
			const decorators = cls.getDecorators();

			// クラスレベルの @Index デコレータ
			for (const decorator of decorators) {
				if (decorator.getName() === "Index") {
					const indexInfo = this.extractIndexFromDecorator(decorator);
					if (indexInfo) {
						indexes.push(indexInfo);
					}
				}
			}

			return indexes;
		} catch {
			return [];
		}
	}

	/**
	 * @Index デコレータから情報を抽出
	 */
	private extractIndexFromDecorator(decorator: Decorator): EntityIndex | null {
		const args = decorator.getArguments();
		if (args.length === 0) return null;

		let columns: string[] = [];
		let unique = false;
		let name: string | undefined;

		// 第1引数: カラム名の配列または文字列
		const firstArg = args[0];
		if (Node.isArrayLiteralExpression(firstArg)) {
			columns = firstArg.getElements().map((el) => {
				const text = el.getText().replace(/['"]/g, "");
				return text;
			});
		} else if (Node.isStringLiteral(firstArg)) {
			columns = [firstArg.getLiteralValue()];
		}

		// 第2引数: オプション { unique: boolean, name: string }
		if (args.length > 1 && Node.isObjectLiteralExpression(args[1])) {
			const options = args[1];
			for (const prop of options.getProperties()) {
				if (Node.isPropertyAssignment(prop)) {
					const propName = prop.getName();
					const init = prop.getInitializer();
					if (!init) continue;

					if (propName === "unique" && init.getText() === "true") {
						unique = true;
					}
					if (propName === "name" && Node.isStringLiteral(init)) {
						name = init.getLiteralValue();
					}
				}
			}
		}

		if (columns.length === 0) return null;

		return { columns, unique, name };
	}

	/**
	 * エンティティクラスから外部キー情報を抽出
	 * リレーションデコレータのオプションから onDelete/onUpdate を取得
	 */
	private extractForeignKeys(content: string | null): EntityForeignKey[] {
		if (!content) return [];

		try {
			const sourceFile = this.parseContent(content, "entity-fks.ts");
			const cls = this.findClassWithDecorator(sourceFile, "Entity");
			if (!cls) return [];

			const foreignKeys: EntityForeignKey[] = [];
			const properties = cls.getProperties();

			for (const prop of properties) {
				const fkInfo = this.extractForeignKeyFromProperty(prop);
				if (fkInfo) {
					foreignKeys.push(fkInfo);
				}
			}

			return foreignKeys;
		} catch {
			return [];
		}
	}

	/**
	 * プロパティから外部キー情報を抽出
	 * ManyToOne, OneToOne などのリレーションから FK 制約を取得
	 */
	private extractForeignKeyFromProperty(
		prop: PropertyDeclaration,
	): EntityForeignKey | null {
		const decorators = prop.getDecorators();
		const relationDecorator = decorators.find((d) =>
			this.relationDecorators.includes(
				d.getName() as (typeof this.relationDecorators)[number],
			),
		);

		if (!relationDecorator) return null;

		// ManyToOne と OneToOne のみが外部キーを持つ（N側）
		const relationType =
			relationDecorator.getName() as EntityForeignKey["relationType"];
		if (relationType !== "ManyToOne" && relationType !== "OneToOne") {
			return null;
		}

		const relationName = prop.getName();

		// ターゲットエンティティを取得
		let targetEntity = "unknown";
		const args = relationDecorator.getArguments();
		if (args.length > 0) {
			const firstArg = args[0];
			if (Node.isArrowFunction(firstArg)) {
				const body = firstArg.getBody();
				if (Node.isIdentifier(body)) {
					targetEntity = body.getText();
				}
			}
			if (Node.isIdentifier(firstArg)) {
				targetEntity = firstArg.getText();
			}
		}

		// オプションから onDelete, onUpdate を取得
		let onDelete: string | undefined;
		let onUpdate: string | undefined;

		if (args.length > 1 && Node.isObjectLiteralExpression(args[1])) {
			const options = args[1];
			for (const propAssign of options.getProperties()) {
				if (Node.isPropertyAssignment(propAssign)) {
					const propName = propAssign.getName();
					const init = propAssign.getInitializer();
					if (!init) continue;

					if (propName === "onDelete" && Node.isStringLiteral(init)) {
						onDelete = init.getLiteralValue();
					}
					if (propName === "onUpdate" && Node.isStringLiteral(init)) {
						onUpdate = init.getLiteralValue();
					}
				}
			}
		}

		return {
			relationName,
			relationType,
			targetEntity,
			onDelete,
			onUpdate,
		};
	}
}
