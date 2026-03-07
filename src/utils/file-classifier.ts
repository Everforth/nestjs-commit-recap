import type { MiddlewareType } from "../types/index.js";

export type FileType =
	| "entity"
	| "dto"
	| "module"
	| "controller"
	| "service"
	| "repository"
	| "middleware"
	| "guard"
	| "interceptor"
	| "pipe"
	| "filter"
	| "other";

export function classifyFile(filePath: string): FileType {
	if (!filePath.endsWith(".ts")) {
		return "other";
	}

	const fileName = filePath.split("/").pop() ?? "";

	if (fileName.endsWith(".entity.ts")) {
		return "entity";
	}
	if (fileName.endsWith(".dto.ts")) {
		return "dto";
	}
	if (fileName.endsWith(".module.ts")) {
		return "module";
	}
	if (fileName.endsWith(".controller.ts")) {
		return "controller";
	}
	if (fileName.endsWith(".service.ts")) {
		return "service";
	}
	if (fileName.endsWith(".repository.ts")) {
		return "repository";
	}
	if (fileName.endsWith(".middleware.ts")) {
		return "middleware";
	}
	if (fileName.endsWith(".guard.ts")) {
		return "guard";
	}
	if (fileName.endsWith(".interceptor.ts")) {
		return "interceptor";
	}
	if (fileName.endsWith(".pipe.ts")) {
		return "pipe";
	}
	if (fileName.endsWith(".filter.ts")) {
		return "filter";
	}

	return "other";
}

export function isNestJSFile(filePath: string): boolean {
	const type = classifyFile(filePath);
	return type !== "other";
}

export function isProviderFile(filePath: string): boolean {
	const type = classifyFile(filePath);
	return type === "service" || type === "repository";
}

export function isMiddlewareTypeFile(filePath: string): boolean {
	const type = classifyFile(filePath);
	return ["middleware", "guard", "interceptor", "pipe", "filter"].includes(
		type,
	);
}

export function fileTypeToMiddlewareType(
	fileType: FileType,
): MiddlewareType | null {
	const mapping: Partial<Record<FileType, MiddlewareType>> = {
		middleware: "middleware",
		guard: "guard",
		interceptor: "interceptor",
		pipe: "pipe",
		filter: "filter",
	};
	return mapping[fileType] ?? null;
}
