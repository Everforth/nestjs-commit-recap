import { defineConfig } from "tsup";

export default defineConfig({
	entry: [
		"src/index.ts",
		"src/design-decisions/index.ts",
		"src/design-decisions/collect-cli.ts",
		"src/design-decisions/generate-cli.ts",
	],
	format: ["esm"],
	dts: true,
	clean: true,
	target: "node18",
	banner: {
		js: "#!/usr/bin/env node",
	},
});
