import {
	type ClassDeclaration,
	type Decorator,
	Node,
	Project,
	type SourceFile,
} from "ts-morph";
import type { PRFetcher, PRInfo } from "../git/pr-fetcher.js";
import type { GitRepository } from "../git/repository.js";
import type { AnalyzerOptions, ChangeType } from "../types/index.js";

// Singleton Project instance for parsing
const project = new Project({
	compilerOptions: {
		allowJs: true,
		skipLibCheck: true,
	},
	useInMemoryFileSystem: true,
});

export abstract class BaseAnalyzer {
	protected repo: GitRepository;
	protected prFetcher: PRFetcher;
	protected options: AnalyzerOptions;
	protected fileToPRs: Map<string, PRInfo[]> = new Map();

	constructor(
		repo: GitRepository,
		prFetcher: PRFetcher,
		options: AnalyzerOptions,
	) {
		this.repo = repo;
		this.prFetcher = prFetcher;
		this.options = options;
	}

	/**
	 * Parse content string into AST SourceFile
	 */
	protected parseContent(content: string, fileName = "temp.ts"): SourceFile {
		// Create or update a virtual file
		const existingFile = project.getSourceFile(fileName);
		if (existingFile) {
			existingFile.replaceWithText(content);
			return existingFile;
		}
		return project.createSourceFile(fileName, content, { overwrite: true });
	}

	/**
	 * Find a class that has a specific decorator
	 */
	protected findClassWithDecorator(
		sourceFile: SourceFile,
		decoratorName: string,
	): ClassDeclaration | undefined {
		const classes = sourceFile.getClasses();
		return classes.find((cls) => {
			const decorators = cls.getDecorators();
			return decorators.some((d) => d.getName() === decoratorName);
		});
	}

	/**
	 * Find all classes that have a specific decorator
	 */
	protected findAllClassesWithDecorator(
		sourceFile: SourceFile,
		decoratorName: string,
	): ClassDeclaration[] {
		const classes = sourceFile.getClasses();
		return classes.filter((cls) => {
			const decorators = cls.getDecorators();
			return decorators.some((d) => d.getName() === decoratorName);
		});
	}

	/**
	 * Get a specific decorator from a node
	 */
	protected getDecorator(
		node: ClassDeclaration,
		decoratorName: string,
	): Decorator | undefined {
		return node.getDecorators().find((d) => d.getName() === decoratorName);
	}

	/**
	 * Get the first argument of a decorator as a string
	 */
	protected getDecoratorStringArgument(decorator: Decorator): string | null {
		const args = decorator.getArguments();
		if (args.length === 0) return null;

		const firstArg = args[0];
		const text = firstArg.getText();

		// Remove quotes from string literal
		if (text.startsWith("'") || text.startsWith('"') || text.startsWith("`")) {
			return text.slice(1, -1);
		}

		return null;
	}

	/**
	 * Get decorator argument as object literal properties
	 */
	protected getDecoratorObjectArgument(
		decorator: Decorator,
	): Map<string, string> | null {
		const args = decorator.getArguments();
		if (args.length === 0) return null;

		const firstArg = args[0];
		if (!Node.isObjectLiteralExpression(firstArg)) return null;

		const result = new Map<string, string>();
		for (const prop of firstArg.getProperties()) {
			if (Node.isPropertyAssignment(prop)) {
				const name = prop.getName();
				const value = prop.getInitializer()?.getText() ?? "";
				result.set(name, value);
			}
		}
		return result;
	}

	/**
	 * Check if a class implements a specific interface
	 */
	protected classImplements(
		cls: ClassDeclaration,
		interfaceName: string,
	): boolean {
		const implementsClause = cls.getImplements();
		return implementsClause.some((impl) => impl.getText() === interfaceName);
	}

	setFileToPRs(map: Map<string, PRInfo[]>): void {
		this.fileToPRs = map;
	}

	getPRsForFile(file: string): PRInfo[] {
		return this.fileToPRs.get(file) ?? [];
	}

	protected async getFileContent(
		file: string,
		position: "before" | "after",
	): Promise<string | null> {
		if (position === "before") {
			return this.repo.getFileContentBefore(
				file,
				this.options.days,
				this.options.branch,
			);
		}
		return this.repo.getCurrentFileContent(file);
	}

	protected determineChangeType(
		beforeContent: string | null,
		afterContent: string | null,
	): ChangeType {
		if (!beforeContent && afterContent) {
			return "added";
		}
		if (beforeContent && !afterContent) {
			return "deleted";
		}
		return "modified";
	}

	protected extractClassName(
		content: string,
		decoratorPattern: RegExp,
	): string | null {
		const classMatch = content.match(/export\s+class\s+(\w+)/);
		if (classMatch && decoratorPattern.test(content)) {
			return classMatch[1];
		}
		return null;
	}

	protected log(message: string): void {
		if (this.options.verbose) {
			console.log(`[${this.constructor.name}] ${message}`);
		}
	}

	abstract analyze(): Promise<unknown>;
}
