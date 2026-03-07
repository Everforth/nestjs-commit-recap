import { Node } from "ts-morph";
import type { ModuleChange, ModuleConfig } from "../types/index.js";
import { classifyFile } from "../utils/file-classifier.js";
import { BaseAnalyzer } from "./base-analyzer.js";

export class ModuleAnalyzer extends BaseAnalyzer {
	async analyze(): Promise<ModuleChange[]> {
		const changes: ModuleChange[] = [];

		const { added, deleted, modified } = await this.repo.getDiffFiles(
			this.options.days,
			this.options.branch,
		);

		const moduleFiles = [...added, ...deleted, ...modified].filter(
			(file) => classifyFile(file) === "module",
		);

		for (const file of moduleFiles) {
			const beforeContent = await this.getFileContent(file, "before");
			const afterContent = await this.getFileContent(file, "after");

			if (
				!this.isModuleFile(beforeContent) &&
				!this.isModuleFile(afterContent)
			) {
				continue;
			}

			const changeType = this.determineChangeType(beforeContent, afterContent);
			const className =
				this.extractModuleClassName(afterContent) ??
				this.extractModuleClassName(beforeContent) ??
				"Unknown";

			const beforeConfig = this.extractModuleConfig(beforeContent);
			const afterConfig = this.extractModuleConfig(afterContent);

			this.log(`Found module: ${className} (${changeType})`);

			changes.push({
				file,
				className,
				changeType,
				config: {
					before: beforeConfig,
					after: afterConfig,
				},
				relatedPRs: this.getPRsForFile(file),
			});
		}

		return changes;
	}

	private isModuleFile(content: string | null): boolean {
		if (!content) return false;
		try {
			const sourceFile = this.parseContent(content, "module-check.ts");
			const cls = this.findClassWithDecorator(sourceFile, "Module");
			return cls !== undefined;
		} catch {
			return false;
		}
	}

	private extractModuleClassName(content: string | null): string | null {
		if (!content) return null;
		try {
			const sourceFile = this.parseContent(content, "module-extract.ts");
			const cls = this.findClassWithDecorator(sourceFile, "Module");
			return cls?.getName() ?? null;
		} catch {
			return null;
		}
	}

	private extractModuleConfig(content: string | null): ModuleConfig {
		const emptyConfig: ModuleConfig = {
			imports: [],
			providers: [],
			exports: [],
			controllers: [],
		};

		if (!content) return emptyConfig;

		try {
			const sourceFile = this.parseContent(content, "module-config.ts");
			const cls = this.findClassWithDecorator(sourceFile, "Module");
			if (!cls) return emptyConfig;

			const decorator = this.getDecorator(cls, "Module");
			if (!decorator) return emptyConfig;

			const args = decorator.getArguments();
			if (args.length === 0) return emptyConfig;

			const firstArg = args[0];
			if (!Node.isObjectLiteralExpression(firstArg)) return emptyConfig;

			return {
				imports: this.extractArrayProperty(firstArg, "imports"),
				providers: this.extractArrayProperty(firstArg, "providers"),
				exports: this.extractArrayProperty(firstArg, "exports"),
				controllers: this.extractArrayProperty(firstArg, "controllers"),
			};
		} catch {
			return emptyConfig;
		}
	}

	private extractArrayProperty(
		objLiteral: import("ts-morph").ObjectLiteralExpression,
		propertyName: string,
	): Array<{ name: string }> {
		const items: Array<{ name: string }> = [];

		for (const prop of objLiteral.getProperties()) {
			if (!Node.isPropertyAssignment(prop)) continue;
			if (prop.getName() !== propertyName) continue;

			const init = prop.getInitializer();
			if (!init || !Node.isArrayLiteralExpression(init)) continue;

			for (const element of init.getElements()) {
				const name = this.extractItemName(element);
				if (name) {
					items.push({ name });
				}
			}
		}

		return items;
	}

	private extractItemName(node: import("ts-morph").Node): string | null {
		// Identifier: SomeModule
		if (Node.isIdentifier(node)) {
			return node.getText();
		}

		// CallExpression: TypeOrmModule.forFeature([...])
		if (Node.isCallExpression(node)) {
			const expression = node.getExpression();
			// PropertyAccessExpression: TypeOrmModule.forFeature
			if (Node.isPropertyAccessExpression(expression)) {
				const objExpr = expression.getExpression();
				if (Node.isIdentifier(objExpr)) {
					return objExpr.getText();
				}
			}
			// Direct identifier call: forwardRef(() => ...)
			if (Node.isIdentifier(expression)) {
				return expression.getText();
			}
		}

		// PropertyAccessExpression without call: ModuleName.SomeThing
		if (Node.isPropertyAccessExpression(node)) {
			const objExpr = node.getExpression();
			if (Node.isIdentifier(objExpr)) {
				return objExpr.getText();
			}
		}

		return null;
	}
}
