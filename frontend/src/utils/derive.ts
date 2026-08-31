import type { Mode, PhotosGroupedResponse, SessionType } from "../api/types";

/** GET /photos에는 mode가 직접 없지만, missing_compos에 "mid" 키가 있으면 장기모드다
 * (backend/state/session_store.py의 _missing_compos는 long 모드일 때만 mid 키를 만든다). */
export function deriveModeFromPhotos(resp: PhotosGroupedResponse): Mode {
  return "mid" in resp.missing_compos ? "long" : "standard";
}

export function sessionTypesForMode(mode: Mode): SessionType[] {
  return mode === "long" ? ["start", "mid", "end"] : ["start", "end"];
}

// backend/config.py의 STANDARD_MODE_SET_PAIRING / LONG_MODE_SET_PAIRING 미러
export function getSetPairing(mode: Mode): Array<[SessionType, SessionType]> {
  return mode === "long" ? [["start", "mid"], ["mid", "end"]] : [["start", "end"]];
}

// "분류 확인" 화면은 폐지되고 CropAdjustPage의 갤러리 섹션으로 통합되었다 (구도 재지정 +
// 크롭/회전을 한 화면에서 처리).
export type WizardStep = "upload" | "crop" | "match" | "generate";

export const STEP_ORDER: Array<{ step: WizardStep; label: string; path: string }> = [
  { step: "upload", label: "업로드", path: "upload" },
  { step: "crop", label: "분류/크롭", path: "crop" },
  { step: "match", label: "매칭 확인", path: "match" },
  { step: "generate", label: "생성", path: "generate" },
];

export function computeReachability(
  resp: PhotosGroupedResponse | undefined,
): Record<WizardStep, boolean> {
  if (!resp) {
    return { upload: true, crop: false, match: false, generate: false };
  }
  const hasPhotos = resp.photos.length > 0;
  const classifiedPhotos = resp.photos.filter((p) => p.compos_id > 0);
  const anyClassified = classifiedPhotos.length > 0;
  const allConfirmed = anyClassified && classifiedPhotos.every((p) => p.manually_confirmed);

  return {
    upload: true,
    crop: hasPhotos,
    match: allConfirmed,
    generate: anyClassified,
  };
}
