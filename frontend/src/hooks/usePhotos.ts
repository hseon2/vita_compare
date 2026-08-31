import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";

export function photosQueryKey(sessionId: string) {
  return ["photos", sessionId] as const;
}

export function usePhotos(sessionId: string | undefined) {
  return useQuery({
    queryKey: photosQueryKey(sessionId ?? ""),
    queryFn: () => api.getPhotos(sessionId!),
    enabled: !!sessionId,
  });
}
