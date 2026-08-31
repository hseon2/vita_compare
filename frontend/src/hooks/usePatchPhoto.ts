import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import type { PhotoPatchRequest } from "../api/types";
import { photosQueryKey } from "./usePhotos";

export function usePatchPhoto(sessionId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ photoId, patch }: { photoId: string; patch: PhotoPatchRequest }) =>
      api.patchPhoto(sessionId, photoId, patch),
    // crop.py의 sync_size(기본 true)가 동일 구도의 다른 session_type 사진까지 서버에서
    // 함께 갱신하므로, 부분 캐시 갱신 대신 항상 목록 전체를 refetch한다.
    onSuccess: () => qc.invalidateQueries({ queryKey: photosQueryKey(sessionId) }),
  });
}
