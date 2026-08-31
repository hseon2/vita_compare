import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import type { BodyCompRowIn } from "../api/types";

export function bodyCompQueryKey(sessionId: string) {
  return ["bodyComp", sessionId] as const;
}

export function useBodyComp(sessionId: string | undefined) {
  return useQuery({
    queryKey: bodyCompQueryKey(sessionId ?? ""),
    queryFn: () => api.getBodyComp(sessionId!),
    enabled: !!sessionId,
  });
}

export function useSaveBodyComp(sessionId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (rows: BodyCompRowIn[]) => api.saveBodyComp(sessionId, rows),
    onSuccess: () => qc.invalidateQueries({ queryKey: bodyCompQueryKey(sessionId) }),
  });
}
