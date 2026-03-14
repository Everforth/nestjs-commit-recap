export interface AIAnalysisOptions {
	apiKey?: string;
	model?: string;
	maxTokens?: number;
	timeout?: number;
}

export interface ChangeSummary {
	rawResponse: string;
}

export interface DesignReview {
	rawResponse: string;
}

export interface AIAnalysisResult {
	summary: ChangeSummary;
	review: DesignReview;
	error?: string;
}

export interface AIReporterOptions {
	startDate: string;
	endDate: string;
}
