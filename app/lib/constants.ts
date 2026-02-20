export const SERVICE = {
  name: process.env.SERVICE_NAME || "",
  description: process.env.SERVICE_DESCRIPTION || "",
  url: process.env.SERVICE_URL || "",
} as const;

export const MAX_REGENERATIONS = 3;
export const SEARCH_RESULTS_COUNT = 5;
