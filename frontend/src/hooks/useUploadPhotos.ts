import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import type { SessionType } from "../api/types";
import { photosQueryKey } from "./usePhotos";

export function useUploadPhotos(sessionId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      sessionType,
      sessionDate,
      files,
    }: {
      sessionType: SessionType;
      sessionDate: string | null;
      files: File[];
    }) => api.uploadPhotos(sessionId, sessionType, sessionDate, files),
    onSuccess: () => qc.invalidateQueries({ queryKey: photosQueryKey(sessionId) }),
  });
}
