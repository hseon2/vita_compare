import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";

export function generateStatusQueryKey(sessionId: string) {
  return ["generateStatus", sessionId] as const;
}

export function useGenerateStatus(sessionId: string | undefined) {
  return useQuery({
    queryKey: generateStatusQueryKey(sessionId ?? ""),
    queryFn: () => api.getGenerateStatus(sessionId!),
    enabled: !!sessionId,
    // 새로고침 중간에 진행 중이던 생성이 있어도 마운트 시 한 번 확인 후 필요하면 계속 폴링
    refetchInterval: (query) => (query.state.data?.state === "running" ? 1000 : false),
  });
}

export function useStartGenerate(sessionId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.startGenerate(sessionId),
    onSuccess: () => qc.invalidateQueries({ queryKey: generateStatusQueryKey(sessionId) }),
  });
}
