import { create } from "zustand";
import type { Mode } from "../api/types";

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
}));
