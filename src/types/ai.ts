export interface AIMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AICompleteOptions {
  messages: AIMessage[];
  maxTokens?: number;
  temperature?: number;
  responseFormat?: "text" | "json";
}

export interface AIProvider {
  readonly name: "claude" | "openai";
  complete(options: AICompleteOptions): Promise<string>;
  isConfigured(): Promise<boolean>;
}

export interface ResumeAnalysis {
  overallScore: number;
  formattingScore: number;
  contentScore: number;
  keywordScore: number;
  atsScore: number;
  summary: string;
  strengths: string[];
  improvements: string[];
  toRemove: string[];
  toAdd: string[];
  detailedFeedback: string;
}

export interface PreferenceQuestion {
  id: string;
  type: "text" | "select" | "multiselect" | "range";
  question: string;
  options?: string[];
  min?: number;
  max?: number;
  defaultValue?: string | string[] | number;
  fieldMapping: string;
}
