import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { normalizeJobRequest } from "./api-utils";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const res = await fetch(url, {
    method,
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";

/**
 * Build URL with query parameters from query key
 * Supports: ["/api/endpoint"] or ["/api/endpoint", { param1: value1, param2: value2 }]
 */
function buildUrlFromQueryKey(queryKey: readonly unknown[]): string {
  const baseUrl = queryKey[0] as string;
  const params = queryKey[1] as Record<string, unknown> | undefined;

  if (!params || typeof params !== "object") {
    return baseUrl;
  }

  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      searchParams.append(key, String(value));
    }
  }

  const queryString = searchParams.toString();
  return queryString ? `${baseUrl}?${queryString}` : baseUrl;
}

export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const url = buildUrlFromQueryKey(queryKey);
    const res = await fetch(url, {
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    const data = await res.json();

    // Normalize job-related responses (snake_case to camelCase mapping)
    const baseUrl = queryKey[0] as string;
    if (baseUrl.match(/^\/api\/jobs\/[^/]+$/)) {
      // Single job request - normalize the job object
      return normalizeJobRequest(data);
    }
    if (baseUrl === "/api/jobs" || baseUrl.match(/^\/api\/workspaces\/[^/]+\/jobs$/)) {
      // Job list response - normalize each job in the list
      if (Array.isArray(data)) {
        return data.map(job => normalizeJobRequest(job));
      }
      // Paginated response with jobs array
      if (data && Array.isArray(data.jobs)) {
        return {
          ...data,
          jobs: data.jobs.map((job: Record<string, unknown>) => normalizeJobRequest(job)),
        };
      }
    }

    return data;
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
