import { create } from "zustand";
import type { CropBox, Mode } from "../api/types";

interface AiProposal {
  rotation_deg: number;
  crop_box: CropBox;
}

interface WizardStore {
  // 세션 생성 전 폼 초안 (서버에 세션이 없으므로 여기서만 관리)
  patientName: string;
  mode: Mode;
  setPatientName: (v: string) => void;
  setMode: (v: Mode) => void;
  resetDraft: () => void;

  // 순수 UI 상태 - 새로고침 시 사라져도 데이터 정합성에 영향 없음
  guideOverlayVisible: boolean;
  toggleGuideOverlay: () => void;

  activeCropPhotoId: string | null;
  setActiveCropPhotoId: (id: string | null) => void;

  // POST /classify 직후 스냅샷 - "AI 값으로 되돌리기" 버튼용 (서버에 크롭 히스토리가 없어
  // 이 값이 유일한 되돌리기 수단이다. 새로고침하면 사라지는 것은 감수한 설계)
  aiProposals: Record<string, AiProposal>;
  captureAiProposal: (photoId: string, proposal: AiProposal) => void;
  captureAiProposals: (proposals: Record<string, AiProposal>) => void;
}

export const useWizardStore = create<WizardStore>((set) => ({
  patientName: "",
  mode: "standard",
  setPatientName: (v) => set({ patientName: v }),
  setMode: (v) => set({ mode: v }),
  resetDraft: () => set({ patientName: "", mode: "standard" }),

  guideOverlayVisible: true,
  toggleGuideOverlay: () => set((s) => ({ guideOverlayVisible: !s.guideOverlayVisible })),

  activeCropPhotoId: null,
  setActiveCropPhotoId: (id) => set({ activeCropPhotoId: id }),

  aiProposals: {},
  captureAiProposal: (photoId, proposal) =>
    set((s) => ({ aiProposals: { ...s.aiProposals, [photoId]: proposal } })),
  captureAiProposals: (proposals) =>
    set((s) => ({ aiProposals: { ...s.aiProposals, ...proposals } })),
}));
