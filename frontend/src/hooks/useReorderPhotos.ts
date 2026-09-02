import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import { photosQueryKey } from "./usePhotos";

export function useReorderPhotos(sessionId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (photoIds: string[]) => api.reorderPhotos(sessionId, photoIds),
    onSuccess: () => qc.invalidateQueries({ queryKey: photosQueryKey(sessionId) }),
  });
}
