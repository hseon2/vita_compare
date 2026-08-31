import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import type { SessionPatchRequest } from "../api/types";
import { photosQueryKey } from "./usePhotos";

export function sessionMetaQueryKey(sessionId: string) {
  return ["sessionMeta", sessionId] as const;
}

export function useSessionMeta(sessionId: string | undefined) {
  return useQuery({
    queryKey: sessionMetaQueryKey(sessionId ?? ""),
    queryFn: () => api.getSessionMeta(sessionId!),
    enabled: !!sessionId,
  });
}

export function useUpdateSessionMeta(sessionId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: SessionPatchRequest) => api.patchSessionMeta(sessionId, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: sessionMetaQueryKey(sessionId) });
      // mode가 바뀌면 missing_compos(중간 슬롯 노출 여부)가 달라지므로 사진 목록도 갱신
      qc.invalidateQueries({ queryKey: photosQueryKey(sessionId) });
    },
  });
}
