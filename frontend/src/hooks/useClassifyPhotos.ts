import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import { photosQueryKey } from "./usePhotos";

export function useClassifyPhotos(sessionId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.classifySession(sessionId),
    onSuccess: () => qc.invalidateQueries({ queryKey: photosQueryKey(sessionId) }),
  });
}
