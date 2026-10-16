// API Configuration
// In production, these should be set via environment variables
export const API_CONFIG = {
  ZKP_SERVICE_URL: import.meta.env.VITE_ZKP_SERVICE_URL || "/api/zkp",
  TRUST_CENTER_URL: import.meta.env.VITE_TRUST_CENTER_URL || "https://trust.epsilon-data.org",
} as const;

// Output-release gate
export const RELEASE_PENDING_BANNER =
  "This job has finished. Its results, error messages and logs are held until a reviewer approves their release.";
export const RELEASE_WITHHELD_TITLE = "Results withheld by the reviewer";
export const OWN_JOB_REVIEW_MESSAGE = "You submitted this job, so you can't review it";
export const AI_ADVISORY_LABEL = "Advisory, from a dummy-data run; does not decide release";
export const NO_PROJECTS_MESSAGE = "No projects are assigned to you. Ask the Epsilon administrator.";
export const REVIEWER_NOT_APPROVED_MESSAGE = "Your reviewer account is not approved. Ask the Epsilon administrator.";
