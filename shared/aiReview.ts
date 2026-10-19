// When the AI review itself failed, the coordinator still stores a decision: ai_error, or (from the analyzer's
// fallback) ai_rejected with a made-up confidence and reasoning "Analysis failed due to error: ...".
// Neither is a verdict on the code.
const FAILED_REASONING_PREFIXES = ["Analysis failed due to error", "AI analysis error"];

export const AI_REVIEW_UNAVAILABLE = "AI review unavailable";

export function isAiReviewUnavailable(decision: string | null | undefined, reasoning: string | null | undefined): boolean {
  if (decision === "ai_error") return true;
  return !!reasoning && FAILED_REASONING_PREFIXES.some((prefix) => reasoning.trimStart().startsWith(prefix));
}
