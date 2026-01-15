import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

interface GitHubStatus {
  connected: boolean;
  username: string | null;
}

export function useGitHub() {
  const queryClient = useQueryClient();

  const { data: status, isLoading } = useQuery<GitHubStatus>({
    queryKey: ["/api/github/status"],
    staleTime: 30000, // 30 seconds
  });

  const disconnectMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/github/disconnect");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/github/status"] });
    },
  });

  const connect = (returnTo?: string) => {
    const url = returnTo
      ? `/api/github/connect?returnTo=${encodeURIComponent(returnTo)}`
      : "/api/github/connect";
    window.location.href = url;
  };

  return {
    isConnected: status?.connected ?? false,
    username: status?.username ?? null,
    isLoading,
    connect,
    disconnect: disconnectMutation.mutate,
    isDisconnecting: disconnectMutation.isPending,
  };
}
