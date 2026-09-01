import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import { photosQueryKey } from "./usePhotos";

export function useDeletePhoto(sessionId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (photoId: string) => api.deletePhoto(sessionId, photoId),
    onSuccess: () => qc.invalidateQueries({ queryKey: photosQueryKey(sessionId) }),
  });
}
