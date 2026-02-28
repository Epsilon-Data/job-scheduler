// API Configuration
// In production, these should be set via environment variables
export const API_CONFIG = {
  ZKP_SERVICE_URL: import.meta.env.VITE_ZKP_SERVICE_URL || "/api/zkp",
  TRUST_CENTER_URL: import.meta.env.VITE_TRUST_CENTER_URL || "http://localhost:5173",
} as const;
