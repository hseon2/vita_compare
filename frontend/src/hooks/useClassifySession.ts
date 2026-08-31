import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import { useWizardStore } from "../store/wizardStore";
import { photosQueryKey } from "./usePhotos";

export function useClassifySession(sessionId: string) {
  const qc = useQueryClient();
  const captureAiProposals = useWizardStore((s) => s.captureAiProposals);

  return useMutation({
    mutationFn: () => api.classifySession(sessionId),
    onSuccess: (res) => {
      const proposals: Record<string, { rotation_deg: number; crop_box: [number, number, number, number] }> = {};
      for (const p of res.photos) {
        if (p.compos_id > 0) {
          proposals[p.photo_id] = { rotation_deg: p.rotation_deg, crop_box: p.crop_box };
        }
      }
      captureAiProposals(proposals);
      qc.invalidateQueries({ queryKey: photosQueryKey(sessionId) });
    },
  });
}
