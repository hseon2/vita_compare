import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import { photosQueryKey } from "./usePhotos";

export function useMovePhoto(sessionId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ photoId, direction }: { photoId: string; direction: "prev" | "next" }) =>
      api.movePhoto(sessionId, photoId, direction),
    onSuccess: () => qc.invalidateQueries({ queryKey: photosQueryKey(sessionId) }),
  });
}
