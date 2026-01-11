// API Configuration
// In production, these should be set via environment variables
export const API_CONFIG = {
  ZKP_SERVICE_URL: import.meta.env.VITE_ZKP_SERVICE_URL || "/api/zkp",
} as const;
