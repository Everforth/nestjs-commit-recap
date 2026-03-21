import type { WeeklyAnalysisResult } from "../types/index.js";
import type { AIAnalysisResult, AIReporterOptions } from "./types.js";

export class AIReporter {
	format(result: AIAnalysisResult, options: AIReporterOptions): string {
		const lines: string[] = [];

		// ヘッダー
		lines.push("# キャッチアップ");
		lines.push("");
		lines.push(`- **生成日時**: ${new Date().toLocaleString("ja-JP")}`);
		lines.push(`- **対象期間**: ${options.startDate} ~ ${options.endDate}`);
		lines.push("");

		// 変更サマリー
		if (result.summary.rawResponse) {
			lines.push(result.summary.rawResponse);
		} else {
			lines.push("_変更サマリーの生成に失敗しました_");
		}
		lines.push("");

		// 区切り線
		lines.push("---");
		lines.push("");

		// 設計レビュー候補
		if (result.review.rawResponse) {
			lines.push(result.review.rawResponse);
		} else {
			lines.push("_設計レビューの生成に失敗しました_");
		}
		lines.push("");

		return lines.join("\n");
	}

	/**
	 * 週次AI分析レポートをフォーマット
	 */
	formatWeekly(result: WeeklyAnalysisResult, aiAnalysis: string): string {
		const lines: string[] = [];

		lines.push("# 週次設計分析レポート");
		lines.push("");
		lines.push(`生成日時: ${new Date().toISOString()}`);
		lines.push(`対象期間: ${result.startDate} ~ ${result.endDate}`);
		lines.push("");
		lines.push("---");
		lines.push("");
		lines.push(aiAnalysis);
		lines.push("");
		lines.push("---");
		lines.push("");
		lines.push("生成ツール: commit-recap (週次分析モード)");

		return lines.join("\n");
	}
}
